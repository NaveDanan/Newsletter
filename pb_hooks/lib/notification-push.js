function core() { return require(__hooks + '/lib/community-core.js'); }
function notifications() { return require(__hooks + '/lib/notifications.js'); }
function invoke(input) {
  var file = $os.tempDir() + '/notification-push-' + $security.randomString(24) + '.json';
  try {
    $os.writeFile(file, JSON.stringify(input), 384);
    var script = String($os.getenv('APP_ROOT') || __hooks + '/..') + '/scripts/pocketbase/web-push.mjs';
    var result = JSON.parse(toString($os.cmd(String($os.getenv('NODE_BINARY') || 'node'), script, file).output()));
    if (!result.ok) throw new Error('Web Push worker failed.');
    return result.result;
  } finally { try { $os.remove(file); } catch (_) {} }
}
function config(app) {
  var row = core().findOneOrNull(app, 'notification_push_config', 'key = "vapid"');
  if (row) return row;
  var keys = invoke({ action: 'keys' });
  app.runInTransaction(function (tx) {
    row = core().findOneOrNull(tx, 'notification_push_config', 'key = "vapid"');
    if (!row) {
      row = core().newRecord(tx, 'notification_push_config');
      core().setValues(row, { key: 'vapid', publicKey: keys.publicKey, privateKey: keys.privateKey });
      tx.save(row);
    }
  });
  return row;
}
function getConfig(e) { return { publicKey: config(e.app).getString('publicKey') }; }
function validSubscription(value) {
  if (!value || typeof value.endpoint !== 'string' || value.endpoint.length > 2000) return false;
  if (!/^https:\/\/(fcm\.googleapis\.com|(?:[a-z0-9-]+\.)*push\.services\.mozilla\.com|web\.push\.apple\.com|(?:[a-z0-9-]+\.)*notify\.windows\.com)\/[A-Za-z0-9_~:/?@!$&'()*+,;=%.\-]+$/.test(value.endpoint)) return false;
  var keys = value.keys || {};
  return /^[A-Za-z0-9_-]{87}=?$/.test(keys.p256dh || '') && /^[A-Za-z0-9_-]{22}={0,2}$/.test(keys.auth || '');
}
function subscribe(e) {
  var body = e.requestInfo().body || {}, value = body.subscription;
  if (!validSubscription(value)) throw new BadRequestError('Invalid browser push subscription.');
  var userId = String(e.auth.id), hash = $security.sha256(value.endpoint);
  e.app.runInTransaction(function (tx) {
    var existing = core().findOneOrNull(tx, 'notification_push_subscriptions', 'endpointHash = {:hash}', { hash: hash });
    if (existing && existing.getString('userId') !== userId) {
      // A browser may switch accounts; ownership follows possession of its keys.
      var previous = core().readJson(existing, 'subscription', {});
      if (!previous.keys || previous.keys.auth !== value.keys.auth || previous.keys.p256dh !== value.keys.p256dh) throw new ForbiddenError('This subscription belongs to another account.');
    }
    if (!existing && tx.countRecords('notification_push_subscriptions', $dbx.hashExp({ userId: userId })) >= 20) throw new BadRequestError('Too many registered browsers.');
    var row = existing || core().newRecord(tx, 'notification_push_subscriptions');
    core().setValues(row, { userId: userId, endpointHash: hash, subscription: value, locale: body.locale === 'he' ? 'he' : 'en' });
    tx.save(row);
  });
  return { subscribed: true };
}
function unsubscribe(e) {
  var endpoint = String((e.requestInfo().body || {}).endpoint || '');
  var row = core().findOneOrNull(e.app, 'notification_push_subscriptions', 'userId = {:user} && endpointHash = {:hash}', { user: String(e.auth.id), hash: $security.sha256(endpoint) });
  if (row) e.app.delete(row);
  return { subscribed: false };
}
function enqueue(app, notification) {
  var settings = notifications().preferences(app, notification.getString('userId'));
  if (!settings.browser || !settings.background) return;
  var subscriptions = app.findRecordsByFilter('notification_push_subscriptions', 'userId = {:user}', '', 20, 0, { user: notification.getString('userId') });
  subscriptions.forEach(function (subscription) {
    var job = core().newRecord(app, 'notification_push_jobs');
    core().setValues(job, { notificationId: String(notification.id), subscriptionId: String(subscription.id), nextAttemptAt: new Date().toISOString(), completed: false });
    app.save(job);
  });
}
function message(note, locale) {
  var kind = note.getString('kind'), name = note.getString('actorName') || note.getString('actorHandle');
  var en = { mention: name + ' mentioned you', reply: name + ' replied to you', comment: name + ' commented in your discussion', following_post: name + ' published a post', newsletter: 'A new newsletter is available', event: 'Your event starts soon', like: name + ' liked your post', follow: name + ' followed you', repost: name + ' reposted your post', quote: name + ' quoted your post' };
  var he = { mention: name + ' תייג/ה אותך', reply: name + ' הגיב/ה לך', comment: name + ' הגיב/ה בדיון שלך', following_post: name + ' פרסם/ה פוסט', newsletter: 'ניוזלטר חדש פורסם', event: 'האירוע שלך מתחיל בקרוב', like: name + ' אהב/ה את הפוסט שלך', follow: name + ' התחיל/ה לעקוב אחריך', repost: name + ' שיתף/ה את הפוסט שלך', quote: name + ' ציטט/ה את הפוסט שלך' };
  var path = note.getString('targetPath');
  if (!path) path = note.getString('kind') === 'follow' ? '/community/u/' + encodeURIComponent(note.getString('actorHandle')) : '/community/post/' + note.getString('postId');
  return { id: String(note.id), userId: note.getString('userId'), title: (locale === 'he' ? he : en)[kind] || 'AI-BREAK', body: note.getString('preview'), path: path, dir: locale === 'he' ? 'rtl' : 'ltr' };
}
function dispatch(app, worker) {
  var now = new Date().toISOString(), selected = [];
  app.runInTransaction(function (tx) {
    var jobs = tx.findRecordsByFilter('notification_push_jobs', 'completed = false && nextAttemptAt <= {:now} && (lockedUntil = "" || lockedUntil < {:now})', 'created,id', 50, 0, { now: now });
    jobs.forEach(function (job) {
      var note = core().findByIdOrNull(tx, 'community_notifications', job.getString('notificationId'));
      var sub = core().findByIdOrNull(tx, 'notification_push_subscriptions', job.getString('subscriptionId'));
      var settings = note ? notifications().preferences(tx, note.getString('userId')) : {};
      if (!note || note.getBool('isRead') || !sub || sub.getString('userId') !== note.getString('userId') || !settings.browser || !settings.background || !notifications().allowed(tx, note.getString('userId'), note.getString('actorId'), note.getString('kind'))) {
        job.set('completed', true); tx.save(job); return;
      }
      job.set('lockedUntil', new Date(Date.now() + 120000).toISOString()); tx.save(job);
      selected.push({ id: String(job.id), subscription: core().readJson(sub, 'subscription', {}), payload: message(note, sub.getString('locale')) });
    });
  });
  if (!selected.length) return;
  var results;
  try {
    var keys = config(app);
    var subject = String($os.getenv('WEB_PUSH_SUBJECT') || 'mailto:' + app.settings().meta.senderAddress);
    results = (worker || invoke)({ items: selected, publicKey: keys.getString('publicKey'), privateKey: keys.getString('privateKey'), subject: subject });
  } catch (_) { results = selected.map(function (item) { return { id: item.id, status: 503 }; }); }
  results.forEach(function (result) {
    app.runInTransaction(function (tx) {
      var job = tx.findRecordById('notification_push_jobs', result.id), attempts = job.getInt('attempts') + 1;
      if (result.status === 404 || result.status === 410) {
        var sub = core().findByIdOrNull(tx, 'notification_push_subscriptions', job.getString('subscriptionId'));
        if (sub) tx.delete(sub);
      }
      core().setValues(job, { attempts: attempts, lockedUntil: '', completed: result.status === 201 || result.status === 404 || result.status === 410 || attempts >= 6, nextAttemptAt: new Date(Date.now() + Math.pow(2, attempts) * 60000).toISOString() });
      tx.save(job);
      if (attempts >= 6 && result.status !== 201) console.error('Browser notification delivery exhausted retries', String(job.id), result.status);
    });
  });
}
module.exports = { getConfig: getConfig, subscribe: subscribe, unsubscribe: unsubscribe, enqueue: enqueue, dispatch: dispatch, validSubscription: validSubscription, message: message };
