// One bounded query selects the newest six conversations, even when hundreds
// of notifications belong to the same post. No article bodies enter this path.
function list(app, userId) {
  var rows = arrayOf(new DynamicModel({
    id: '', kind: '', actorId: '', actorHandle: '', actorName: '', actorAvatarUrl: '',
    postId: '', rootId: '', preview: '', targetPath: '', isRead: false, createdAt: '',
  }));
  // Notification producers store article paths without a slug or query string.
  var key = "CASE WHEN kind = 'newsletter' THEN 'newsletter:' || postId " +
    "WHEN targetPath LIKE '/article/%' THEN 'article:' || substr(targetPath, 10) " +
    "WHEN targetPath LIKE '/community/post/%' THEN 'post:' || substr(targetPath, 17) " +
    "WHEN rootId != '' THEN 'post:' || rootId " +
    "WHEN postId != '' THEN 'post:' || postId ELSE 'notification:' || id END";
  app.db().newQuery(
    'WITH ranked AS (SELECT *, ' + key + ' AS groupKey, ROW_NUMBER() OVER (PARTITION BY ' + key + ' ORDER BY created DESC, id DESC) AS position FROM community_notifications WHERE userId = {:user}), ' +
    'recent AS (SELECT groupKey FROM ranked WHERE position = 1 ORDER BY created DESC, id DESC LIMIT 6) ' +
    'SELECT id, kind, actorId, actorHandle, actorName, actorAvatarUrl, postId, rootId, preview, targetPath, isRead, created AS createdAt FROM ranked ' +
    'WHERE groupKey IN (SELECT groupKey FROM recent) AND position <= 30 ORDER BY created DESC, id DESC'
  ).bind({ user: userId }).all(rows);
  return JSON.parse(JSON.stringify(rows));
}

function addActors(app, items) {
  var ids = [], params = {};
  items.forEach(function (item) { if (item.actorId && ids.indexOf(item.actorId) < 0) ids.push(item.actorId); });
  if (!ids.length) return items;
  var placeholders = ids.map(function (id, index) { params['actor' + index] = id; return '{:actor' + index + '}'; });
  var hasUserAvatar = app.findCollectionByNameOrId('users').fields.getByName('avatar');
  var userAvatar = hasUserAvatar ? "CASE WHEN u.avatar != '' THEN '/api/files/users/' || u.id || '/' || u.avatar ELSE '' END" : "''";
  var rows = arrayOf(new DynamicModel({ userId: '', handle: '', name: '', avatar: '' }));
  app.db().newQuery("SELECT u.id AS userId, COALESCE(p.handle, '') AS handle, COALESCE(NULLIF(p.displayName, ''), u.name) AS name, " +
    "CASE WHEN COALESCE(p.avatar, '') != '' THEN '/api/files/community_profiles/' || p.id || '/' || p.avatar ELSE COALESCE(NULLIF(p.avatarUrl, ''), " + userAvatar + ") END AS avatar " +
    'FROM users u LEFT JOIN community_profiles p ON p.userId = u.id WHERE u.id IN (' + placeholders.join(',') + ')').bind(params).all(rows);
  var actors = {};
  rows.forEach(function (row) { actors[row.userId] = row; });
  return items.map(function (item) {
    var actor = actors[item.actorId];
    if (actor) { item.actorName = actor.name; item.actorHandle = actor.handle || item.actorHandle; item.actorAvatarUrl = actor.avatar; }
    return item;
  });
}

function addCovers(app, items) {
  var ids = [], params = {};
  items.forEach(function (item) {
    if (item.kind === 'newsletter' && item.postId && ids.indexOf(item.postId) < 0) ids.push(item.postId);
  });
  if (!ids.length) return items;
  var placeholders = ids.map(function (id, index) { params['cover' + index] = id; return '{:cover' + index + '}'; });
  var covers = arrayOf(new DynamicModel({ id: '', coverImage: '', updated: '' }));
  app.db().newQuery("SELECT id, updated, CASE WHEN lower(substr(coverImage, 1, 11)) = 'data:image/' THEN '/api/newsletters/' || id || '/cover' ELSE substr(coverImage, 1, 2048) END AS coverImage FROM newsletters WHERE status = 'published' AND id IN (" + placeholders.join(',') + ')').bind(params).all(covers);
  var byId = {};
  covers.forEach(function (row) { byId[row.id] = row.coverImage.indexOf('/api/newsletters/') === 0 ? row.coverImage + '?v=' + encodeURIComponent(row.updated) : row.coverImage; });
  return items.map(function (item) { item.newsletterCoverUrl = byId[item.postId] || ''; return item; });
}

function addVisuals(app, items) { return addActors(app, addCovers(app, items)); }
module.exports = { list: list, addVisuals: addVisuals };
