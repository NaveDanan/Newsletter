routerAdd('GET', '/api/notifications/preferences', function (e) {
  return e.json(200, require(__hooks + '/lib/notifications.js').getPreferences(e));
}, $apis.requireAuth('users'), $apis.skipSuccessActivityLog());
routerAdd('PATCH', '/api/notifications/preferences', function (e) {
  return e.json(200, require(__hooks + '/lib/notifications.js').updatePreferences(e));
}, $apis.bodyLimit(16384), $apis.requireAuth('users'), $apis.skipSuccessActivityLog());
routerAdd('GET', '/api/notifications/unread', function (e) {
  return e.json(200, { unreadCount: e.app.countRecords('community_notifications', $dbx.hashExp({ userId: String(e.auth.id), isRead: false })) });
}, $apis.requireAuth('users'), $apis.skipSuccessActivityLog());
onRecordCreate(function (e) {
  return require(__hooks + '/lib/notifications.js').capture(e, false);
}, 'newsletters', 'community_posts');
onRecordUpdate(function (e) {
  return require(__hooks + '/lib/notifications.js').capture(e, true);
}, 'newsletters', 'community_posts');
onRecordAfterCreateSuccess(function (e) {
  e.next();
  require(__hooks + '/lib/notifications.js').processJobs(e.app);
}, 'newsletters', 'community_posts');
onRecordAfterUpdateSuccess(function (e) {
  e.next();
  require(__hooks + '/lib/notifications.js').processJobs(e.app);
}, 'newsletters', 'community_posts');
cronAdd('notificationDelivery', '* * * * *', function () {
  require(__hooks + '/lib/notifications.js').tick($app);
});
routerAdd('GET', '/api/notifications/push/config', function (e) {
  return e.json(200, require(__hooks + '/lib/notification-push.js').getConfig(e));
}, $apis.requireAuth('users'), $apis.skipSuccessActivityLog());
routerAdd('POST', '/api/notifications/push/subscribe', function (e) {
  return e.json(200, require(__hooks + '/lib/notification-push.js').subscribe(e));
}, $apis.bodyLimit(16384), $apis.requireAuth('users'), $apis.skipSuccessActivityLog());
routerAdd('POST', '/api/notifications/push/unsubscribe', function (e) {
  return e.json(200, require(__hooks + '/lib/notification-push.js').unsubscribe(e));
}, $apis.bodyLimit(16384), $apis.requireAuth('users'), $apis.skipSuccessActivityLog());
routerAdd('GET', '/api/notifications/browser', function (e) {
  return e.json(200, require(__hooks + '/lib/notifications.js').browserFeed(e));
}, $apis.requireAuth('users'), $apis.skipSuccessActivityLog());
