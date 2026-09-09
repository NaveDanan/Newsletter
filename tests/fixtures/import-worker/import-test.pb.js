// Mounted only in the disposable test container to exercise the actual cron path.
routerAdd('POST', '/api/test/import-tick', function (e) {
  var importer = require(__hooks + '/lib/scheduled-import.js');
  importer.ensureAdminAccess(e.auth);
  importer.tick(e.app);
  return e.json(200, importer.serializeJob(importer.ensureJob(e.app)));
}, $apis.requireAuth('users'));
