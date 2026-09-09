var JOB_KEY = 'artifactory_newsletter_import';

function ensureAdminAccess(auth) {
  if (!auth || auth.getString('role') !== 'admin') throw new ForbiddenError('Admin role is required to manage newsletter imports.');
}

function findJob(app) {
  try { return app.findFirstRecordByFilter('newsletter_import_jobs', 'key = {:key}', { key: JOB_KEY }); }
  catch (_) { return null; }
}

function ensureJob(app) {
  var job = findJob(app);
  if (job) return job;
  job = new Record(app.findCollectionByNameOrId('newsletter_import_jobs'));
  job.set('key', JOB_KEY);
  job.set('enabled', false);
  job.set('intervalMinutes', 1440);
  job.set('lastResult', {});
  app.save(job);
  return job;
}

function serializeJob(job) {
  var result = readJson(job, 'lastResult', {});
  delete result.visited;
  return {
    enabled: job.getBool('enabled'), repositoryUrl: job.getString('repositoryUrl'), username: job.getString('username'),
    hasToken: Boolean(job.getString('token')), intervalMinutes: job.getInt('intervalMinutes'),
    lastRunAt: job.getString('lastRunAt'), lastSuccessAt: job.getString('lastSuccessAt'),
    lastError: job.getString('lastError'), lastResult: result,
    isRunning: isRunning(job),
  };
}

function isRunning(job) {
  return new Date(job.getString('lockedUntil')).getTime() > Date.now() || readJson(job, 'lastResult', {}).status === 'running';
}

function readJson(record, key, fallback) {
  // PocketBase JSON fields are Go byte slices inside hooks, not JS objects.
  try { return JSON.parse(toString(record.get(key))); } catch (_) { return fallback; }
}

function invokeWorker(settings) {
  var payloadPath = $os.tempDir() + '/newsletter-import-' + $security.randomString(24) + '.json';
  try {
    $os.writeFile(payloadPath, JSON.stringify(settings), 384);
    var script = String($os.getenv('APP_ROOT') || '/app') + '/scripts/pocketbase/artifactory-import.mjs';
    var cmd = $os.cmd(String($os.getenv('NODE_BINARY') || 'node'), script, payloadPath);
    var result = JSON.parse(toString(cmd.output()));
    if (!result.ok) throw new Error(result.message || 'Newsletter import failed.');
    return result;
  } finally { try { $os.remove(payloadPath); } catch (_) {} }
}

function updateJobSettings(app, auth, body) {
  var job = ensureJob(app);
  if (isRunning(job)) throw new BadRequestError('Wait for the current import to finish before changing settings.');
  ['repositoryUrl', 'username', 'token'].forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) return;
    if (typeof body[key] !== 'string') throw new BadRequestError(key + ' must be text.');
    // Empty token means keep the saved token. Clearing credentials is explicit.
    if (key !== 'token' || body[key].trim()) job.set(key, body[key].trim());
  });
  if (body.clearToken === true) job.set('token', '');
  if (Object.prototype.hasOwnProperty.call(body, 'enabled')) {
    if (typeof body.enabled !== 'boolean') throw new BadRequestError('Enabled must be true or false.');
    job.set('enabled', body.enabled);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'intervalMinutes')) {
    var interval = Number(body.intervalMinutes);
    if (!isFinite(interval) || Math.floor(interval) !== interval || interval < 60 || interval > 525600) throw new BadRequestError('Import interval must be between 60 and 525600 minutes.');
    job.set('intervalMinutes', interval);
  }
  if (job.getString('repositoryUrl')) {
    try {
      var validated = invokeWorker({ validateOnly: true, repositoryUrl: job.getString('repositoryUrl') });
      job.set('repositoryUrl', validated.root);
    } catch (error) { throw new BadRequestError(error.message || 'Invalid Artifactory repository URL.'); }
  }
  if (job.getString('username').indexOf(':') !== -1) throw new BadRequestError('Username cannot contain a colon.');
  if (job.getBool('enabled') && (!job.getString('repositoryUrl') || !job.getString('username') || !job.getString('token'))) throw new BadRequestError('Save a repository URL, username and token before enabling imports.');
  job.set('updatedBy', auth.id);
  // Re-read within the transaction so a concurrent scheduler cannot lose its lock.
  app.runInTransaction(function (tx) {
    var current = ensureJob(tx);
    if (isRunning(current)) throw new BadRequestError('An import is running. Try saving again after it finishes.');
    ['repositoryUrl', 'username', 'token', 'enabled', 'intervalMinutes', 'updatedBy'].forEach(function (key) { current.set(key, job.get(key)); });
    tx.save(current);
  });
  return serializeJob(ensureJob(app));
}

