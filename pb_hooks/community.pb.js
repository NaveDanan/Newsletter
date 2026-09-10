cronAdd('communityMaintenance', '*/10 * * * *', function () {
  require(__hooks + '/lib/community.js').tick($app);
});

// --- Session and profiles -------------------------------------------------

routerAdd('GET', '/api/community/me', function (e) {
  return e.json(200, require(__hooks + '/lib/community.js').getMe(e));
}, $apis.requireAuth('users'), $apis.skipSuccessActivityLog());

routerAdd('PATCH', '/api/community/me', function (e) {
  return e.json(200, require(__hooks + '/lib/community.js').updateProfile(e));
}, $apis.bodyLimit(0), $apis.requireAuth('users'), $apis.skipSuccessActivityLog());

routerAdd('GET', '/api/community/profiles/{handle}', function (e) {
  return e.json(200, require(__hooks + '/lib/community.js').getProfile(e, e.request.pathValue('handle')));
}, $apis.skipSuccessActivityLog());

routerAdd('GET', '/api/community/profiles/{handle}/posts', function (e) {
  return e.json(200, require(__hooks + '/lib/community.js').listProfilePosts(e, e.request.pathValue('handle')));
}, $apis.skipSuccessActivityLog());

routerAdd('GET', '/api/community/profiles/{handle}/followers', function (e) {
  return e.json(200, require(__hooks + '/lib/community.js').listProfileConnections(e, e.request.pathValue('handle'), 'followers'));
}, $apis.skipSuccessActivityLog());

routerAdd('GET', '/api/community/profiles/{handle}/following', function (e) {
  return e.json(200, require(__hooks + '/lib/community.js').listProfileConnections(e, e.request.pathValue('handle'), 'following'));
}, $apis.skipSuccessActivityLog());

routerAdd('POST', '/api/community/profiles/{handle}/follow', function (e) {
  return e.json(200, require(__hooks + '/lib/community.js').toggleFollow(e, e.request.pathValue('handle')));
}, $apis.bodyLimit(16384), $apis.requireAuth('users'), $apis.skipSuccessActivityLog());

routerAdd('POST', '/api/community/profiles/{handle}/block', function (e) {
  return e.json(200, require(__hooks + '/lib/community.js').toggleBlock(e, e.request.pathValue('handle')));
}, $apis.bodyLimit(16384), $apis.requireAuth('users'), $apis.skipSuccessActivityLog());

// --- Feed and posts -------------------------------------------------------

routerAdd('GET', '/api/community/feed', function (e) {
  return e.json(200, require(__hooks + '/lib/community.js').listFeed(e));
}, $apis.skipSuccessActivityLog());

routerAdd('GET', '/api/community/posts/{id}', function (e) {
  return e.json(200, require(__hooks + '/lib/community.js').getThread(e, e.request.pathValue('id')));
}, $apis.skipSuccessActivityLog());

routerAdd('POST', '/api/community/posts', function (e) {
  return e.json(200, require(__hooks + '/lib/community.js').createPost(e));
}, $apis.bodyLimit(131072), $apis.requireAuth('users'), $apis.skipSuccessActivityLog());

routerAdd('DELETE', '/api/community/posts/{id}', function (e) {
  return e.json(200, require(__hooks + '/lib/community.js').deletePost(e, e.request.pathValue('id')));
}, $apis.requireAuth('users'), $apis.skipSuccessActivityLog());

routerAdd('POST', '/api/community/posts/{id}/like', function (e) {
  return e.json(200, require(__hooks + '/lib/community.js').toggleLike(e, e.request.pathValue('id')));
}, $apis.bodyLimit(16384), $apis.requireAuth('users'), $apis.skipSuccessActivityLog());

routerAdd('POST', '/api/community/posts/{id}/repost', function (e) {
  return e.json(200, require(__hooks + '/lib/community.js').toggleRepost(e, e.request.pathValue('id')));
}, $apis.bodyLimit(16384), $apis.requireAuth('users'), $apis.skipSuccessActivityLog());

