// Installed only by tests/scripts/notifications-api.mjs in a disposable instance.
routerAdd('POST', '/api/test/notifications/tick', function (e) {
  if (!e.auth || e.auth.collection().name !== '_superusers') throw new ForbiddenError();
  var notifications = require(__hooks + '/lib/notifications.js');
  notifications.processJobs(e.app);
  notifications.remindEvents(e.app, Number((e.requestInfo().body || {}).now) || Date.now());
  return e.json(200, { ok: true });
}, $apis.requireAuth('_superusers'));
routerAdd('POST', '/api/test/notifications/rollback', function (e) {
  if (!e.auth || e.auth.collection().name !== '_superusers') throw new ForbiddenError();
  e.app.runInTransaction(function (tx) {
    var record = new Record(tx.findCollectionByNameOrId('newsletters'));
    record.set('title', 'Must roll back'); record.set('status', 'published');
    tx.save(record);
    throw new BadRequestError('Test rollback');
  });
}, $apis.requireAuth('_superusers'));
routerAdd('POST', '/api/test/notifications/push', function (e) {
  var status = Number((e.requestInfo().body || {}).status) || 201;
  require(__hooks + '/lib/notification-push.js').dispatch(e.app, function (input) {
    return input.items.map(function (item) { return { id: item.id, status: status }; });
  });
  return e.json(200, { ok: true });
}, $apis.requireAuth('_superusers'));
