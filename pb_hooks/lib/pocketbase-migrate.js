function getPocketBaseDataDir() {
  return String($os.getenv('POCKETBASE_DATA_DIR') || '/pb_data').replace(/[\\/]+$/, '');
}

function getTempImportDir() {
  return String($os.tempDir() || '/tmp').replace(/[\\/]+$/, '') + '/newsletter-migrate-' + String(Date.now()) + '-' + String(Math.floor(Math.random() * 1000000));
}

function normalizeNewsletterTextAlignment(value) {
  if (value === 'left' || value === 'center' || value === 'right') {
    return value;
  }

  return '';
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<img\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferNewsletterTextAlignment(html) {
  var counts = {
    left: 0,
    center: 0,
    right: 0,
  };
  var stylePattern = /text-align\s*:\s*(left|center|right|justify)\b/gi;
  var match = null;

  while ((match = stylePattern.exec(String(html || ''))) !== null) {
    var value = String(match[1] || '').toLowerCase();
    if (value === 'left' || value === 'center' || value === 'right') {
      counts[value] += 1;
    }
  }

  var highestCount = Math.max(counts.left, counts.center, counts.right);
  if (highestCount > 0) {
    if (counts.center === highestCount && counts.center > counts.left && counts.center > counts.right) {
      return 'center';
    }

    if (counts.right === highestCount && counts.right > counts.left) {
      return 'right';
    }

    if (counts.left === highestCount && counts.left > counts.right) {
      return 'left';
    }
  }

  var directionMatches = Array.from(String(html || '').matchAll(/\bdir\s*=\s*["']?(rtl|ltr)\b/gi));
  var lastDirection = directionMatches.length > 0
    ? String(directionMatches[directionMatches.length - 1][1] || '').toLowerCase()
    : '';

  if (lastDirection === 'rtl') {
    return 'right';
  }

  if (lastDirection === 'ltr') {
    return 'left';
  }

  return /[\u0590-\u08FF\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(stripHtml(html)) ? 'right' : 'left';
}

function normalizeRelativePath(value) {
  var normalized = String(value || '').replace(/\\+/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');

  if (!normalized || normalized.indexOf('..') !== -1) {
    throw new BadRequestError('Invalid uploaded file path.');
  }

  return normalized;
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

function writeUploadedFile(file, destinationPath) {
  var uploadKey = joinPath(
    '_newsletter_migrate_uploads',
    String(Date.now()) + '-' + String(Math.floor(Math.random() * 1000000)),
    normalizeRelativePath(file.originalName || file.name)
  );
  var fsys = $app.newFilesystem();
  var uploadedPath = joinPath(getPocketBaseDataDir(), 'storage', uploadKey);

  try {
    fsys.uploadFile(file, uploadKey);
    copyFile(uploadedPath, destinationPath);
  } finally {
    try {
      fsys.deletePrefix('_newsletter_migrate_uploads/');
    } catch (error) {
      removePath(joinPath(getPocketBaseDataDir(), 'storage', '_newsletter_migrate_uploads'));
    }

    if (fsys && typeof fsys.close === 'function') {
      try {
        fsys.close();
      } catch (error) {
        // Ignore cleanup failures after the source upload has already been copied.
      }
    }
  }
}

function createSourceDbAlias() {
  return 'source_db_' + String(Date.now()) + '_' + String(Math.floor(Math.random() * 1000000));
}

function getDataDbPathScore(relativePath) {
  var normalized = String(relativePath || '').toLowerCase();

  if (normalized === 'data.db') {
    return 0;
  }

  if (normalized === 'pb_data/data.db' || /\/pb_data\/data\.db$/i.test(normalized)) {
    return 1;
  }

  if (/\/data\.db$/i.test('/' + normalized)) {
    return normalized.split('/').length;
  }

  return Number.POSITIVE_INFINITY;
}

function shouldSkipUploadedSourceFile(relativePath) {
  return /\.attrs$/i.test(String(relativePath || ''));
}

function parseUploadedRelativePaths(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map(function (item) {
      return String(item || '');
    });
  }

  var text = String(value || '').trim();
  if (!text) {
    return [];
  }

  try {
    var parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map(function (item) {
        return String(item || '');
      });
    }
  } catch (error) {
    return [];
  }

  return [];
}

function getUploadedRelativePath(file, index, relativePaths) {
  return normalizeRelativePath(
    relativePaths && relativePaths[index]
      ? relativePaths[index]
      : file.originalName || file.name
  );
}

function quoteIdentifier(value) {
  return '"' + String(value).replace(/"/g, '""') + '"';
}

function quoteSqlString(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function schemaPrefix(schemaName) {
  return schemaName ? quoteIdentifier(String(schemaName).replace(/[^A-Za-z0-9_]/g, '')) + '.' : '';
}

function tableExists(db, tableName) {
  var row = new DynamicModel({ total: 0 });

  db.newQuery('SELECT COUNT(*) as total FROM sqlite_master WHERE type = \"table\" AND name = {:name}')
    .bind({ name: tableName })
    .one(row);

  return Number(row.total || 0) > 0;
}

function tableExistsInSchema(db, tableName, schemaName) {
  if (!schemaName) {
    return tableExists(db, tableName);
  }

  try {
    var row = new DynamicModel({ total: 0 });
    db.newQuery('SELECT COUNT(*) as total FROM ' + schemaPrefix(schemaName) + quoteIdentifier(tableName)).one(row);
    return true;
  } catch (error) {
    return false;
  }
}

function countRowsInSchema(db, tableName, schemaName) {
  if (!tableExistsInSchema(db, tableName, schemaName)) {
    return 0;
  }

  var row = new DynamicModel({ total: 0 });
  db.newQuery('SELECT COUNT(*) as total FROM ' + schemaPrefix(schemaName) + quoteIdentifier(tableName)).one(row);
  return Number(row.total || 0);
}

function countTargetRecords(app, collectionName) {
  try {
    return app.countRecords(collectionName);
  } catch (error) {
    return 0;
  }
}

function getTargetCounts(app) {
  return {
    projects: countTargetRecords(app, 'projects'),
    newsletters: countTargetRecords(app, 'newsletters'),
    users: countTargetRecords(app, 'users'),
    links: countTargetRecords(app, 'links'),
    navigationLinks: countTargetRecords(app, 'navigation_links'),
    dropdowns: countTargetRecords(app, 'nav_dropdowns'),
    subscribers: countTargetRecords(app, 'newsletter_subscribers'),
  };
}

function getSourceCounts(db, sourceDbAlias) {
  return {
    projects: countRowsInSchema(db, 'projects', sourceDbAlias),
    newsletters: countRowsInSchema(db, 'newsletters', sourceDbAlias),
    users: countRowsInSchema(db, 'users', sourceDbAlias),
    links: countRowsInSchema(db, 'links', sourceDbAlias),
    navigationLinks: countRowsInSchema(db, 'navigation_links', sourceDbAlias),
    dropdowns: countRowsInSchema(db, 'nav_dropdowns', sourceDbAlias),
    subscribers: countRowsInSchema(db, 'newsletter_subscribers', sourceDbAlias),
  };
}

function getCollectionIdMapFromDb(db, sourcePrefix) {
  var rows = arrayOf(new DynamicModel({ id: '', name: '' }));
  var sql = 'SELECT id, name FROM ' + sourcePrefix + quoteIdentifier('_collections') + ' WHERE name IN (\'users\', \'projects\', \'newsletters\', \'links\', \'navigation_links\', \'nav_dropdowns\', \'newsletter_subscribers\')';

  try {
    db.newQuery(sql).all(rows);
  } catch (error) {
    return {};
  }

  var map = {};
  for (var i = 0; i < rows.length; i += 1) {
    map[String(rows[i].name)] = String(rows[i].id);
  }

  return map;
}

function getTargetCollectionIdMap(app) {
  var names = ['users', 'projects', 'newsletters', 'links', 'navigation_links', 'nav_dropdowns', 'newsletter_subscribers'];
  var map = {};

  for (var i = 0; i < names.length; i += 1) {
    var collection = app.findCollectionByNameOrId(names[i]);
    map[names[i]] = String(collection.id);
  }

  return map;
}

function parseStoredFileNames(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  var text = String(value || '').trim();
  if (!text) {
    return [];
  }

  if (text.charAt(0) === '[') {
    try {
      var parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  return [text];
}

function listFileFieldRows(db, tableName, fieldName, sourceDbAlias) {
  if (!tableExistsInSchema(db, tableName, sourceDbAlias)) {
    return [];
  }

  var rows = arrayOf(new DynamicModel({ id: '', value: '' }));
  var sql = 'SELECT id, ' + quoteIdentifier(fieldName) + ' as value FROM ' + schemaPrefix(sourceDbAlias) + quoteIdentifier(tableName);
  db.newQuery(sql).all(rows);
  return rows;
}

function resetTargetStorage(targetCollectionIds) {
  var storageRoot = joinPath(getPocketBaseDataDir(), 'storage');
  ensureDirectory(storageRoot);

  var names = ['users', 'newsletters', 'links', 'navigation_links'];
  for (var i = 0; i < names.length; i += 1) {
    var collectionId = targetCollectionIds[names[i]];
    if (collectionId) {
      removePath(joinPath(storageRoot, collectionId));
    }
  }
}

function attachSourceDatabase(db, sourceDbPath, sourceDbAlias) {
  db.newQuery('ATTACH DATABASE ' + quoteSqlString(sourceDbPath) + ' AS ' + sourceDbAlias).execute();
}

function normalizeSourceDatabaseError(error) {
  var message = error && error.message ? String(error.message) : String(error);

  if (/database disk image is malformed|file is not a database|database is locked|not an error/i.test(message)) {
    return 'The selected PocketBase data.db could not be opened safely. Stop the source PocketBase server first, then select the complete pb_data folder again, including data.db, data.db-wal, data.db-shm, and storage. If this is a copied folder, recopy it after PocketBase is stopped or export a PocketBase backup and restore it before migrating.';
  }

  return message;
}

function detachSourceDatabase(db, sourceDbAlias, context) {
  try {
    db.newQuery('DETACH DATABASE ' + sourceDbAlias).execute();
  } catch (error) {
    console.warn('Failed to detach source database after ' + context + ':', error);
  }
}

function inspectSourceDatabase(sourceDbPath) {
  var result = null;
  var sourceDbAlias = createSourceDbAlias();

  try {
    $app.runInTransaction(function (txApp) {
      attachSourceDatabase(txApp.db(), sourceDbPath, sourceDbAlias);

      try {
        var integrity = new DynamicModel({ integrity_check: '' });
        txApp.db().newQuery('PRAGMA ' + sourceDbAlias + '.integrity_check').one(integrity);

        if (String(integrity.integrity_check || '') !== 'ok') {
          throw new BadRequestError(normalizeSourceDatabaseError('integrity_check failed: ' + String(integrity.integrity_check || 'unknown')));
        }

        result = {
          counts: getSourceCounts(txApp.db(), sourceDbAlias),
          collectionIds: getCollectionIdMapFromDb(txApp.db(), schemaPrefix(sourceDbAlias)),
          usersWithAdminRole: countRowsInSchema(txApp.db(), 'users', sourceDbAlias) > 0 ? countAdminUsersInSchema(txApp.db(), sourceDbAlias) : 0,
        };
      } finally {
        detachSourceDatabase(txApp.db(), sourceDbAlias, 'inspect');
      }
    });
  } catch (error) {
    throw new BadRequestError(normalizeSourceDatabaseError(error));
  }

  return result;
}

function copyStoredFiles(sourceDbPath, sourceStorageRoot, targetCollectionIds, sourceCollectionIds) {
  var issues = [];
  var sourceDbAlias = createSourceDbAlias();
  var fileSpecs = [
    { table: 'users', field: 'avatar' },
    { table: 'newsletters', field: 'presentationFiles' },
    { table: 'links', field: 'icon' },
    { table: 'navigation_links', field: 'icon' },
  ];
  var targetStorageRoot = joinPath(getPocketBaseDataDir(), 'storage');

  resetTargetStorage(targetCollectionIds);

  $app.runInTransaction(function (txApp) {
    attachSourceDatabase(txApp.db(), sourceDbPath, sourceDbAlias);

    try {
      for (var i = 0; i < fileSpecs.length; i += 1) {
        var spec = fileSpecs[i];
        var sourceCollectionId = sourceCollectionIds[spec.table];
        var targetCollectionId = targetCollectionIds[spec.table];

        if (!sourceCollectionId || !targetCollectionId) {
          continue;
        }

        var rows = listFileFieldRows(txApp.db(), spec.table, spec.field, sourceDbAlias);
        for (var j = 0; j < rows.length; j += 1) {
          var recordId = String(rows[j].id || '');
          var names = parseStoredFileNames(rows[j].value);

          for (var k = 0; k < names.length; k += 1) {
            var fileName = String(names[k] || '').trim();
            if (!fileName) {
              continue;
            }

            var sourcePath = joinPath(sourceStorageRoot, sourceCollectionId, recordId, fileName);
            var targetPath = joinPath(targetStorageRoot, targetCollectionId, recordId, fileName);

            try {
              copyFile(sourcePath, targetPath);
            } catch (error) {
              issues.push(spec.table + '/' + recordId + '/' + fileName + ': ' + error);
            }
          }
        }
      }
    } finally {
      detachSourceDatabase(txApp.db(), sourceDbAlias, 'storage copy');
    }
  });

  return issues;
}

function addCountMismatchIssues(issues, sourceCounts, afterCounts) {
  var keys = ['projects', 'newsletters', 'users', 'links', 'navigationLinks', 'dropdowns', 'subscribers'];

  for (var i = 0; i < keys.length; i += 1) {
    var key = keys[i];
    var sourceCount = Number(sourceCounts[key] || 0);
    var afterCount = Number(afterCounts[key] || 0);

    if (sourceCount !== afterCount) {
      issues.push(key + ': imported ' + afterCount + ' of ' + sourceCount + ' source records');
    }
  }
}

function saveImportedFolder(files, relativePathValue) {
  if (!files || !files.length) {
    throw new BadRequestError('Select a PocketBase pb_data folder first.');
  }

  var tempDir = getTempImportDir();
  ensureDirectory(tempDir);

  var sourceDbPath = '';
  var sourceDbScore = Number.POSITIVE_INFINITY;
  var relativePaths = parseUploadedRelativePaths(relativePathValue);

  for (var i = 0; i < files.length; i += 1) {
    var file = files[i];
    var relativePath = getUploadedRelativePath(file, i, relativePaths);

    if (shouldSkipUploadedSourceFile(relativePath)) {
      continue;
    }

    var destinationPath = joinPath(tempDir, relativePath);
    ensureDirectory(destinationPath.replace(/\/[^\/]+$/, ''));
    writeUploadedFile(file, destinationPath);

    var dbPathScore = getDataDbPathScore(relativePath);
    if (dbPathScore < sourceDbScore) {
      sourceDbPath = destinationPath;
      sourceDbScore = dbPathScore;
    }
  }

  if (!sourceDbPath) {
    throw new BadRequestError('The selected folder must include a data.db file from PocketBase pb_data.');
  }

  return {
    tempDir: tempDir,
    sourceDbPath: sourceDbPath,
    sourceStorageRoot: joinPath(sourceDbPath.replace(/\/data\.db$/i, ''), 'storage'),
  };
}

function countAdminUsersInSchema(db, schemaName) {
  if (!tableExistsInSchema(db, 'users', schemaName)) {
    return 0;
  }

  var row = new DynamicModel({ total: 0 });
  db.newQuery('SELECT COUNT(*) as total FROM ' + schemaPrefix(schemaName) + quoteIdentifier('users') + ' WHERE role = \"admin\"').one(row);
  return Number(row.total || 0);
}

function executeDelete(txApp, tableName) {
  txApp.db().newQuery('DELETE FROM ' + quoteIdentifier(tableName)).execute();
}

function tableExistsSource(db, tableName, sourceDbAlias) {
  return tableExistsInSchema(db, tableName, sourceDbAlias);
}

function getTableColumns(db, tableName, schemaName) {
  var rows = arrayOf(new DynamicModel({ name: '' }));
  var prefix = schemaName ? String(schemaName).replace(/[^A-Za-z0-9_]/g, '') + '.' : '';
  db.newQuery('PRAGMA ' + prefix + 'table_info(' + quoteIdentifier(tableName) + ')').all(rows);

  var columns = [];
  for (var i = 0; i < rows.length; i += 1) {
    var name = String(rows[i].name || '').trim();
    if (name) {
      columns.push(name);
    }
  }

  return columns;
}

function getCommonColumns(db, tableName, sourceDbAlias) {
  var targetColumns = getTableColumns(db, tableName, '');
  var sourceColumns = getTableColumns(db, tableName, sourceDbAlias);
  var sourceLookup = {};
  var common = [];

  for (var i = 0; i < sourceColumns.length; i += 1) {
    sourceLookup[sourceColumns[i]] = true;
  }

  for (var j = 0; j < targetColumns.length; j += 1) {
    if (sourceLookup[targetColumns[j]]) {
      common.push(targetColumns[j]);
    }
  }

  return common;
}

function executeInsertFromSource(txApp, tableName, sourceDbAlias) {
  var columns = getCommonColumns(txApp.db(), tableName, sourceDbAlias);
  if (columns.length === 0) {
    return;
  }

  var quotedColumns = [];
  for (var i = 0; i < columns.length; i += 1) {
    quotedColumns.push(quoteIdentifier(columns[i]));
  }

  txApp.db().newQuery(
    'INSERT INTO ' + quoteIdentifier(tableName) + ' (' + quotedColumns.join(', ') + ') ' +
    'SELECT ' + quotedColumns.join(', ') + ' FROM ' + schemaPrefix(sourceDbAlias) + quoteIdentifier(tableName)
  ).execute();
}

function backfillNewsletterTextAlignment(txApp) {
  var rows = arrayOf(new DynamicModel({ id: '', content: '', textAlignment: '' }));

  if (!tableExists(txApp.db(), 'newsletters')) {
    return;
  }

  txApp.db().newQuery(
    'SELECT id, content, textAlignment FROM ' + quoteIdentifier('newsletters')
  ).all(rows);

  for (var i = 0; i < rows.length; i += 1) {
    var row = rows[i];
    var storedAlignment = normalizeNewsletterTextAlignment(String(row.textAlignment || '').trim().toLowerCase());

    if (storedAlignment) {
      continue;
    }

    txApp.db().newQuery(
      'UPDATE ' + quoteIdentifier('newsletters') + ' SET ' + quoteIdentifier('textAlignment') + ' = {:textAlignment} WHERE id = {:id}'
    ).bind({
      id: String(row.id || ''),
      textAlignment: inferNewsletterTextAlignment(String(row.content || '')),
    }).execute();
  }
}

function executeInsertAuthTableFromSource(txApp, tableName, sourceUsersCollectionId, targetUsersCollectionId, sourceDbAlias) {
  var columns = getCommonColumns(txApp.db(), tableName, sourceDbAlias);
  if (columns.length === 0 || columns.indexOf('collectionRef') === -1) {
    return;
  }

  var targetColumns = [];
  var selectColumns = [];

  for (var i = 0; i < columns.length; i += 1) {
    targetColumns.push(quoteIdentifier(columns[i]));
    if (columns[i] === 'collectionRef') {
      selectColumns.push('{:targetUsersCollectionId} AS "collectionRef"');
    } else {
      selectColumns.push(quoteIdentifier(columns[i]));
    }
  }

  txApp.db().newQuery(
    'INSERT INTO ' + quoteIdentifier(tableName) + ' (' + targetColumns.join(', ') + ') ' +
    'SELECT ' + selectColumns.join(', ') + ' FROM ' + schemaPrefix(sourceDbAlias) + quoteIdentifier(tableName) + ' WHERE "collectionRef" = {:sourceUsersCollectionId}'
  ).bind({
    sourceUsersCollectionId: sourceUsersCollectionId,
    targetUsersCollectionId: targetUsersCollectionId,
  }).execute();
}

function performImport(sourceDbPath, sourceStorageRoot) {
  var sourceSummary = inspectSourceDatabase(sourceDbPath);
  var sourceCounts = sourceSummary.counts;
  var sourceCollectionIds = sourceSummary.collectionIds;
  var adminUsers = sourceSummary.usersWithAdminRole;
  var targetCollectionIds = getTargetCollectionIdMap($app);
  var beforeCounts = getTargetCounts($app);
  var tablesToClear = ['_authOrigins', '_externalAuths', '_mfas', '_otps', 'newsletter_subscribers', 'navigation_links', 'nav_dropdowns', 'links', 'newsletters', 'projects', 'users'];
  var authTablesToImport = ['_externalAuths', '_authOrigins', '_mfas', '_otps'];
  var tablesToImport = ['users', 'projects', 'newsletters', 'links', 'navigation_links', 'nav_dropdowns', 'newsletter_subscribers'];
  var sourceDbAlias = createSourceDbAlias();

  $app.runInTransaction(function (txApp) {
    attachSourceDatabase(txApp.db(), sourceDbPath, sourceDbAlias);

    try {
      for (var i = 0; i < tablesToClear.length; i += 1) {
        if (tableExists(txApp.db(), tablesToClear[i])) {
          executeDelete(txApp, tablesToClear[i]);
        }
      }

      for (var j = 0; j < tablesToImport.length; j += 1) {
        if (tableExists(txApp.db(), tablesToImport[j]) && tableExistsSource(txApp.db(), tablesToImport[j], sourceDbAlias)) {
          executeInsertFromSource(txApp, tablesToImport[j], sourceDbAlias);
        }
      }

      backfillNewsletterTextAlignment(txApp);

      for (var k = 0; k < authTablesToImport.length; k += 1) {
        if (
          tableExists(txApp.db(), authTablesToImport[k]) &&
          tableExistsSource(txApp.db(), authTablesToImport[k], sourceDbAlias) &&
          sourceCollectionIds.users &&
          targetCollectionIds.users
        ) {
          executeInsertAuthTableFromSource(txApp, authTablesToImport[k], sourceCollectionIds.users, targetCollectionIds.users, sourceDbAlias);
        }
      }
    } finally {
      detachSourceDatabase(txApp.db(), sourceDbAlias, 'record import');
    }
  });

  var storageIssues = copyStoredFiles(sourceDbPath, sourceStorageRoot, targetCollectionIds, sourceCollectionIds);
  var afterCounts = getTargetCounts($app);
  addCountMismatchIssues(storageIssues, sourceCounts, afterCounts);

  return {
    beforeCounts: beforeCounts,
    sourceCounts: sourceCounts,
    importedCounts: afterCounts,
    clearedCounts: beforeCounts,
    issues: storageIssues,
    usersWithAdminRole: adminUsers,
    requiresReauth: true,
  };
}

function ensureAdminAccess(e) {
  if (e.hasSuperuserAuth()) {
    return;
  }

  if (!e.auth || e.auth.getString('role') !== 'admin') {
    throw new ForbiddenError('Admin role is required to migrate PocketBase data.');
  }
}

function cleanupTempDir(tempDir) {
  if (!tempDir) {
    return;
  }

  try {
    removePath(tempDir);
  } catch (error) {
    console.warn('Failed to remove PocketBase migrate temp dir:', error);
  }
}

module.exports = {
  ensureAdminAccess: ensureAdminAccess,
  cleanupTempDir: cleanupTempDir,
  inspectUploadedDatabase: function (file) {
    var tempDir = getTempImportDir();
    var dbPath = joinPath(tempDir, 'data.db');

    ensureDirectory(tempDir);
    writeUploadedFile(file, dbPath);

    try {
      return inspectSourceDatabase(dbPath);
    } finally {
      cleanupTempDir(tempDir);
    }
  },
  inspectUploadedFolder: function (files, relativePaths) {
    var saved = saveImportedFolder(files, relativePaths);

    try {
      return inspectSourceDatabase(saved.sourceDbPath);
    } finally {
      cleanupTempDir(saved.tempDir);
    }
  },
  importUploadedFolder: function (files, relativePaths) {
    var saved = saveImportedFolder(files, relativePaths);

    try {
      return performImport(saved.sourceDbPath, saved.sourceStorageRoot);
    } finally {
      cleanupTempDir(saved.tempDir);
    }
  },
};
