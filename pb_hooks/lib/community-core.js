// Shared helpers for the community platform hook routes.
//
// This module is deliberately split into a pure section (no PocketBase globals)
// and a data-access section. scripts/test-community-core.cjs loads the file in a
// node:vm sandbox and exercises the pure section directly, the same way
// scripts/test-api-manager.cjs exercises pb_hooks/lib/api-manager.js.

var MAX_BODY_LENGTH = 5000;
var MAX_MEDIA_PER_POST = 4;
var MAX_REPLY_DEPTH = 25;
var MAX_HANDLE_LENGTH = 30;
var MIN_HANDLE_LENGTH = 3;
var MAX_BIO_LENGTH = 500;
var MAX_DISPLAY_NAME_LENGTH = 120;
var MAX_LOCATION_LENGTH = 120;
var MAX_ALT_TEXT_LENGTH = 1000;
var MAX_REPORT_DETAILS_LENGTH = 1000;
var FEED_PAGE_SIZE = 20;
var MAX_FEED_PAGE_SIZE = 50;
var NOTIFICATION_PAGE_SIZE = 30;
var PREVIEW_LENGTH = 140;

var MODERATOR_ROLES = ['manager', 'general_manager', 'admin'];
var POST_KINDS = ['post', 'reply', 'quote'];
var REPORT_REASONS = ['spam', 'abuse', 'harassment', 'misinformation', 'sensitive', 'other'];
var REPORT_STATUSES = ['open', 'resolved', 'dismissed'];
var NOTIFICATION_KINDS = ['like', 'reply', 'repost', 'quote', 'follow', 'mention'];
var FEED_TABS = ['for-you', 'following', 'latest'];
var PROFILE_TABS = ['posts', 'replies', 'media', 'likes'];

