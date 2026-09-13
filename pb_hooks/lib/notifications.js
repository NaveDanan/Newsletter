// Server-owned in-app alerts. Jobs and source writes commit together; delivery
// advances its cursor in the same transaction as each batch of notifications.
var KEYS = ['enabled', 'mentions', 'comments', 'following', 'events', 'newsletters', 'activity', 'browser', 'background'];
var KIND_PREFERENCE = { mention: 'mentions', reply: 'comments', comment: 'comments', following_post: 'following', event: 'events', newsletter: 'newsletters', like: 'activity', repost: 'activity', quote: 'activity', follow: 'activity' };
function core() { return require(__hooks + '/lib/community-core.js'); }
function preferences(app, userId) {
  var row = core().findOneOrNull(app, 'notification_preferences', 'userId = {:id}', { id: userId });
  var raw = row ? core().readJson(row, 'preferences', {}) : {};
  var value = {};
  KEYS.forEach(function (key) { value[key] = raw[key] !== false; });
  return value;
}
function getPreferences(e) {
  core().requireAuth(e.auth);
  return preferences(e.app, String(e.auth.id));
}
function updatePreferences(e) {
  core().requireAuth(e.auth);
  var body = e.requestInfo().body || {};
  Object.keys(body).forEach(function (key) {
    if (KEYS.indexOf(key) < 0 || typeof body[key] !== 'boolean') throw new BadRequestError('Notification preferences must be boolean settings.');
  });
  var result;
  e.app.runInTransaction(function (tx) {
    var id = String(e.auth.id);
    result = preferences(tx, id);
    Object.keys(body).forEach(function (key) { result[key] = body[key]; });
    var row = core().findOneOrNull(tx, 'notification_preferences', 'userId = {:id}', { id: id }) || core().newRecord(tx, 'notification_preferences');
    core().setValues(row, { userId: id, preferences: result });
    tx.save(row);
  });
  return result;
}
function allowed(app, userId, actorId, kind) {
  if (!userId || userId === actorId || !KIND_PREFERENCE[kind]) return false;
  var user = core().findByIdOrNull(app, 'users', userId);
  if (!user) return false;
  var settings = preferences(app, userId);
  if (!settings.enabled || !settings[KIND_PREFERENCE[kind]]) return false;
  if (actorId && core().findOneOrNull(app, 'community_blocks', '(userId = {:user} && targetId = {:actor}) || (userId = {:actor} && targetId = {:user})', { user: userId, actor: actorId })) return false;
  return true;
}
function create(app, options) {
  app.runInTransaction(function (tx) {
  if (!allowed(tx, options.userId, options.actorId || '', options.kind)) return;
  var c = core();
  var post = c.buildEqualsFilter('postId', options.postId || '', 'post');
  var actor = c.buildEqualsFilter('actorId', options.actorId || '', 'actor');
  var params = Object.assign({ user: options.userId, kind: options.kind }, post.params, actor.params);
  if (c.findOneOrNull(tx, 'community_notifications', 'userId = {:user} && kind = {:kind} && ' + post.filter + ' && ' + actor.filter, params)) return;
  var row = c.newRecord(tx, 'community_notifications');
  c.setValues(row, Object.assign({}, options, { preview: c.buildPreview(options.preview || '').slice(0, 300), isRead: false }));
  tx.save(row);
  require(__hooks + '/lib/notification-push.js').enqueue(tx, row);
  });
}
function enqueue(app, key, payload) {
  if (core().findOneOrNull(app, 'notification_jobs', 'key = {:key}', { key: key })) return;
  var row = core().newRecord(app, 'notification_jobs');
  core().setValues(row, { key: key, payload: payload, completed: false, cursor: '' });
  app.save(row);
}
function all(app, collection, filter, params) {
  var result = [], offset = 0, batch;
  do {
    batch = app.findRecordsByFilter(collection, filter, 'id', 500, offset, params || {});
    result = result.concat(batch); offset += batch.length;
  } while (batch.length === 500);
  return result;
}
function postChanged(app, row, before) {
  var c = core();
  if (row.getString('status') !== 'published') return;
  var id = String(row.id), actor = row.getString('authorId');
  var mentions = c.readJsonArray(row, 'mentionIds');
  var oldMentions = before ? c.readJsonArray(before, 'mentionIds') : [];
  var recipients = {};
  var base = { actorId: actor, actorHandle: row.getString('authorHandle'), actorName: row.getString('authorName'), actorAvatarUrl: row.getString('authorAvatarUrl'), postId: id, rootId: row.getString('rootId') || id, preview: row.getString('body'), targetPath: '/community/post/' + id };
  function add(userId, kind) { if (userId && userId !== actor && !recipients[userId]) recipients[userId] = kind; }
  mentions.forEach(function (userId) { if (oldMentions.indexOf(userId) < 0) add(userId, 'mention'); });
  if (!before) {
    var parent = c.findByIdOrNull(app, 'community_posts', row.getString('parentId'));
    var quoted = c.findByIdOrNull(app, 'community_posts', row.getString('quotedPostId'));
    if (parent) {
      add(parent.getString('authorId'), 'reply');
      all(app, 'community_posts', 'rootId = {:root} && kind = "reply" && status = "published"', { root: base.rootId }).forEach(function (post) { add(post.getString('authorId'), 'comment'); });
    }
    if (quoted) add(quoted.getString('authorId'), 'quote');
    if (row.getString('kind') !== 'reply') {
      all(app, 'community_follows', 'followingId = {:actor}', { actor: actor }).forEach(function (follow) { add(follow.getString('followerId'), 'following_post'); });
    }
  }
  Object.keys(recipients).forEach(function (userId) {
    enqueue(app, 'post:' + id + ':' + userId + ':' + recipients[userId], { deliveries: [Object.assign({}, base, { userId: userId, kind: recipients[userId] })], source: 'community_posts', sourceId: id });
  });
}
function newsletterChanged(app, row, before) {
  var c = core(), id = String(row.id);
  if (row.getString('status') !== 'published') return;
  var path = '/article/' + id;
  if (!before || before.getString('status') !== 'published') {
    enqueue(app, 'newsletter:' + id, { broadcast: true, source: 'newsletters', sourceId: id, notification: { kind: 'newsletter', actorId: '', postId: id, preview: row.getString('title'), targetPath: path } });
  }
  // Only newly added comments notify existing participants. Edits and likes do not.
  var previous = before ? c.readJsonArray(before, 'commentItems') : [];
  var comments = c.readJsonArray(row, 'commentItems');
  comments.forEach(function (comment) {
    if (!comment.id || previous.some(function (old) { return old.id === comment.id; })) return;
    var recipients = {};
    previous.forEach(function (old) { if (old.authorId) recipients[old.authorId] = true; });
    var deliveries = Object.keys(recipients).map(function (userId) {
      return { userId: userId, actorId: comment.authorId, actorName: comment.authorName, kind: 'comment', postId: id + ':' + comment.id, preview: comment.body, targetPath: path };
    });
    enqueue(app, 'comment:' + id + ':' + comment.id, { deliveries: deliveries, source: 'newsletters', sourceId: id });
  });
}
function capture(e, isUpdate) {
  var before = isUpdate ? e.record.original() : null;
  // e.app may already be transactional. Nested transactions use the same writer.
  var originalApp = e.app;
  originalApp.runInTransaction(function (tx) {
    e.app = tx;
    e.next();
    if (e.record.collection().name === 'newsletters') newsletterChanged(tx, e.record, before);
    else postChanged(tx, e.record, before);
  });
  e.app = originalApp;
}
function processJobs(app) {
  var jobs = app.findRecordsByFilter('notification_jobs', 'completed = false', 'created,id', 100, 0);
  jobs.forEach(function (candidate) {
    try {
      app.runInTransaction(function (tx) {
        var job = tx.findRecordById('notification_jobs', candidate.id);
        if (job.getBool('completed')) return;
        var payload = core().readJson(job, 'payload', {});
        var source = core().findByIdOrNull(tx, payload.source, payload.sourceId);
        if (!source || source.getString('status') !== 'published') { job.set('completed', true); tx.save(job); return; }
        if (payload.broadcast) {
          var cursor = job.getString('cursor');
          var users = tx.findRecordsByFilter('users', cursor ? 'id > {:cursor} && created <= {:created}' : 'created <= {:created}', 'id', 100, 0, { cursor: cursor, created: job.getString('created') });
          users.forEach(function (user) { create(tx, Object.assign({}, payload.notification, { userId: String(user.id) })); });
          if (users.length) job.set('cursor', String(users[users.length - 1].id));
          job.set('completed', users.length < 100);
        } else {
          (payload.deliveries || []).forEach(function (item) { create(tx, item); });
          job.set('completed', true);
        }
        tx.save(job);
      });
    } catch (error) { console.error('Notification job failed; will retry', candidate.id, String(error)); }
  });
}
function remindEvents(app, now) {
  var timestamp = now || Date.now();
  all(app, 'newsletters', 'status = "published"').forEach(function (row) {
    var event = core().readJson(row, 'event', null);
    if (!event || !event.id) return;
    var start = Date.parse(event.startDate);
    // A late scheduler can catch up until the event starts; past events stay quiet.
    if (!isFinite(start) || start < timestamp || start > timestamp + 30 * 60000) return;
    (event.attendees || []).forEach(function (attendee) {
      app.runInTransaction(function (tx) {
        create(tx, { userId: attendee.userId, actorId: '', kind: 'event', postId: String(row.id) + ':' + event.id + ':' + start, preview: event.title, targetPath: '/article/' + row.id });
      });
    });
  });
}
function browserFeed(e) {
  var c = core(), userId = String(e.auth.id), query = e.requestInfo().query || {};
  var cursor = c.decodeCursor(query.cursor);
  var rows, params = { user: userId };
  if (cursor) {
    params.created = cursor.created; params.id = cursor.id;
    rows = e.app.findRecordsByFilter('community_notifications', 'userId = {:user} && (created > {:created} || (created = {:created} && id > {:id}))', 'created,id', 50, 0, params);
  } else rows = e.app.findRecordsByFilter('community_notifications', 'userId = {:user}', '-created,-id', 1, 0, params);
  var last = rows.length ? rows[rows.length - 1] : null;
  return {
    preferences: preferences(e.app, userId),
    unreadCount: e.app.countRecords('community_notifications', $dbx.hashExp({ userId: userId, isRead: false })),
    cursor: last ? c.encodeCursor(last.getString('created'), String(last.id)) : String(query.cursor || c.encodeCursor(new Date().toISOString().replace('T', ' '), '0')),
    items: cursor ? rows.filter(function (row) { return !row.getBool('isRead') && allowed(e.app, userId, row.getString('actorId'), row.getString('kind')); }).map(function (row) { return require(__hooks + '/lib/notification-push.js').message(row, query.locale); }) : [],
    hasMore: Boolean(cursor) && rows.length === 50,
  };
}
function tick(app) { processJobs(app); remindEvents(app); require(__hooks + '/lib/notification-push.js').dispatch(app); }
module.exports = { preferences: preferences, getPreferences: getPreferences, updatePreferences: updatePreferences, allowed: allowed, create: create, capture: capture, processJobs: processJobs, remindEvents: remindEvents, browserFeed: browserFeed, tick: tick };