routerAdd('POST', '/api/community/posts/{id}/bookmark', function (e) {
  return e.json(200, require(__hooks + '/lib/community.js').toggleBookmark(e, e.request.pathValue('id')));
}, $apis.bodyLimit(16384), $apis.requireAuth('users'), $apis.skipSuccessActivityLog());

routerAdd('GET', '/api/community/bookmarks', function (e) {
  return e.json(200, require(__hooks + '/lib/community.js').listBookmarks(e));
}, $apis.requireAuth('users'), $apis.skipSuccessActivityLog());

// --- Media and link previews ----------------------------------------------

routerAdd('POST', '/api/community/media', function (e) {
  return e.json(200, require(__hooks + '/lib/community-content.js').createMedia(e));
}, $apis.bodyLimit(0), $apis.requireAuth('users'), $apis.skipSuccessActivityLog());

routerAdd('POST', '/api/community/link-preview', function (e) {
  return require(__hooks + '/lib/community-content.js').handleLinkPreview(e);
}, $apis.bodyLimit(16384), $apis.requireAuth('users'), $apis.skipSuccessActivityLog());

// --- Notifications --------------------------------------------------------

routerAdd('GET', '/api/community/notifications', function (e) {
  return e.json(200, require(__hooks + '/lib/community.js').listNotifications(e));
}, $apis.requireAuth('users'), $apis.skipSuccessActivityLog());

routerAdd('POST', '/api/community/notifications/read', function (e) {
  return e.json(200, require(__hooks + '/lib/community.js').markNotificationsRead(e));
}, $apis.bodyLimit(16384), $apis.requireAuth('users'), $apis.skipSuccessActivityLog());

// --- Discovery ------------------------------------------------------------

routerAdd('GET', '/api/community/search', function (e) {
  return e.json(200, require(__hooks + '/lib/community.js').search(e));
}, $apis.skipSuccessActivityLog());

routerAdd('GET', '/api/community/hashtags/{tag}', function (e) {
  return e.json(200, require(__hooks + '/lib/community.js').listHashtagPosts(e, e.request.pathValue('tag')));
}, $apis.skipSuccessActivityLog());

routerAdd('GET', '/api/community/trends', function (e) {
  return e.json(200, require(__hooks + '/lib/community.js').getTrends(e));
}, $apis.skipSuccessActivityLog());

// --- Reports and moderation -----------------------------------------------

routerAdd('POST', '/api/community/reports', function (e) {
  return e.json(200, require(__hooks + '/lib/community.js').createReport(e));
}, $apis.bodyLimit(16384), $apis.requireAuth('users'), $apis.skipSuccessActivityLog());

routerAdd('GET', '/api/community/moderation/reports', function (e) {
  return e.json(200, require(__hooks + '/lib/community.js').listReports(e));
}, $apis.requireAuth('users'), $apis.skipSuccessActivityLog());

routerAdd('PATCH', '/api/community/moderation/reports/{id}', function (e) {
  return e.json(200, require(__hooks + '/lib/community.js').resolveReport(e, e.request.pathValue('id')));
}, $apis.bodyLimit(16384), $apis.requireAuth('users'), $apis.skipSuccessActivityLog());

routerAdd('PATCH', '/api/community/moderation/posts/{id}', function (e) {
  return e.json(200, require(__hooks + '/lib/community.js').moderatePost(e, e.request.pathValue('id')));
}, $apis.bodyLimit(16384), $apis.requireAuth('users'), $apis.skipSuccessActivityLog());

routerAdd('PATCH', '/api/community/moderation/profiles/{handle}', function (e) {
  return e.json(200, require(__hooks + '/lib/community.js').moderateProfile(e, e.request.pathValue('handle')));
}, $apis.bodyLimit(16384), $apis.requireAuth('users'), $apis.skipSuccessActivityLog());
