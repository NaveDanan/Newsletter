var MAX_PRESENTATION_BYTES = 100 * 1024 * 1024;
var PREVIEW_DPI = 144;

function getPocketBaseDataDir() {
  return String($os.getenv('POCKETBASE_DATA_DIR') || '/pb_data').replace(/[\\/]+$/, '');
}

function joinPath() {
  var parts = [];

  for (var i = 0; i < arguments.length; i += 1) {
    var piece = String(arguments[i] || '').replace(/\\+/g, '/');
    if (!piece) {
      continue;
    }

    if (parts.length === 0) {
      parts.push(piece.replace(/[\\/]+$/, ''));
    } else {
      parts.push(piece.replace(/^\/+/, '').replace(/[\\/]+$/, ''));
    }
  }

  return parts.join('/');
}

function ensureDirectory(path) {
  $os.cmd('mkdir', '-p', path).output();
}

function removePath(path) {
  $os.cmd('rm', '-rf', path).output();
}

function copyFile(sourcePath, targetPath) {
  ensureDirectory(targetPath.replace(/\/[^\/]+$/, ''));
  $os.cmd('cp', sourcePath, targetPath).output();
}

function fileExists(path) {
  try {
    $os.cmd('test', '-f', path).output();
    return true;
  } catch (error) {
    return false;
  }
}

