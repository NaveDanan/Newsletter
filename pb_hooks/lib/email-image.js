// Email-safe <img> markup that keeps the image's aspect ratio in every client.
//
// Outlook for Windows ignores CSS `height:auto` and `max-width`. Given only a
// width attribute it keeps the image's original pixel height, which stretches
// the picture. Both width and height attributes are therefore computed from
// the image's real dimensions; modern clients still follow the fluid CSS.

var BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
var DATA_URL_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,/i;
var HEADER_PROBE_BYTES = 65536;
var REMOTE_TIMEOUT_SECONDS = 10;
var MAX_CACHE_ENTRIES = 64;
// Pixels per displayed pixel: sharp on 125-150% Windows scaling, still small.
var EMAIL_IMAGE_SCALE = 1.5;
var sizeCache = {};
var sizeCacheCount = 0;

function decodeBase64(encoded, maxBytes) {
  var bytes = [];
  var bits = 0;
  var buffer = 0;
  var limit = maxBytes > 0 ? maxBytes : Infinity;

  for (var index = 0; index < encoded.length && bytes.length < limit; index += 1) {
    var char = encoded.charAt(index);
    if (char === '=') break;
    var value = BASE64_ALPHABET.indexOf(char);
    if (value === -1) continue;
    buffer = ((buffer << 6) | value) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }

  return bytes;
}

function readUint16BE(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint16LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32BE(bytes, offset) {
  return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function readInt32LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
}

function readUint24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function matches(bytes, offset, ascii) {
  for (var i = 0; i < ascii.length; i += 1) {
    if (bytes[offset + i] !== ascii.charCodeAt(i)) return false;
  }
  return true;
}

// EXIF orientations 5-8 rotate the picture by 90 degrees, so browsers show it
// with width and height swapped.
function readExifOrientation(bytes, start, end) {
  if (!matches(bytes, start, 'Exif\0\0')) return 1;
  var tiff = start + 6;
  var littleEndian = matches(bytes, tiff, 'II');
  if (!littleEndian && !matches(bytes, tiff, 'MM')) return 1;
  var read16 = littleEndian ? readUint16LE : readUint16BE;
  var read32 = function (offset) {
    return littleEndian ? readInt32LE(bytes, offset) >>> 0 : readUint32BE(bytes, offset);
  };
  var ifd = tiff + read32(tiff + 4);
  if (ifd + 2 > end) return 1;
  var entries = read16(bytes, ifd);

  for (var i = 0; i < entries; i += 1) {
    var entry = ifd + 2 + i * 12;
    if (entry + 12 > end) break;
    if (read16(bytes, entry) === 0x0112) {
      return read16(bytes, entry + 8);
    }
  }

  return 1;
}

function readJpegSize(bytes) {
  var offset = 2;
  var orientation = 1;

  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    var marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    var length = readUint16BE(bytes, offset + 2);
    if (length < 2) return null;

    if (marker === 0xe1) {
      orientation = readExifOrientation(bytes, offset + 4, Math.min(bytes.length, offset + 2 + length));
    }

    var isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      var height = readUint16BE(bytes, offset + 5);
      var width = readUint16BE(bytes, offset + 7);
      return orientation >= 5 && orientation <= 8
        ? { width: height, height: width }
        : { width: width, height: height };
    }

    offset += 2 + length;
  }

  return null;
}

function readImageSize(bytes) {
  if (!bytes || bytes.length < 24) return null;

  if (bytes[0] === 0x89 && matches(bytes, 1, 'PNG') && matches(bytes, 12, 'IHDR')) {
    return { width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20) };
  }

  if (matches(bytes, 0, 'GIF8')) {
    return { width: readUint16LE(bytes, 6), height: readUint16LE(bytes, 8) };
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return readJpegSize(bytes);
  }

  if (matches(bytes, 0, 'RIFF') && matches(bytes, 8, 'WEBP') && bytes.length >= 30) {
    if (matches(bytes, 12, 'VP8 ')) {
      return { width: readUint16LE(bytes, 26) & 0x3fff, height: readUint16LE(bytes, 28) & 0x3fff };
    }
    if (matches(bytes, 12, 'VP8L')) {
      var b0 = bytes[21];
      var b1 = bytes[22];
      var b2 = bytes[23];
      var b3 = bytes[24];
      return {
        width: 1 + (((b1 & 0x3f) << 8) | b0),
        height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
      };
    }
    if (matches(bytes, 12, 'VP8X')) {
      return { width: 1 + readUint24LE(bytes, 24), height: 1 + readUint24LE(bytes, 27) };
    }
  }

  if (matches(bytes, 0, 'BM')) {
    // Bottom-up bitmaps store a negative height.
    return { width: Math.abs(readInt32LE(bytes, 18)), height: Math.abs(readInt32LE(bytes, 22)) };
  }

  return null;
}

