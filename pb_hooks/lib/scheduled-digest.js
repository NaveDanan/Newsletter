var JOB_KEY = 'newsletter_publication_digest';
var DEFAULT_INTERVAL_MINUTES = 10080;
var DEFAULT_MAX_NEWSLETTERS = 4;
var MIN_INTERVAL_MINUTES = 60;
var MIN_MAX_NEWSLETTERS = 1;
var MAX_MAX_NEWSLETTERS = 50;
var running = false;

function normalizeDate(value) {
  var text = String(value || '').trim();
  var time = text ? new Date(text).getTime() : 0;
  return isNaN(time) ? 0 : time;
}

function getNowIso() {
  return new Date().toISOString();
}

function ensureAdminAccess(auth) {
  if (!auth || auth.getString('role') !== 'admin') {
    throw new ForbiddenError('Admin role is required to manage scheduled jobs.');
  }
}

function findScheduledJobsCollection(app) {
  try {
    return app.findCollectionByNameOrId('scheduled_jobs');
  } catch (error) {
    return null;
  }
}

function findJob(app) {
  try {
    return app.findFirstRecordByFilter('scheduled_jobs', 'key = {:key}', { key: JOB_KEY });
  } catch (error) {
    return null;
  }
}

function ensureJob(app) {
  var job = findJob(app);

  if (!job) {
    var collection = findScheduledJobsCollection(app);
    if (!collection) {
      throw new Error('The scheduled_jobs collection has not been synced yet.');
    }

    job = new Record(collection);
    job.set('key', JOB_KEY);
    job.set('enabled', false);
    job.set('intervalMinutes', DEFAULT_INTERVAL_MINUTES);
    job.set('maxNewsletters', DEFAULT_MAX_NEWSLETTERS);
    job.set('lastRunAt', '');
    job.set('lastSuccessAt', '');
    job.set('lastError', '');
    job.set('lastResult', {});
    job.set('updatedBy', '');
    app.save(job);
  }

  return job;
}

function getIntervalMinutes(job) {
  var value = job && job.getInt ? job.getInt('intervalMinutes') : Number(job.get('intervalMinutes') || 0);
  if (!value || value < MIN_INTERVAL_MINUTES) {
    return DEFAULT_INTERVAL_MINUTES;
  }

  return value;
}

function getMaxNewsletters(job) {
  var value = job && job.getInt ? job.getInt('maxNewsletters') : Number(job.get('maxNewsletters') || 0);
  if (!value || value < MIN_MAX_NEWSLETTERS) {
    return DEFAULT_MAX_NEWSLETTERS;
  }

  return Math.min(value, MAX_MAX_NEWSLETTERS);
}

function listPendingNewsletters(app) {
  return app.findRecordsByFilter(
    'newsletters',
    'status = "published" && notificationSentAt = ""',
    '-publishedAt,-created',
    0,
    0
  );
}

function getActiveSubscriberCount(app) {
  return app.findRecordsByFilter('newsletter_subscribers', 'isActive = true', '', 0, 0).length;
}

function serializeNewsletter(record) {
  return {
    id: record.id,
    title: record.getString('title'),
    subtitle: record.getString('subtitle'),
    publishedAt: record.getString('publishedAt'),
    readTime: record.getString('readTime'),
  };
}

function serializeJob(app, job) {
  var helpers = require(__hooks + '/lib/newsletter-mail.js');
  var syncedRegisteredUsers = helpers.syncRegisteredUsersAsSubscribers(app);
  var pending = listPendingNewsletters(app);
  var maxNewsletters = getMaxNewsletters(job);

  return {
    key: JOB_KEY,
    enabled: Boolean(job.getBool ? job.getBool('enabled') : job.get('enabled')),
    intervalMinutes: getIntervalMinutes(job),
    maxNewsletters: maxNewsletters,
    lastRunAt: job.getString('lastRunAt'),
    lastSuccessAt: job.getString('lastSuccessAt'),
    lastError: job.getString('lastError'),
    lastResult: job.get('lastResult') || {},
    updatedBy: job.getString('updatedBy'),
    pendingNewsletters: pending.map(serializeNewsletter),
    scheduledNewsletters: pending.slice(0, maxNewsletters).map(serializeNewsletter),
    pendingNewsletterCount: pending.length,
    scheduledNewsletterCount: Math.min(pending.length, maxNewsletters),
    activeSubscriberCount: getActiveSubscriberCount(app),
    syncedRegisteredUsers: syncedRegisteredUsers,
  };
}