// Word characters for hashtags and handles. Goja does not reliably support
// unicode property escapes, so the Hebrew and Arabic blocks are listed out.
var WORD_CLASS = '0-9A-Za-z_\\u00C0-\\u024F\\u0590-\\u05FF\\u0600-\\u06FF';
var HASHTAG_PATTERN = new RegExp('(^|[^' + WORD_CLASS + '#])#([' + WORD_CLASS + ']{1,80})', 'g');
var MENTION_PATTERN = new RegExp('(^|[^' + WORD_CLASS + '@])@([0-9A-Za-z_]{' + MIN_HANDLE_LENGTH + ',' + MAX_HANDLE_LENGTH + '})', 'g');
var URL_PATTERN = /\bhttps?:\/\/[^\s<>"']{4,2000}/gi;
var HANDLE_PATTERN = /^[0-9A-Za-z_]+$/;
var CONTROL_CHARACTERS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function includes(list, value) {
  return list.indexOf(value) !== -1;
}

function asText(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeWhitespace(value) {
  return asText(value).replace(CONTROL_CHARACTERS, '').replace(/\r\n?/g, '\n');
}

function trimBody(value) {
  // Collapse runs of more than two blank lines so a post cannot pad the feed.
  return normalizeWhitespace(value).replace(/\n{3,}/g, '\n\n').replace(/[ \t]+$/gm, '').trim();
}

function truncate(value, length) {
  var text = asText(value);
  if (text.length <= length) {
    return text;
  }
  return text.slice(0, Math.max(0, length - 1)) + '\u2026';
}

function buildPreview(value) {
  return truncate(trimBody(value).replace(/\s+/g, ' '), PREVIEW_LENGTH);
}

function normalizeHandle(value) {
  return asText(value).trim().replace(/^@+/, '').toLowerCase();
}

function isValidHandle(value) {
  var handle = normalizeHandle(value);
  if (handle.length < MIN_HANDLE_LENGTH || handle.length > MAX_HANDLE_LENGTH) {
    return false;
  }
  if (!HANDLE_PATTERN.test(handle)) {
    return false;
  }
  // A purely numeric handle would collide with future numeric routes.
  return /[A-Za-z_]/.test(handle);
}

function suggestHandle(name, emailAddress, suffix) {
  var source = asText(name).trim() || asText(emailAddress).split('@')[0] || 'member';
  var base = source
    .toLowerCase()
    .replace(/[^0-9a-z]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_HANDLE_LENGTH);

  if (!/[a-z_]/.test(base)) {
    base = ('member_' + base).replace(/_+$/, '');
  }

  if (base.length < MIN_HANDLE_LENGTH) {
    base = (base + '_member').slice(0, MAX_HANDLE_LENGTH);
  }

  var extra = asText(suffix);
  if (!extra) {
    return base.slice(0, MAX_HANDLE_LENGTH);
  }

  return (base.slice(0, Math.max(MIN_HANDLE_LENGTH, MAX_HANDLE_LENGTH - extra.length - 1)) + '_' + extra)
    .slice(0, MAX_HANDLE_LENGTH);
}

// Deterministic 128-bit FNV-1a style digest. Used only as a cache key for link
// previews, never as a security primitive.
function hashKey(value) {
  var text = asText(value);
  var parts = [0x811c9dc5, 0x01000193, 0x811c9dc5, 0x01000193];
  var index;
  var slot;

  for (index = 0; index < text.length; index += 1) {
    slot = index % 4;
    parts[slot] = (parts[slot] ^ text.charCodeAt(index)) >>> 0;
    parts[slot] = (parts[slot] * 16777619) >>> 0;
    parts[(slot + 1) % 4] = (parts[(slot + 1) % 4] + text.charCodeAt(index) * (index + 1)) >>> 0;
  }

  var digest = '';
  for (index = 0; index < parts.length; index += 1) {
    digest += ('00000000' + parts[index].toString(16)).slice(-8);
  }

  return digest;
}

function normalizeUrl(value) {
  var raw = asText(value).trim();
  if (!raw) {
    return '';
  }

  var match = /^(https?):\/\/([^/?#\s]+)([^\s]*)$/i.exec(raw);
  if (!match) {
    return '';
  }

  var scheme = match[1].toLowerCase();
  var authority = match[2].toLowerCase();
  var rest = match[3] || '';

  // Credentials must never be persisted or re-fetched.
  var atIndex = authority.lastIndexOf('@');
  if (atIndex !== -1) {
    authority = authority.slice(atIndex + 1);
  }

  var host = authority;
  var port = '';
  var portIndex = authority.lastIndexOf(':');
  if (portIndex > 0 && authority.indexOf(']') === -1) {
    host = authority.slice(0, portIndex);
    port = authority.slice(portIndex);
  }

  if (!host || (host.indexOf('.') === -1 && host !== 'localhost')) {
    return '';
  }

  if (port === (scheme === 'https' ? ':443' : ':80')) {
    port = '';
  }

  var hashIndex = rest.indexOf('#');
  if (hashIndex !== -1) {
    rest = rest.slice(0, hashIndex);
  }

  if (rest === '/') {
    rest = '';
  }

  var normalized = scheme + '://' + host + port + rest;
  return normalized.length > 2000 ? '' : normalized;
}

function isPrivateHost(value) {
  var host = asText(value).toLowerCase();
  if (!host) {
    return true;
  }
  if (host === 'localhost' || host === '::1' || host.slice(-6) === '.local' || host.slice(-9) === '.internal') {
    return true;
  }
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^0\./.test(host)) {
    return true;
  }
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) {
    return true;
  }
  if (host.charAt(0) === '[') {
    return true;
  }
  return false;
}

function getUrlHost(value) {
  var match = /^https?:\/\/([^/?#\s]+)/i.exec(asText(value));
  if (!match) {
    return '';
  }
  var host = match[1].toLowerCase();
  var atIndex = host.lastIndexOf('@');
  if (atIndex !== -1) {
    host = host.slice(atIndex + 1);
  }
  var portIndex = host.lastIndexOf(':');
  if (portIndex > 0 && host.indexOf(']') === -1) {
    host = host.slice(0, portIndex);
  }
  return host;
}

function isFetchableUrl(value) {
  var normalized = normalizeUrl(value);
  if (!normalized) {
    return false;
  }
  return !isPrivateHost(getUrlHost(normalized));
}

function normalizeHashtag(value) {
  return asText(value).replace(/^#+/, '').toLowerCase().slice(0, 80);
}

function pushEntity(entities, entity) {
  var index;
  for (index = 0; index < entities.length; index += 1) {
    // Overlapping ranges would produce nested React nodes on render.
    if (entity.start < entities[index].end && entities[index].start < entity.end) {
      return;
    }
  }
  entities.push(entity);
}

// Returns plain-text offset ranges. The body itself is stored verbatim; the
// client renders each range as a React node because the shared HTML sanitizer
// drops anchors and every attribute.
function parseEntities(body) {
  var text = asText(body);
  var entities = [];
  var hashtags = [];
  var handles = [];
  var urls = [];
  var match;

  URL_PATTERN.lastIndex = 0;
  while ((match = URL_PATTERN.exec(text)) !== null) {
    var rawUrl = match[0].replace(/[.,;:!?)\]]+$/, '');
    var normalizedUrl = normalizeUrl(rawUrl);
    if (normalizedUrl) {
      pushEntity(entities, {
        type: 'url',
        start: match.index,
        end: match.index + rawUrl.length,
        value: normalizedUrl,
        display: rawUrl,
      });
      if (!includes(urls, normalizedUrl)) {
        urls.push(normalizedUrl);
      }
    }
    if (URL_PATTERN.lastIndex === match.index) {
      URL_PATTERN.lastIndex += 1;
    }
  }

  HASHTAG_PATTERN.lastIndex = 0;
  while ((match = HASHTAG_PATTERN.exec(text)) !== null) {
    var tagStart = match.index + match[1].length;
    var tag = normalizeHashtag(match[2]);
    if (tag) {
      pushEntity(entities, {
        type: 'hashtag',
        start: tagStart,
        end: tagStart + match[2].length + 1,
        value: tag,
        display: match[2],
      });
      if (!includes(hashtags, tag)) {
        hashtags.push(tag);
      }
    }
    if (HASHTAG_PATTERN.lastIndex === match.index) {
      HASHTAG_PATTERN.lastIndex += 1;
    }
  }

  MENTION_PATTERN.lastIndex = 0;
  while ((match = MENTION_PATTERN.exec(text)) !== null) {
    var mentionStart = match.index + match[1].length;
    var handle = normalizeHandle(match[2]);
    if (isValidHandle(handle)) {
      pushEntity(entities, {
        type: 'mention',
        start: mentionStart,
        end: mentionStart + match[2].length + 1,
        value: handle,
        display: match[2],
      });
      if (!includes(handles, handle)) {
        handles.push(handle);
      }
    }
    if (MENTION_PATTERN.lastIndex === match.index) {
      MENTION_PATTERN.lastIndex += 1;
    }
  }

  entities.sort(function (a, b) { return a.start - b.start; });

  return {
    entities: entities,
    hashtags: hashtags.slice(0, 10),
    handles: handles.slice(0, 10),
    urls: urls.slice(0, 5),
  };
}

function canModerate(role) {
  return includes(MODERATOR_ROLES, asText(role));
}

function encodeCursor(created, id) {
  var createdValue = asText(created);
  var idValue = asText(id);
  if (!createdValue || !idValue) {
    return '';
  }
  return createdValue + '|' + idValue;
}

function decodeCursor(value) {
  var raw = asText(value).trim();
  if (!raw) {
    return null;
  }
  var separator = raw.lastIndexOf('|');
  if (separator <= 0 || separator === raw.length - 1) {
    return null;
  }
  var created = raw.slice(0, separator);
  var id = raw.slice(separator + 1);
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9:.]{5,}Z?$/.test(created) || !/^[0-9a-zA-Z]{1,32}$/.test(id)) {
    return null;
  }
  return { created: created, id: id };
}

function clampPageSize(value, fallback, maximum) {
  var size = parseInt(String(value), 10);
  if (!isFinite(size) || size <= 0) {
    return fallback;
  }
  return Math.min(maximum, size);
}

// Builds `field = {:name0} || field = {:name1} ...` with a params object so the
// values never reach the filter string. The existing newsletter list handler
// interpolates its filter directly; the community routes must not.
function buildInFilter(field, values, prefix) {
  var clauses = [];
  var params = {};
  var index;
  for (index = 0; index < values.length; index += 1) {
    var key = prefix + index;
    clauses.push(field + ' = {:' + key + '}');
    params[key] = values[index];
  }
  return { filter: clauses.length ? '(' + clauses.join(' || ') + ')' : '', params: params };
}

// PocketBase filters have no boolean NOT operator, so an exclusion list is
// written as a conjunction of != comparisons rather than as !(a || b).
function buildNotInFilter(field, values, prefix) {
  var clauses = [];
  var params = {};
  var index;
  for (index = 0; index < values.length; index += 1) {
    var key = prefix + index;
    clauses.push(field + ' != {:' + key + '}');
    params[key] = values[index];
  }
  return { filter: clauses.length ? '(' + clauses.join(' && ') + ')' : '', params: params };
}

// A bound parameter that holds an empty string does not match an empty column
// inside the PocketBase JSVM, so an optional discriminator is emitted as the
// literal `field = ""` and only a populated value travels as a parameter.
function buildEqualsFilter(field, value, key) {
  var params = {};
  if (!value) {
    return { filter: field + ' = ""', params: params };
  }
  params[key] = value;
  return { filter: field + ' = {:' + key + '}', params: params };
}

function uniqueStrings(values) {
  var result = [];
  var index;
  for (index = 0; index < values.length; index += 1) {
    var value = asText(values[index]);
    if (value && !includes(result, value)) {
      result.push(value);
    }
  }
  return result;
}

function validatePostInput(body, mediaCount, hasQuote) {
  var text = trimBody(body);
  if (text.length > MAX_BODY_LENGTH) {
    return { ok: false, message: 'A post can contain at most ' + MAX_BODY_LENGTH + ' characters.' };
  }
  if (!text && !mediaCount && !hasQuote) {
    return { ok: false, message: 'Write something or attach media before posting.' };
  }
  if (mediaCount > MAX_MEDIA_PER_POST) {
    return { ok: false, message: 'A post can include at most ' + MAX_MEDIA_PER_POST + ' attachments.' };
  }
  return { ok: true, body: text };
}

function normalizeWebsite(value) {
  var raw = asText(value).trim();
  if (!raw) {
    return '';
  }
  var candidate = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
  return normalizeUrl(candidate);
}

// ---------------------------------------------------------------------------
// PocketBase access helpers
// ---------------------------------------------------------------------------

function readJson(record, field, fallback) {
  // PocketBase JSON fields arrive as Go byte slices inside hooks.
  try {
    var parsed = JSON.parse(toString(record.get(field)));
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (_) {
    return fallback;
  }
}

function readJsonArray(record, field) {
  var value = readJson(record, field, []);
  return Array.isArray(value) ? value : [];
}

function nowIso() {
  return new Date().toISOString();
}

function getAuthId(auth) {
  return auth && auth.id ? String(auth.id) : '';
}

function getAuthRole(auth) {
  return auth && typeof auth.getString === 'function' ? auth.getString('role') : '';
}

function requireAuth(auth) {
  var id = getAuthId(auth);
  if (!id) {
    throw new ForbiddenError('Sign in to use the community.');
  }
  return id;
}

// A JSON request has no multipart body, and PocketBase throws rather than
// returning an empty list when the content type does not match. PATCH
// /api/community/me accepts both shapes, so the lookup is guarded.
function readUploadedFiles(e, field) {
  if (!e || typeof e.findUploadedFiles !== 'function') {
    return [];
  }
  try {
    return e.findUploadedFiles(field) || [];
  } catch (_) {
    return [];
  }
}

function findOneOrNull(app, collection, filter, params) {
  try {
    var records = app.findRecordsByFilter(collection, filter, '', 1, 0, params || {});
    return records.length ? records[0] : null;
  } catch (_) {
    return null;
  }
}

function findByIdOrNull(app, collection, id) {
  if (!asText(id)) {
    return null;
  }
  try {
    return app.findRecordById(collection, id);
  } catch (_) {
    return null;
  }
}

function newRecord(app, collection) {
  return new Record(app.findCollectionByNameOrId(collection));
}

function setValues(record, values) {
  Object.keys(values).forEach(function (key) {
    record.set(key, values[key]);
  });
  return record;
}

// Returns a root-relative PocketBase file path. The browser resolves it
// against getPocketBaseUrl(), so a denormalized copy stays valid across
// origins and deployments.
function fileUrl(app, record, fileName) {
  if (!record || !asText(fileName)) {
    return '';
  }
  var collectionId;
  try {
    collectionId = String(record.collection().id);
  } catch (_) {
    return '';
  }
  return '/api/files/' + collectionId + '/' + record.id + '/' + fileName;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

var RATE_LIMITS = {
  post: { limit: 30, windowMs: 3600000 },
  reply: { limit: 90, windowMs: 3600000 },
  like: { limit: 600, windowMs: 3600000 },
  follow: { limit: 200, windowMs: 3600000 },
  media: { limit: 60, windowMs: 3600000 },
  preview: { limit: 60, windowMs: 3600000 },
  report: { limit: 30, windowMs: 3600000 },
  profile: { limit: 40, windowMs: 3600000 },
};

function buildBucketKey(action, userId, windowMs, timestamp) {
  return action + ':' + userId + ':' + Math.floor(timestamp / windowMs);
}

function enforceRateLimit(app, action, userId) {
  var rule = RATE_LIMITS[action];
  if (!rule || !userId) {
    return;
  }

  var key = buildBucketKey(action, userId, rule.windowMs, Date.now());
  var exceeded = false;

  app.runInTransaction(function (tx) {
    var record = findOneOrNull(tx, 'community_rate_limits', 'bucketKey = {:key}', { key: key });
    if (!record) {
      record = newRecord(tx, 'community_rate_limits');
      setValues(record, { bucketKey: key, count: 1, windowStartedAt: nowIso() });
      tx.save(record);
      return;
    }

    var count = record.getInt('count');
    if (count >= rule.limit) {
      exceeded = true;
      return;
    }

    record.set('count', count + 1);
    tx.save(record);
  });

  if (exceeded) {
    throw new BadRequestError('You are doing that too often. Try again a little later.');
  }
}

function pruneRateLimits(app) {
  var cutoff = new Date(Date.now() - 7200000).toISOString();
  try {
    var stale = app.findRecordsByFilter('community_rate_limits', 'created < {:cutoff}', 'created', 500, 0, { cutoff: cutoff });
    stale.forEach(function (record) {
      try { app.delete(record); } catch (_) {}
    });
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

function findProfileByUserId(app, userId) {
  return findOneOrNull(app, 'community_profiles', 'userId = {:userId}', { userId: asText(userId) });
}

function findProfileByHandle(app, handle) {
  return findOneOrNull(app, 'community_profiles', 'handle = {:handle}', { handle: normalizeHandle(handle) });
}

function isHandleTaken(app, handle, exceptProfileId) {
  var existing = findProfileByHandle(app, handle);
  if (!existing) {
    return false;
  }
  return String(existing.id) !== asText(exceptProfileId);
}

function resolveAvatarUrl(app, userRecord) {
  if (!userRecord) {
    return '';
  }
  var avatar = userRecord.getString('avatar');
  return avatar ? fileUrl(app, userRecord, avatar) : '';
}

// Profiles are created lazily. The users collection restricts list/view to the
// record owner, so every reader depends on this denormalized copy.
function ensureProfile(app, userId) {
  var existing = findProfileByUserId(app, userId);
  if (existing) {
    return existing;
  }

  var userRecord = findByIdOrNull(app, 'users', userId);
  if (!userRecord) {
    throw new NotFoundError('That account no longer exists.');
  }

  var name = userRecord.getString('name');
  var emailAddress = userRecord.getString('email');
  var attempt = 0;
  var handle = suggestHandle(name, emailAddress, '');

  while (attempt < 12 && (!isValidHandle(handle) || isHandleTaken(app, handle, ''))) {
    attempt += 1;
    handle = suggestHandle(name, emailAddress, String(attempt === 1 ? 1 : Math.floor(Math.random() * 100000)));
  }

  if (!isValidHandle(handle) || isHandleTaken(app, handle, '')) {
    handle = 'member_' + $security.randomString(10).toLowerCase();
  }

  var profile = newRecord(app, 'community_profiles');
  setValues(profile, {
    userId: String(userId),
    handle: handle,
    displayName: truncate(name || emailAddress.split('@')[0] || 'Member', MAX_DISPLAY_NAME_LENGTH),
    bio: '',
    avatarUrl: resolveAvatarUrl(app, userRecord),
    followerCount: 0,
    followingCount: 0,
    postCount: 0,
    isSuspended: false,
  });

  try {
    app.save(profile);
  } catch (error) {
    // A concurrent request may have created the profile first.
    var raced = findProfileByUserId(app, userId);
    if (raced) {
      return raced;
    }
    throw error;
  }

  return profile;
}

function requireProfile(app, auth) {
  var userId = requireAuth(auth);
  var profile = ensureProfile(app, userId);
  if (profile.getBool('isSuspended') && !canModerate(getAuthRole(auth))) {
    throw new ForbiddenError('This account cannot post in the community.');
  }
  return profile;
}

function profileAvatarUrl(app, profile) {
  if (!profile) {
    return '';
  }
  var uploaded = profile.getString('avatar');
  if (uploaded) {
    return fileUrl(app, profile, uploaded);
  }
  return profile.getString('avatarUrl');
}

function serializeProfile(app, profile, viewerState) {
  if (!profile) {
    return null;
  }

  var banner = profile.getString('banner');

  return {
    id: String(profile.id),
    userId: profile.getString('userId'),
    handle: profile.getString('handle'),
    displayName: profile.getString('displayName'),
    bio: profile.getString('bio'),
    location: profile.getString('location'),
    website: profile.getString('website'),
    avatarUrl: profileAvatarUrl(app, profile),
    bannerUrl: banner ? fileUrl(app, profile, banner) : '',
    pinnedPostId: profile.getString('pinnedPostId'),
    followerCount: profile.getInt('followerCount'),
    followingCount: profile.getInt('followingCount'),
    postCount: profile.getInt('postCount'),
    isSuspended: profile.getBool('isSuspended'),
    suspendedReason: profile.getString('suspendedReason'),
    createdAt: profile.getString('created'),
    isFollowing: Boolean(viewerState && viewerState.isFollowing),
    isFollowedBy: Boolean(viewerState && viewerState.isFollowedBy),
    isSelf: Boolean(viewerState && viewerState.isSelf),
  };
}

module.exports = {
  MAX_BODY_LENGTH: MAX_BODY_LENGTH,
  MAX_MEDIA_PER_POST: MAX_MEDIA_PER_POST,
  MAX_REPLY_DEPTH: MAX_REPLY_DEPTH,
  MAX_HANDLE_LENGTH: MAX_HANDLE_LENGTH,
  MIN_HANDLE_LENGTH: MIN_HANDLE_LENGTH,
  MAX_BIO_LENGTH: MAX_BIO_LENGTH,
  MAX_DISPLAY_NAME_LENGTH: MAX_DISPLAY_NAME_LENGTH,
  MAX_LOCATION_LENGTH: MAX_LOCATION_LENGTH,
  MAX_ALT_TEXT_LENGTH: MAX_ALT_TEXT_LENGTH,
  MAX_REPORT_DETAILS_LENGTH: MAX_REPORT_DETAILS_LENGTH,
  FEED_PAGE_SIZE: FEED_PAGE_SIZE,
  MAX_FEED_PAGE_SIZE: MAX_FEED_PAGE_SIZE,
  NOTIFICATION_PAGE_SIZE: NOTIFICATION_PAGE_SIZE,
  MODERATOR_ROLES: MODERATOR_ROLES,
  POST_KINDS: POST_KINDS,
  REPORT_REASONS: REPORT_REASONS,
  REPORT_STATUSES: REPORT_STATUSES,
  NOTIFICATION_KINDS: NOTIFICATION_KINDS,
  FEED_TABS: FEED_TABS,
  PROFILE_TABS: PROFILE_TABS,
  RATE_LIMITS: RATE_LIMITS,

  includes: includes,
  asText: asText,
  trimBody: trimBody,
  truncate: truncate,
  buildPreview: buildPreview,
  normalizeHandle: normalizeHandle,
  isValidHandle: isValidHandle,
  suggestHandle: suggestHandle,
  hashKey: hashKey,
  normalizeUrl: normalizeUrl,
  normalizeWebsite: normalizeWebsite,
  isPrivateHost: isPrivateHost,
  getUrlHost: getUrlHost,
  isFetchableUrl: isFetchableUrl,
  normalizeHashtag: normalizeHashtag,
  parseEntities: parseEntities,
  canModerate: canModerate,
  encodeCursor: encodeCursor,
  decodeCursor: decodeCursor,
  clampPageSize: clampPageSize,
  buildInFilter: buildInFilter,
  buildNotInFilter: buildNotInFilter,
  buildEqualsFilter: buildEqualsFilter,
  buildBucketKey: buildBucketKey,
  uniqueStrings: uniqueStrings,
  validatePostInput: validatePostInput,

  readJson: readJson,
  readJsonArray: readJsonArray,
  nowIso: nowIso,
  getAuthId: getAuthId,
  getAuthRole: getAuthRole,
  requireAuth: requireAuth,
  findOneOrNull: findOneOrNull,
  findByIdOrNull: findByIdOrNull,
  readUploadedFiles: readUploadedFiles,
  newRecord: newRecord,
  setValues: setValues,
  fileUrl: fileUrl,
  enforceRateLimit: enforceRateLimit,
  pruneRateLimits: pruneRateLimits,
  findProfileByUserId: findProfileByUserId,
  findProfileByHandle: findProfileByHandle,
  isHandleTaken: isHandleTaken,
  ensureProfile: ensureProfile,
  requireProfile: requireProfile,
  profileAvatarUrl: profileAvatarUrl,
  serializeProfile: serializeProfile,
};