function runJobNow(app, scheduled) {
  var job;
  var result;
  var startedAt = Date.now();
  var acquired = false;
  app.runInTransaction(function (tx) {
    job = ensureJob(tx);
    var now = Date.now();
    if (new Date(job.getString('lockedUntil')).getTime() > now) return;
    var previous = readJson(job, 'lastResult', {});
    var continuing = previous.status === 'running';
    if (scheduled && !continuing && (!job.getBool('enabled') || now - (new Date(job.getString('lastRunAt')).getTime() || 0) < job.getInt('intervalMinutes') * 60000)) return;
    result = continuing ? previous : { status: 'running', importedFiles: 0, articleCount: 0, skipped: 0, deferred: 0, errors: [], visited: [] };
    job.set('lockedUntil', new Date(now + 5 * 60000).toISOString());
    if (!continuing) job.set('lastRunAt', new Date(now).toISOString());
    job.set('lastResult', result);
    tx.save(job);
    acquired = true;
  });
  if (!acquired) return serializeJob(ensureJob(app));
  try {
    if (!job.getString('repositoryUrl') || !job.getString('username') || !job.getString('token')) throw new Error('Save an Artifactory repository URL, username and token first.');
    do {
    var known = app.findRecordsByFilter('newsletter_imports', '', '', 0, 0).map(function (record) { return record.getString('sourceKey'); });
    var output = invokeWorker({ repositoryUrl: job.getString('repositoryUrl'), username: job.getString('username'), token: job.getString('token'), known: known, visited: result.visited || [], cursor: result.cursor || '' });
    result.cursor = output.cursor;
    result.skipped += output.skipped;
    result.deferred = output.deferred;
    result.errors = result.errors.concat(output.errors);
    result.visited = (result.visited || []).concat(output.processed || []);
    output.documents.forEach(function (document) {
      try {
        var imported = false;
        app.runInTransaction(function (tx) {
          var existing = tx.findRecordsByFilter('newsletter_imports', 'sourceKey = {:key}', '', 1, 0, { key: document.sourceKey });
          if (existing.length) return;
          var ids = [];
          document.articles.forEach(function (article) {
            var record = new Record(tx.findCollectionByNameOrId('newsletters'));
            ['title', 'subtitle', 'content', 'excerpt', 'textAlignment', 'coverImage', 'readTime'].forEach(function (key) { record.set(key, article[key]); });
            record.set('status', 'draft');
            record.set('author', article.author || '');
            record.set('createdById', job.getString('updatedBy'));
            record.set('publishedAt', article.publishedAt || new Date().toISOString().slice(0, 10));
            ['tags', 'likedByUserIds', 'bookmarkedByUserIds', 'commentItems'].forEach(function (key) { record.set(key, []); });
            tx.save(record);
            ids.push(record.id);
          });
          var checkpoint = new Record(tx.findCollectionByNameOrId('newsletter_imports'));
          ['sourceKey', 'sourceUrl', 'checksum'].forEach(function (key) { checkpoint.set(key, document[key]); });
          checkpoint.set('newsletterIds', ids);
          tx.save(checkpoint);
          imported = true;
        });
        if (imported) { result.importedFiles++; result.articleCount += document.articles.length; }
        else result.skipped++;
      } catch (_) { result.errors.push({ file: document.file, message: 'Could not save articles. The file will be retried on the next import.' }); }
    });
    // Commit progress between batches. A later cron tick resumes this same run,
    // even when the page closes or the normal schedule is disabled.
    var progress = ensureJob(app);
    progress.set('lastResult', result);
    app.save(progress);
    } while (result.deferred > 0 && Date.now() - startedAt < 60000);
    result.status = result.deferred > 0 ? 'running' : result.errors.length ? (result.importedFiles ? 'partial' : 'error') : 'ok';
  } catch (error) {
    result.status = 'error';
    // Worker errors never include request headers or remote response bodies.
    result.errors.push({ file: '', message: error.message || 'Newsletter import failed. Check server configuration.' });
  } finally {
    if (result.status !== 'running') delete result.visited;
    var current = ensureJob(app);
    current.set('lockedUntil', '');
    current.set('lastResult', result);
    current.set('lastError', result.errors.map(function (e) { return (e.file ? e.file + ': ' : '') + e.message; }).join('\n').slice(0, 10000));
    if (result.status === 'ok') current.set('lastSuccessAt', new Date().toISOString());
    app.save(current);
  }
  return serializeJob(ensureJob(app));
}

function tick(app) {
  try { app.findCollectionByNameOrId('newsletter_import_jobs'); } catch (_) { return; }
  var job = findJob(app);
  if (!job || (!job.getBool('enabled') && readJson(job, 'lastResult', {}).status !== 'running')) return;
  try { runJobNow(app, true); } catch (_) { console.error('Scheduled newsletter import could not run.'); }
}

function serializeTrackedFile(record) {
  return { id: record.id, sourceUrl: record.getString('sourceUrl'), checksum: record.getString('checksum'), importedAt: record.getString('created'), newsletterIds: readJson(record, 'newsletterIds', []) };
}

function listTrackedFiles(app, query) {
  var page = Math.max(1, Math.floor(Number(query.page) || 1));
  var records = app.findRecordsByFilter('newsletter_imports', '', '-created,-id', 51, (page - 1) * 50);
  return { items: records.slice(0, 50).map(serializeTrackedFile), page: page, hasMore: records.length > 50 };
}

function changeTrackedFile(app, id, body, remove) {
  var validated;
  if (!remove) {
    try { validated = invokeWorker({ validateTracking: true, sourceUrl: body.sourceUrl, checksum: body.checksum }); }
    catch (error) { throw new BadRequestError(error.message || 'Invalid tracked file.'); }
  }
  var result;
  app.runInTransaction(function (tx) {
    if (isRunning(ensureJob(tx))) throw new BadRequestError('Wait for the current import to finish before editing tracked files.');
    var record = tx.findRecordById('newsletter_imports', id);
    if (remove) { tx.delete(record); return; }
    var duplicate = tx.findRecordsByFilter('newsletter_imports', 'sourceKey = {:key} && id != {:id}', '', 1, 0, { key: validated.sourceKey, id: id });
    if (duplicate.length) throw new BadRequestError('This file version is already tracked.');
    ['sourceUrl', 'checksum', 'sourceKey'].forEach(function (key) { record.set(key, validated[key]); });
    tx.save(record);
    result = serializeTrackedFile(record);
  });
  return remove ? { removed: true } : result;
}

module.exports = { ensureAdminAccess: ensureAdminAccess, ensureJob: ensureJob, serializeJob: serializeJob, updateJobSettings: updateJobSettings, runJobNow: runJobNow, tick: tick, listTrackedFiles: listTrackedFiles, changeTrackedFile: changeTrackedFile };
