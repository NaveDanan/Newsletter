// Public homepage data. See lib/site.js for why these exist instead of looser
// collection rules.

routerAdd('GET', '/api/site/writers', function (e) {
  return e.json(200, require(__hooks + '/lib/site.js').listFeaturedWriters(e.app));
}, $apis.skipSuccessActivityLog());

routerAdd('GET', '/api/site/activity', function (e) {
  return e.json(200, require(__hooks + '/lib/site.js').listRecentActivity(e));
}, $apis.skipSuccessActivityLog());

// A writer may have been added, removed, renamed, re-pictured or suspended.
function dropCachedWriters(e) {
  require(__hooks + '/lib/site.js').invalidateWriters(e.app);
  return e.next();
}

function dropCachedWritersIfAffected(e) {
  var site = require(__hooks + '/lib/site.js');
  if (site.affectsWriters(e.record)) {
    site.invalidateWriters(e.app);
  }
  return e.next();
}

onRecordAfterCreateSuccess(dropCachedWriters, 'users', 'community_profiles');
onRecordAfterUpdateSuccess(dropCachedWritersIfAffected, 'users', 'community_profiles');
onRecordAfterDeleteSuccess(dropCachedWriters, 'users', 'community_profiles');