function sanitizeFileName(value, fallback) {
  var name = String(value || fallback || 'presentation.pptx')
    .replace(/[/\\]+/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return name || fallback || 'presentation.pptx';
}

function getUploadedFileName(file) {
  return sanitizeFileName(file && (file.originalName || file.name), 'presentation.pptx');
}

function getUploadedFileSize(file) {
  var candidates = [file && file.size, file && file.Size];
  for (var i = 0; i < candidates.length; i += 1) {
    var parsed = Number(candidates[i]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 0;
}

function isPptxUpload(file) {
  var name = getUploadedFileName(file).toLowerCase();
  var type = String(file && (file.type || file.contentType || file.ContentType) || '').toLowerCase();

  return /\.pptx?$/.test(name)
    || type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    || type === 'application/vnd.ms-powerpoint';
}

function uniqueStoredFileName(fileName) {
  var safe = sanitizeFileName(fileName, 'presentation.pptx');
  var dot = safe.lastIndexOf('.');
  var base = dot > 0 ? safe.slice(0, dot) : safe;
  var ext = dot > 0 ? safe.slice(dot).toLowerCase() : '.pptx';
  var suffix = String(Date.now()) + '-' + String(Math.floor(Math.random() * 1000000));

  return base.slice(0, 80) + '-' + suffix + ext;
}

function getTempDir() {
  return joinPath(
    String($os.tempDir() || '/tmp').replace(/[\\/]+$/, ''),
    'newsletter-pptx-' + String(Date.now()) + '-' + String(Math.floor(Math.random() * 1000000))
  );
}

function uploadFileToStorage(file, storageKey) {
  var fsys = $app.newFilesystem();
  try {
    fsys.uploadFile(file, storageKey);
  } finally {
    if (fsys && typeof fsys.close === 'function') {
      try { fsys.close(); } catch (_) {}
    }
  }
}

function writeUploadedFile(file, destinationPath) {
  var uploadKey = joinPath(
    '_newsletter_pptx_uploads',
    String(Date.now()) + '-' + String(Math.floor(Math.random() * 1000000)),
    getUploadedFileName(file)
  );
  var fsys = $app.newFilesystem();
  var uploadedPath = joinPath(getPocketBaseDataDir(), 'storage', uploadKey);

  try {
    fsys.uploadFile(file, uploadKey);
    copyFile(uploadedPath, destinationPath);
  } finally {
    try {
      fsys.deletePrefix('_newsletter_pptx_uploads/');
    } catch (error) {
      removePath(joinPath(getPocketBaseDataDir(), 'storage', '_newsletter_pptx_uploads'));
    }

    if (fsys && typeof fsys.close === 'function') {
      try { fsys.close(); } catch (_) {}
    }
  }
}

function parseStoredFileNames(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }

  var text = String(value || '').trim();
  if (!text) {
    return [];
  }

  if (text.charAt(0) === '[') {
    try {
      var parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch (error) {
      return [];
    }
  }

  return [text];
}

function getRecordValue(record, fieldName) {
  if (record && typeof record.get === 'function') {
    return record.get(fieldName);
  }

  return record ? record[fieldName] : null;
}

function updateNewsletterFields(app, newsletterId, fields) {
  var assignments = [];
  var params = { id: newsletterId };

  Object.keys(fields).forEach(function (fieldName) {
    assignments.push(fieldName + ' = {:' + fieldName + '}');
    params[fieldName] = fields[fieldName];
  });

  if (!assignments.length) {
    return;
  }

  app.db().newQuery(
    'UPDATE newsletters SET ' + assignments.join(', ') + ' WHERE id = {:id}'
  ).bind(params).execute();
}

function parseManifest(value) {
  if (!value) {
    return { version: 1, presentations: [] };
  }

  if (typeof value === 'object') {
    if (Array.isArray(value.presentations)) {
      return value;
    }

    return { version: 1, presentations: [] };
  }

  try {
    var parsed = JSON.parse(String(value));
    if (parsed && Array.isArray(parsed.presentations)) {
      return parsed;
    }
  } catch (error) {}

  return { version: 1, presentations: [] };
}

function getSofficeBinary() {
  return String($os.getenv('PPTX_SOFFICE_BIN') || 'soffice').trim() || 'soffice';
}

function getPdftoppmBinary() {
  return String($os.getenv('PPTX_PDFTOPPM_BIN') || 'pdftoppm').trim() || 'pdftoppm';
}

function outputToString(value) {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(function (code) {
      return String.fromCharCode(Number(code) || 0);
    }).join('');
  }

  if (typeof value === 'object' && typeof value.length === 'number') {
    var chars = [];
    for (var i = 0; i < value.length; i += 1) {
      chars.push(String.fromCharCode(Number(value[i]) || 0));
    }
    return chars.join('');
  }

  try {
    var encoded = JSON.stringify(value);
    if (/^\[\d+(,\d+)*\]$/.test(encoded)) {
      return JSON.parse(encoded).map(function (code) {
        return String.fromCharCode(Number(code) || 0);
      }).join('');
    }
  } catch (error) {}

  return String(value);
}

function runCommand(binary, args, label) {
  try {
    var cmd = $os.cmd.apply($os, [binary].concat(args));
    var output = outputToString(cmd.combinedOutput()).trim();
    if (output) {
      console.log(label + ': ' + output);
    }
  } catch (error) {
    throw new Error(label + ' failed: ' + (error && error.message ? error.message : String(error)));
  }
}

function listPngFiles(dir) {
  var output = outputToString($os.cmd('sh', '-c', 'find "$1" -maxdepth 1 -type f -name "slide-*.png"', 'sh', dir).output());
  var files = output.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);

  files.sort(function (a, b) {
    var aMatch = a.match(/slide-(\d+)\.png$/);
    var bMatch = b.match(/slide-(\d+)\.png$/);
    var aNum = aMatch ? Number(aMatch[1]) : 0;
    var bNum = bMatch ? Number(bMatch[1]) : 0;
    return aNum - bNum;
  });

  return files;
}

function findConvertedPdf(sourcePath, tempDir) {
  var expectedPath = sourcePath.replace(/\.[^.]+$/, '.pdf');
  if (fileExists(expectedPath)) {
    return expectedPath;
  }

  var output = outputToString($os.cmd('sh', '-c', 'find "$1" -maxdepth 1 -type f -name "*.pdf" | head -n 1', 'sh', tempDir).output()).trim();
  if (output && fileExists(output)) {
    return output;
  }

  throw new Error('LibreOffice did not produce a PDF file.');
}

function convertPresentationToPreviews(sourcePath, tempDir) {
  runCommand(getSofficeBinary(), [
    '--headless',
    '--nologo',
    '--nofirststartwizard',
    '--convert-to',
    'pdf',
    '--outdir',
    tempDir,
    sourcePath,
  ], 'PowerPoint to PDF conversion');

  var pdfPath = findConvertedPdf(sourcePath, tempDir);
  runCommand(getPdftoppmBinary(), [
    '-png',
    '-r',
    String(PREVIEW_DPI),
    pdfPath,
    joinPath(tempDir, 'slide'),
  ], 'PDF slide rendering');

  return listPngFiles(tempDir);
}

function collectionHasField(collection, fieldName) {
  var fields = collection && collection.fields ? collection.fields : [];
  for (var i = 0; i < fields.length; i += 1) {
    if (String(fields[i].name || '') === fieldName) {
      return true;
    }
  }

  return false;
}

function canEditNewsletter(auth, record) {
  if (!auth) {
    return false;
  }

  var role = auth.getString('role');
  if (role === 'admin') {
    return true;
  }

  if (role !== 'author' && role !== 'manager' && role !== 'general_manager') {
    return false;
  }

  return Boolean(auth.id && record.getString('createdById') && auth.id === record.getString('createdById'));
}

function uploadPresentation(e) {
  var body = e.requestInfo().body || {};
  var newsletterId = String(body.newsletterId || '').trim();
  var files = e.findUploadedFiles('presentationFile');

  if (!newsletterId) {
    console.warn('PowerPoint upload rejected: missing newsletterId form field.');
    throw new BadRequestError('A newsletterId is required.');
  }

  if (!files || !files.length) {
    console.warn('PowerPoint upload rejected: missing presentationFile upload field.');
    throw new BadRequestError('Upload a PowerPoint file first.');
  }

  var file = files[0];
  var uploadedSize = getUploadedFileSize(file);

  if (!isPptxUpload(file)) {
    console.warn('PowerPoint upload rejected: unsupported file type/name: ' + getUploadedFileName(file));
    throw new BadRequestError('Only PowerPoint .pptx files are supported.');
  }

  if (uploadedSize > MAX_PRESENTATION_BYTES) {
    console.warn('PowerPoint upload rejected: file too large: ' + String(uploadedSize));
    throw new BadRequestError('PowerPoint files must be 100 MB or smaller.');
  }

  var record = e.app.findRecordById('newsletters', newsletterId);
  if (!canEditNewsletter(e.auth, record)) {
    throw new ForbiddenError('You do not have permission to upload a presentation for this newsletter.');
  }

  var collection = e.app.findCollectionByNameOrId('newsletters');
  var hasPreviewFilesField = collectionHasField(collection, 'presentationPreviewFiles');
  var hasPreviewManifestField = collectionHasField(collection, 'presentationPreviewManifest');
  var storageDir = joinPath(getPocketBaseDataDir(), 'storage', String(collection.id), record.id);
  var originalFileName = uniqueStoredFileName(getUploadedFileName(file));
  var originalStorageKey = joinPath(String(collection.id), record.id, originalFileName);
  var tempDir = getTempDir();
  var sourceExt = /\.ppt$/i.test(getUploadedFileName(file)) ? '.ppt' : '.pptx';
  var sourcePath = joinPath(tempDir, 'source' + sourceExt);
  var previewFileNames = [];
  var status = 'ready';
  var errorMessage = '';

  ensureDirectory(tempDir);

  uploadFileToStorage(file, originalStorageKey);
  var presentationFiles = parseStoredFileNames(getRecordValue(record, 'presentationFiles'));
  presentationFiles.push(originalFileName);
  updateNewsletterFields(e.app, newsletterId, {
    presentationFiles: JSON.stringify(presentationFiles),
  });

  try {
    writeUploadedFile(file, sourcePath);

    var renderedSlides = convertPresentationToPreviews(sourcePath, tempDir);
    for (var i = 0; i < renderedSlides.length; i += 1) {
      var previewName = originalFileName.replace(/\.[^.]+$/, '') + '-slide-' + String(i + 1).padStart(3, '0') + '.png';
      copyFile(renderedSlides[i], joinPath(storageDir, previewName));
      previewFileNames.push(previewName);
    }

    if (!previewFileNames.length) {
      status = 'failed';
      errorMessage = 'The presentation was uploaded, but no slide previews were generated.';
    }
  } catch (error) {
    status = 'failed';
    errorMessage = error && error.message ? String(error.message) : String(error);
    console.error('PowerPoint preview generation failed:', errorMessage);
  } finally {
    removePath(tempDir);
  }

  if (hasPreviewFilesField || hasPreviewManifestField) {
    try {
      record = e.app.findRecordById('newsletters', newsletterId);
      var metadataPatch = {};

      if (hasPreviewFilesField) {
        var previewFiles = parseStoredFileNames(getRecordValue(record, 'presentationPreviewFiles'));
        Array.prototype.push.apply(previewFiles, previewFileNames);
        metadataPatch.presentationPreviewFiles = JSON.stringify(previewFiles);
      }

      if (hasPreviewManifestField) {
        var manifest = parseManifest(getRecordValue(record, 'presentationPreviewManifest'));
        var entry = {
          sourceFileName: originalFileName,
          title: getUploadedFileName(file),
          status: status,
          slideCount: previewFileNames.length,
          previewFiles: previewFileNames,
          createdAt: new Date().toISOString(),
        };
        if (errorMessage) {
          entry.error = errorMessage;
        }
        manifest.presentations.push(entry);
        metadataPatch.presentationPreviewManifest = JSON.stringify(manifest);
      }

      updateNewsletterFields(e.app, newsletterId, metadataPatch);
    } catch (metadataError) {
      status = 'failed';
      errorMessage = 'The presentation was uploaded, but preview metadata could not be saved: '
        + (metadataError && metadataError.message ? String(metadataError.message) : String(metadataError));
      console.error('PowerPoint preview metadata save failed:', errorMessage);
    }
  }

  return e.json(200, {
    status: status,
    fileName: originalFileName,
    previewFiles: previewFileNames,
    slideCount: previewFileNames.length,
    error: errorMessage,
  });
}

module.exports = {
  uploadPresentation: uploadPresentation,
};