function shouldRun(job, nowMs) {
  if (!job || !(job.getBool ? job.getBool('enabled') : job.get('enabled'))) {
    return false;
  }

  var lastRunMs = normalizeDate(job.getString('lastRunAt'));
  if (!lastRunMs) {
    return true;
  }

  return nowMs - lastRunMs >= getIntervalMinutes(job) * 60 * 1000;
}

function updateJobResult(app, job, result, errorMessage) {
  var now = getNowIso();

  job.set('lastRunAt', now);
  job.set('lastResult', result || {});
  job.set('lastError', errorMessage || '');

  if (!errorMessage) {
    job.set('lastSuccessAt', now);
  }

  app.save(job);
}

function updateJobSettings(app, auth, body) {
  var job = ensureJob(app);

  if (Object.prototype.hasOwnProperty.call(body, 'enabled')) {
    job.set('enabled', Boolean(body.enabled));
  }

  if (Object.prototype.hasOwnProperty.call(body, 'intervalMinutes')) {
    var interval = Math.floor(Number(body.intervalMinutes || 0));
    if (!isFinite(interval) || interval < MIN_INTERVAL_MINUTES) {
      throw new BadRequestError('Interval must be at least 60 minutes.');
    }
    job.set('intervalMinutes', interval);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'maxNewsletters')) {
    var maxNewsletters = Math.floor(Number(body.maxNewsletters || 0));
    if (!isFinite(maxNewsletters) || maxNewsletters < MIN_MAX_NEWSLETTERS || maxNewsletters > MAX_MAX_NEWSLETTERS) {
      throw new BadRequestError('Newsletter count must be between 1 and 50.');
    }
    job.set('maxNewsletters', maxNewsletters);
  }

  job.set('updatedBy', auth && auth.id ? String(auth.id) : '');
  app.save(job);

  return serializeJob(app, job);
}

function runDigest(app, options) {
  options = options || {};

  if (running && !options.force) {
    return {
      status: 'skipped',
      reason: 'already_running',
      pendingNewsletterCount: listPendingNewsletters(app).length,
      subscriberCount: getActiveSubscriberCount(app),
      recipientCount: 0,
      newsletterCount: 0,
    };
  }

  running = true;

  try {
    var helpers = require(__hooks + '/lib/newsletter-mail.js');
    helpers.syncRegisteredUsersAsSubscribers(app);

    var job = ensureJob(app);
    var maxNewsletters = getMaxNewsletters(job);
    var pendingNewsletters = listPendingNewsletters(app);
    var newsletters = pendingNewsletters.slice(0, maxNewsletters);
    var subscribers = app.findRecordsByFilter('newsletter_subscribers', 'isActive = true', '', 0, 0);

    if (!pendingNewsletters.length) {
      return {
        status: 'ok',
        reason: 'no_pending_newsletters',
        pendingNewsletterCount: 0,
        subscriberCount: subscribers.length,
        recipientCount: 0,
        newsletterCount: 0,
      };
    }

    var result = helpers.sendNewsletterDigestNotifications(app, newsletters, subscribers);
    result.status = 'ok';
    result.pendingNewsletterCount = Math.max(0, pendingNewsletters.length - newsletters.length);
    result.scheduledNewsletterCount = newsletters.length;
    result.subscriberCount = subscribers.length;

    return result;
  } finally {
    running = false;
  }
}

function runJobNow(app, options) {
  var job = ensureJob(app);

  try {
    var result = runDigest(app, options || {});
    updateJobResult(app, job, result, '');
    return serializeJob(app, job);
  } catch (error) {
    var message = error && error.message ? String(error.message) : String(error);
    updateJobResult(app, job, {
      status: 'error',
      message: message,
    }, message);
    throw error;
  }
}

function tick(app) {
  if (!findScheduledJobsCollection(app)) {
    return;
  }

  var job = ensureJob(app);

  if (!shouldRun(job, Date.now())) {
    return;
  }

  try {
    runJobNow(app);
  } catch (error) {
    console.error('Newsletter digest scheduled run failed:', error);
  }
}

module.exports = {
  ensureAdminAccess: ensureAdminAccess,
  ensureJob: ensureJob,
  JOB_KEY: JOB_KEY,
  runJobNow: runJobNow,
  serializeJob: serializeJob,
  tick: tick,
  updateJobSettings: updateJobSettings,
};
