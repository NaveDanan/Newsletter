var COLLECTION = 'access_tokens';
var PREFIX = 'nlpat_';
var MANAGER_ROLES = ['manager', 'general_manager', 'admin'];

function isManager(user) {
  return Boolean(user && user.collection().name === 'users' && MANAGER_ROLES.indexOf(user.getString('role')) !== -1);
}
function timestamp(value) { return Date.parse(String(value || '').replace(' ', 'T')); }
function publicToken(record) {
  return {
    id: record.id, name: record.getString('name'), prefix: record.getString('prefix'),
    access: record.getString('access'), createdAt: record.getString('created'),
    expiresAt: record.getString('expiresAt'), lastUsedAt: record.getString('lastUsedAt'),
    expired: timestamp(record.getString('expiresAt')) <= Date.now(),
  };
}
function requireManagerSession(e) {
  if (!isManager(e.auth)) throw new ForbiddenError('Only managers and administrators can manage API tokens.');
}
function list(e) {
  requireManagerSession(e);
  var records = e.app.findRecordsByFilter(COLLECTION, 'ownerId = {:owner}', '-created', 20, 0, { owner: e.auth.id });
  e.response.header().set('Cache-Control', 'no-store');
  return e.json(200, { items: records.map(publicToken) });
}
function create(e) {
  requireManagerSession(e);
  var body = e.requestInfo().body || {};
  var name = typeof body.name === 'string' ? body.name.trim() : '';
  var access = body.access === undefined ? 'write' : body.access;
  var days = body.expiresInDays === undefined ? 90 : body.expiresInDays;
  if (!name || name.length > 80) throw new BadRequestError('Provide a token name of 1 to 80 characters.');
  if (['read', 'write'].indexOf(access) === -1) throw new BadRequestError('Choose read or write access.');
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 365) throw new BadRequestError('Token expiry must be between 1 and 365 days.');
  var secret = PREFIX + $security.randomString(48);
  var record;
  e.app.runInTransaction(function (tx) {
    var existing = tx.findRecordsByFilter(COLLECTION, 'ownerId = {:owner}', '', 20, 0, { owner: e.auth.id });
    if (existing.length >= 20) throw new BadRequestError('Revoke an existing token before creating more than 20 tokens.');
    record = new Record(tx.findCollectionByNameOrId(COLLECTION));
    record.set('ownerId', e.auth.id);
    record.set('name', name);
    record.set('tokenHash', $security.sha256(secret));
    record.set('prefix', secret.slice(0, 12));
    record.set('access', access);
    record.set('expiresAt', new Date(Date.now() + days * 86400000).toISOString());
    tx.save(record);
  });
  e.response.header().set('Cache-Control', 'no-store');
  return e.json(201, { token: secret, item: publicToken(record) });
}
function revoke(e) {
  requireManagerSession(e);
  var record;
  try { record = e.app.findRecordById(COLLECTION, e.request.pathValue('tokenId')); }
  catch (_) { throw new NotFoundError('Token not found.'); }
  if (record.getString('ownerId') !== e.auth.id) throw new NotFoundError('Token not found.');
  e.app.delete(record);
  return e.noContent(204);
}

function allowedTokenRoute(method, path) {
  if (method === 'GET') return /^\/api\/projects(?:\/(?:[^/]+)(?:\/(?:progress|tasks(?:\/[^/]+\/subtasks)?|milestones))?)?$/.test(path);
  if (method === 'POST') return /^\/api\/projects\/[^/]+\/(?:tasks(?:\/[^/]+\/subtasks)?|milestones)$/.test(path);
  if (method === 'PATCH') return /^\/api\/projects\/[^/]+\/(?:progress|status|tasks\/[^/]+(?:\/status)?)$/.test(path);
  if (method === 'DELETE') return /^\/api\/projects\/[^/]+\/tasks\/[^/]+$/.test(path);
  return false;
}

// Registered only on project routes, before PocketBase's requireAuth middleware.
// A personal token cannot become a general PocketBase session or mint tokens.
function authenticateProjectRequest(e) {
  var authorization = String(e.request.header.get('Authorization') || '').trim();
  var raw = authorization.replace(/^Bearer\s+/i, '');
  if (raw.indexOf(PREFIX) !== 0) return e.next();
  if (!/^Bearer\s+nlpat_[A-Za-z0-9]{48}$/i.test(authorization)) throw new UnauthorizedError('Invalid API token.');
  var record;
  try { record = e.app.findFirstRecordByFilter(COLLECTION, 'tokenHash = {:hash}', { hash: $security.sha256(raw) }); }
  catch (_) { throw new UnauthorizedError('Invalid API token.'); }
  if (!Number.isFinite(timestamp(record.getString('expiresAt'))) || timestamp(record.getString('expiresAt')) <= Date.now()) throw new UnauthorizedError('API token has expired.');
  var user;
  try { user = e.app.findRecordById('users', record.getString('ownerId')); }
  catch (_) { throw new UnauthorizedError('API token account is unavailable.'); }
  if (!isManager(user)) throw new ForbiddenError('The token owner no longer has manager access.');
  var method = e.request.method.toUpperCase();
  if (!allowedTokenRoute(method, e.request.url.path)) throw new ForbiddenError('This API token is limited to Gantt tasks and project progress.');
  if (method !== 'GET' && record.getString('access') !== 'write') throw new ForbiddenError('This API token has read-only access.');
  e.auth = user;
  // Record activity at most once per minute; token material is never persisted.
  if (!record.getString('lastUsedAt') || Date.now() - timestamp(record.getString('lastUsedAt')) > 60000) {
    try { e.app.db().newQuery('UPDATE access_tokens SET lastUsedAt = {:now} WHERE id = {:id}').bind({ now: new Date().toISOString().replace('T', ' '), id: record.id }).execute(); } catch (_) { /* Usage metadata does not block the request. */ }
  }
  return e.next();
}

module.exports = { list: list, create: create, revoke: revoke, authenticateProjectRequest: authenticateProjectRequest, allowedTokenRoute: allowedTokenRoute };
