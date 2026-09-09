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
  return {
    enabled: job.getBool('enabled'), repositoryUrl: job.getString('repositoryUrl'), username: job.getString('username'),
    hasToken: Boolean(job.getString('token')), intervalMinutes: job.getInt('intervalMinutes'),
    lastRunAt: job.getString('lastRunAt'), lastSuccessAt: job.getString('lastSuccessAt'),
    lastError: job.getString('lastError'), lastResult: job.get('lastResult') || {},
    isRunning: new Date(job.getString('lockedUntil')).getTime() > Date.now(),
  };
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
  if (new Date(job.getString('lockedUntil')).getTime() > Date.now()) throw new BadRequestError('Wait for the current import to finish before changing settings.');
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
    if (new Date(current.getString('lockedUntil')).getTime() > Date.now()) throw new BadRequestError('An import is running. Try saving again after it finishes.');
    ['repositoryUrl', 'username', 'token', 'enabled', 'intervalMinutes', 'updatedBy'].forEach(function (key) { current.set(key, job.get(key)); });
    tx.save(current);
  });
  return serializeJob(ensureJob(app));
}

function runJobNow(app, scheduled) {
  var job;
  var acquired = false;
  app.runInTransaction(function (tx) {
    job = ensureJob(tx);
    var now = Date.now();
    if (new Date(job.getString('lockedUntil')).getTime() > now) return;
    if (scheduled && (!job.getBool('enabled') || now - (new Date(job.getString('lastRunAt')).getTime() || 0) < job.getInt('intervalMinutes') * 60000)) return;
    job.set('lockedUntil', new Date(now + 5 * 60000).toISOString());
    job.set('lastRunAt', new Date(now).toISOString());
    tx.save(job);
    acquired = true;
  });
  if (!acquired) return serializeJob(ensureJob(app));
  var result = { status: 'ok', importedFiles: 0, articleCount: 0, skipped: 0, deferred: 0, errors: [] };
  try {
    if (!job.getString('repositoryUrl') || !job.getString('username') || !job.getString('token')) throw new Error('Save an Artifactory repository URL, username and token first.');
    var known = app.findRecordsByFilter('newsletter_imports', '', '', 0, 0).map(function (record) { return record.getString('sourceKey'); });
    var previous = job.get('lastResult') || {};
    var output = invokeWorker({ repositoryUrl: job.getString('repositoryUrl'), username: job.getString('username'), token: job.getString('token'), known: known, cursor: previous.cursor || '' });
    result.cursor = output.cursor;
    result.skipped = output.skipped;
    result.deferred = output.deferred;
    result.errors = output.errors;
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
    if (result.errors.length) result.status = result.importedFiles ? 'partial' : 'error';
  } catch (error) {
    result.status = 'error';
    // Worker errors never include request headers or remote response bodies.
    result.errors.push({ file: '', message: error.message || 'Newsletter import failed. Check server configuration.' });
  } finally {
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
  if (!job || !job.getBool('enabled')) return;
  try { runJobNow(app, true); } catch (_) { console.error('Scheduled newsletter import could not run.'); }
}

module.exports = { ensureAdminAccess: ensureAdminAccess, ensureJob: ensureJob, serializeJob: serializeJob, updateJobSettings: updateJobSettings, runJobNow: runJobNow, tick: tick };
