// Compress a newsletter image for email delivery.
//
// Usage: node email-image.mjs <source-file> <output-file> <max-width>
// <source-file> holds a data URL or an http(s) URL. The worker writes the
// compressed JPEG to <output-file> and {"width","height","type"} to
// <output-file>.json; a zero size means the hook measures the image. Without ImageMagick the original browser-format bytes
// are kept so the email still carries the image.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const policyDirectory = fileURLToPath(new URL('../../docker/imagemagick-email/', import.meta.url));
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
// Inbox storage matters more than pixel density: aim for ~150 KB per image.
const JPEG_TARGET_SIZE = '150kb';
const MAX_CACHE_FILES = 256;

const [sourceFile, output, maxWidthArg] = process.argv.slice(2);
const maxWidth = Math.max(16, Math.min(4000, Math.floor(Number(maxWidthArg) || 0)));
if (!sourceFile || !output || !maxWidthArg) throw new Error('Usage: email-image.mjs <source-file> <output-file> <max-width>');

async function readSourceBytes(source) {
  const dataUrl = source.match(/^data:image\/[a-z0-9.+-]+;base64,([\s\S]*)$/i);
  if (dataUrl) return Buffer.from(dataUrl[1].replace(/\s+/g, ''), 'base64');

  if (!/^https?:\/\//i.test(source)) throw new Error('Unsupported image source.');
  const response = await fetch(source, { signal: AbortSignal.timeout(15000), redirect: 'follow' });
  if (!response.ok) throw new Error(`Image download failed with HTTP ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_SOURCE_BYTES) throw new Error('Image exceeds 25 MB.');
  return bytes;
}

function browserType(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif';
  return '';
}

function runMagick(args, input) {
  return new Promise((resolve, reject) => {
    mkdtemp(path.join(tmpdir(), 'newsletter-email-image-')).then((temporaryDirectory) => {
      const child = execFile('magick', args, {
        encoding: 'buffer', timeout: 30000, killSignal: 'SIGKILL', maxBuffer: 20 * 1024 * 1024,
        env: { ...process.env, MAGICK_CONFIGURE_PATH: policyDirectory, MAGICK_TEMPORARY_PATH: temporaryDirectory },
        windowsHide: true,
      }, (error, stdout) => {
        rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
        if (error) reject(error);
        else resolve(stdout);
      });
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    }, reject);
  });
}

async function compress(bytes) {
  // First frame only, EXIF rotation applied, transparency flattened on white
  // (old Outlook has no alpha), shrunk but never enlarged, metadata removed.
  const jpeg = await runMagick([
    '-[0]', '-auto-orient', '-background', 'white', '-alpha', 'remove', '-alpha', 'off',
    '-resize', `${maxWidth}x>`, '-strip', '-colorspace', 'sRGB', '-sampling-factor', '4:2:0',
    '-interlace', 'none', '-quality', '82', '-define', `jpeg:extent=${JPEG_TARGET_SIZE}`, 'jpg:-',
  ], bytes);
  if (!(jpeg[0] === 0xff && jpeg[1] === 0xd8)) throw new Error('ImageMagick did not return a JPEG.');
  // A zero size tells the PocketBase hook to measure the JPEG itself.
  return { bytes: jpeg, type: 'image/jpeg', width: 0, height: 0, compressed: true };
}

async function pruneCache(directory) {
  const files = (await readdir(directory)).filter((name) => /^[a-f0-9]{64}$/.test(name));
  if (files.length <= MAX_CACHE_FILES) return;
  const entries = await Promise.all(files.map(async (name) => ({ name, time: (await stat(path.join(directory, name)).catch(() => ({ mtimeMs: 0 }))).mtimeMs })));
  entries.sort((a, b) => b.time - a.time);
  await Promise.all(entries.slice(MAX_CACHE_FILES).flatMap((item) => [
    unlink(path.join(directory, item.name)).catch(() => {}),
    unlink(path.join(directory, item.name + '.json')).catch(() => {}),
  ]));
}

const source = (await readFile(sourceFile, 'utf8')).trim();
const original = await readSourceBytes(source);
let result;

try {
  result = await compress(original);
} catch (error) {
  const type = browserType(original);
  if (!type) throw new Error('Image could not be compressed: ' + (error && error.message ? error.message : error));
  console.error('ImageMagick unavailable, attaching the original image:', error && error.message ? error.message : error);
  result = { bytes: original, type, width: 0, height: 0, compressed: false };
}

const temporary = `${output}.${process.pid}.tmp`;
await writeFile(temporary, result.bytes, { mode: 0o600 });
await rename(temporary, output);
await writeFile(output + '.json', JSON.stringify({ width: result.width, height: result.height, type: result.type, bytes: result.bytes.length, compressed: result.compressed }), { mode: 0o600 });
await pruneCache(path.dirname(output));