function isValidSize(size) {
  return Boolean(size && size.width > 0 && size.height > 0 && isFinite(size.width) && isFinite(size.height));
}

function readDataUrlSize(dataUrl) {
  var encoded = dataUrl.slice(dataUrl.indexOf(',') + 1);
  var size = readImageSize(decodeBase64(encoded, HEADER_PROBE_BYTES));
  if (isValidSize(size)) return size;

  // Large EXIF/ICC blocks can push a JPEG's frame header past the probe.
  size = readImageSize(decodeBase64(encoded, 0));
  return isValidSize(size) ? size : null;
}

function bodyToBytes(body) {
  if (!body) return [];
  if (typeof body === 'string') {
    var fromString = [];
    for (var i = 0; i < body.length; i += 1) fromString.push(body.charCodeAt(i) & 255);
    return fromString;
  }

  var bytes = [];
  for (var j = 0; j < body.length; j += 1) bytes.push(Number(body[j]) & 255);
  return bytes;
}

function readRemoteSize(url) {
  if (typeof $http === 'undefined' || !/^https?:\/\//i.test(url)) return null;

  try {
    var response = $http.send({ url: url, method: 'GET', timeout: REMOTE_TIMEOUT_SECONDS });
    if (!response || response.statusCode >= 400) return null;
    var size = readImageSize(bodyToBytes(response.body));
    return isValidSize(size) ? size : null;
  } catch (error) {
    console.error('Failed to read email image dimensions from ' + url + ':', error);
    return null;
  }
}

// Root-relative paths (/api/newsletters/...) cannot load inside a mail client.
function toAbsoluteUrl(src, baseUrl) {
  if (!src || DATA_URL_PATTERN.test(src) || /^https?:\/\//i.test(src)) return src;
  if (src.charAt(0) === '/' && src.charAt(1) !== '/' && baseUrl) return baseUrl + src;
  if (src.indexOf('//') === 0) return 'https:' + src;
  return src;
}

function getImageSize(src, cacheKey) {
  var key = cacheKey || (src.length > 256 ? src.slice(0, 128) + ':' + src.length + ':' + src.slice(-128) : src);
  if (Object.prototype.hasOwnProperty.call(sizeCache, key)) return sizeCache[key];

  var size = DATA_URL_PATTERN.test(src) ? readDataUrlSize(src) : readRemoteSize(src);

  if (sizeCacheCount >= MAX_CACHE_ENTRIES) {
    sizeCache = {};
    sizeCacheCount = 0;
  }
  sizeCache[key] = size;
  sizeCacheCount += 1;

  return size;
}

// Fit the natural size inside maxWidth without upscaling, keeping the ratio.
function fitSize(size, maxWidth) {
  var width = Math.min(Math.round(size.width), maxWidth);
  var height = Math.max(1, Math.round(width * size.height / size.width));
  return { width: width, height: height };
}

function escapeAttribute(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getNodeBinary() {
  return String($os.getenv('NODE_BINARY') || $os.getenv('NODE_BIN') || 'node').trim() || 'node';
}

function readCompressedMeta(output) {
  try {
    $os.stat(output);
    var meta = JSON.parse(toString($os.readFile(output + '.json')));
    if (!meta.width || !meta.height) {
      // The worker kept the original bytes; measure them here.
      var size = readImageSize(bodyToBytes($os.readFile(output)));
      if (!isValidSize(size)) return null;
      meta.width = size.width;
      meta.height = size.height;
    }
    return meta;
  } catch (_) {
    return null;
  }
}

// Shrinks the image to pixelWidth and re-encodes it as a small JPEG with
// scripts/pocketbase/email-image.mjs. Results are cached on disk by source and
// width, so a send to many subscribers compresses each image once.
function compressImage(app, src, pixelWidth) {
  var directory = $filepath.join(app.dataDir(), 'email-image-cache');
  $os.mkdirAll(directory, 448);
  var key = $security.sha256(src + '|' + pixelWidth + '|v1');
  var output = $filepath.join(directory, key);
  var meta = readCompressedMeta(output);

  // An uncompressed fallback (ImageMagick missing or failing) is retried on
  // the next run instead of being reused forever.
  if (!meta || !meta.compressed) {
    var input = output + '-' + $security.randomString(12) + '.input';
    $os.writeFile(input, src, 384);
    try {
      var worker = String($os.getenv('APP_ROOT') || __hooks + '/..') + '/scripts/pocketbase/email-image.mjs';
      $os.cmd(getNodeBinary(), worker, input, output, String(pixelWidth)).output();
    } finally {
      try { $os.remove(input); } catch (_) { /* Already removed. */ }
    }
    meta = readCompressedMeta(output);
  }

  if (!meta) return null;

  var extension = meta.type === 'image/png' ? '.png' : meta.type === 'image/gif' ? '.gif' : '.jpg';
  return {
    cid: 'img-' + key.slice(0, 24) + extension,
    path: output,
    type: meta.type,
    width: meta.width,
    height: meta.height,
  };
}

var preparedCache = {};
var preparedCacheCount = 0;

function prepareInlineImage(app, src, maxWidth, cacheKey) {
  var key = (cacheKey || src.slice(0, 256) + ':' + src.length) + ':' + maxWidth;
  if (Object.prototype.hasOwnProperty.call(preparedCache, key)) return preparedCache[key];

  var prepared = null;
  try {
    prepared = compressImage(app, src, Math.round(maxWidth * EMAIL_IMAGE_SCALE));
  } catch (error) {
    console.error('Failed to compress email image, embedding it uncompressed:', error);
  }

  if (preparedCacheCount >= MAX_CACHE_ENTRIES) {
    preparedCache = {};
    preparedCacheCount = 0;
  }
  preparedCache[key] = prepared;
  preparedCacheCount += 1;

  return prepared;
}

function buildImageTag(src, alt, size, maxWidth) {
  var baseStyle = 'display:block;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic';

  if (!size) {
    // Without known dimensions a lone width attribute would make Outlook
    // stretch the image, so let every client keep the natural proportions.
    return '<img src="' + escapeAttribute(src) + '" alt="' + (alt || '') + '" style="' + baseStyle + ';width:auto;max-width:100%;height:auto" />';
  }

  var fitted = fitSize(size, maxWidth);

  return '<img src="' + escapeAttribute(src) + '" alt="' + (alt || '') + '"'
    + ' width="' + fitted.width + '" height="' + fitted.height + '"'
    + ' style="' + baseStyle + ';width:100%;max-width:' + fitted.width + 'px;height:auto" />';
}

// options: { src, alt (already escaped), maxWidth, baseUrl, cacheKey, app, inlineImages }
//
// With `app` and an `inlineImages` array the image is compressed and sent as
// an inline (cid:) attachment, which older Outlook shows without blocking it
// or rejecting data: URLs. The attachment is pushed onto inlineImages for
// attachInlineImages(). Otherwise the original source is referenced directly.
function buildEmailImage(options) {
  var src = toAbsoluteUrl(String(options.src || '').trim(), options.baseUrl || '');
  if (!src) return '';

  var maxWidth = options.maxWidth || 600;

  if (options.app && options.inlineImages) {
    var prepared = prepareInlineImage(options.app, src, maxWidth, options.cacheKey);
    if (prepared) {
      var alreadyAttached = options.inlineImages.some(function (image) { return image.cid === prepared.cid; });
      if (!alreadyAttached) options.inlineImages.push(prepared);
      return buildImageTag('cid:' + prepared.cid, options.alt, prepared, maxWidth);
    }
  }

  return buildImageTag(src, options.alt, getImageSize(src, options.cacheKey), maxWidth);
}

// Opens a fresh reader per message (readers are consumed by sending). Call the
// returned function after sending to release the file handles.
function attachInlineImages(message, inlineImages) {
  var readers = [];
  var attachments = {};

  for (var i = 0; i < (inlineImages || []).length; i += 1) {
    var reader = $filesystem.fileFromPath(inlineImages[i].path).reader.open();
    readers.push(reader);
    attachments[inlineImages[i].cid] = reader;
  }

  if (readers.length) {
    message.inlineAttachments = attachments;
  }

  return function closeReaders() {
    for (var j = 0; j < readers.length; j += 1) {
      try { readers[j].close(); } catch (_) { /* Already closed. */ }
    }
  };
}

module.exports = {
  attachInlineImages: attachInlineImages,
  buildEmailImage: buildEmailImage,
  decodeBase64: decodeBase64,
  fitSize: fitSize,
  readImageSize: readImageSize,
  toAbsoluteUrl: toAbsoluteUrl,
};
