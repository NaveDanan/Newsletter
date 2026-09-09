cronAdd('newsletterImportScheduler', '* * * * *', function () {
  require(__hooks + '/lib/scheduled-import.js').tick($app);
});

routerAdd('GET', '/api/scheduled/newsletter-import', function (e) {
  var importer = require(__hooks + '/lib/scheduled-import.js');
  importer.ensureAdminAccess(e.auth);
  return e.json(200, importer.serializeJob(importer.ensureJob(e.app)));
}, $apis.requireAuth('users'), $apis.skipSuccessActivityLog());

routerAdd('PATCH', '/api/scheduled/newsletter-import', function (e) {
  var importer = require(__hooks + '/lib/scheduled-import.js');
  importer.ensureAdminAccess(e.auth);
  return e.json(200, importer.updateJobSettings(e.app, e.auth, e.requestInfo().body || {}));
}, $apis.bodyLimit(16384), $apis.requireAuth('users'), $apis.skipSuccessActivityLog());

routerAdd('POST', '/api/scheduled/newsletter-import/run', function (e) {
  var importer = require(__hooks + '/lib/scheduled-import.js');
  importer.ensureAdminAccess(e.auth);
  return e.json(200, importer.runJobNow(e.app, false));
}, $apis.bodyLimit(16384), $apis.requireAuth('users'), $apis.skipSuccessActivityLog());

routerAdd('GET', '/api/scheduled/newsletter-import/files', function (e) {
  var importer = require(__hooks + '/lib/scheduled-import.js');
  importer.ensureAdminAccess(e.auth);
  return e.json(200, importer.listTrackedFiles(e.app, e.requestInfo().query || {}));
}, $apis.requireAuth('users'), $apis.skipSuccessActivityLog());

routerAdd('PATCH', '/api/scheduled/newsletter-import/files/{id}', function (e) {
  var importer = require(__hooks + '/lib/scheduled-import.js');
  importer.ensureAdminAccess(e.auth);
  return e.json(200, importer.changeTrackedFile(e.app, e.request.pathValue('id'), e.requestInfo().body || {}, false));
}, $apis.bodyLimit(16384), $apis.requireAuth('users'), $apis.skipSuccessActivityLog());

routerAdd('DELETE', '/api/scheduled/newsletter-import/files/{id}', function (e) {
  var importer = require(__hooks + '/lib/scheduled-import.js');
  importer.ensureAdminAccess(e.auth);
  return e.json(200, importer.changeTrackedFile(e.app, e.request.pathValue('id'), {}, true));
}, $apis.requireAuth('users'), $apis.skipSuccessActivityLog());
