// Public, read-only projections for the homepage. The users collection is
// owner/admin-only by design, so instead of widening its rules these routes
// return just the display identity a visitor may see: never email, role or
// stored preferences.

var MAX_WRITERS = 24;
var ACTIVITY_PAGE_SIZE = 5;
var MAX_ACTIVITY_PAGE_SIZE = 10;
var EXCERPT_LENGTH = 60;
var MAX_IMAGE_URL_LENGTH = 2000;

// Every homepage view asks for both lists, so under load each request would
// rerun the same queries. Responses are kept briefly in the app store, which
// all hook VMs share. Writers are also invalidated whenever something they
// render changes (see site.pb.js) so curation shows up at once; activity just
// ages out.
var CACHE_PREFIX = 'site:';
var WRITERS_CACHE_KEY = CACHE_PREFIX + 'writers';
var WRITERS_CACHE_TTL_MS = 60 * 1000;
var ACTIVITY_CACHE_TTL_MS = 10 * 1000;
// How long one request may hold the refresh before another retries it.
var REFRESH_CLAIM_MS = 5 * 1000;

// Stale-while-revalidate: once an entry expires, the first request rebuilds it
// and concurrent ones keep serving the previous value instead of all hitting
// the database at once. The claim is best-effort (the store has no
// compare-and-set), which at worst lets a few requests rebuild together.
//
// Each invalidation bumps a generation. A rebuild that started before one may
// have read pre-change rows, so its result is returned but never stored:
// otherwise it could overwrite the invalidation and serve, say, a just
// suspended writer for a full TTL.
function generationKey(key) {
  return key + ':generation';
}

function cached(app, key, ttlMs, compute) {
  var store = app.store();
  var entry = store.get(key);
  var now = Date.now();
  if (entry && (entry.expiresAt > now || entry.refreshingUntil > now)) {
    return entry.value;
  }

  if (entry) {
    store.set(key, { expiresAt: entry.expiresAt, refreshingUntil: now + REFRESH_CLAIM_MS, value: entry.value });
  }
  // Read after claiming, so an invalidation racing the claim is still seen.
  var generation = store.get(generationKey(key)) || 0;

  var value = compute();
  if ((store.get(generationKey(key)) || 0) === generation) {
    store.set(key, { expiresAt: Date.now() + ttlMs, refreshingUntil: 0, value: value });
  }
  return value;
}

// Marks the list stale rather than deleting it, so the next request rebuilds
// it while concurrent ones are still answered.
function invalidateWriters(app) {
  var store = app.store();
  store.set(generationKey(WRITERS_CACHE_KEY), (store.get(generationKey(WRITERS_CACHE_KEY)) || 0) + 1);
  var entry = store.get(WRITERS_CACHE_KEY);
  if (entry) {
    store.set(WRITERS_CACHE_KEY, { expiresAt: 0, refreshingUntil: 0, value: entry.value });
  }
}

// Fields the writers row renders or filters on; other edits (theme saves and
// the like) leave the cached list valid.
var WRITER_FIELDS = {
  users: ['featuredWriter', 'name', 'avatar'],
  community_profiles: ['userId', 'displayName', 'handle', 'avatar', 'avatarUrl', 'isSuspended'],
};

function affectsWriters(record) {
  var fields = WRITER_FIELDS[record.collection().name] || [];
  var original = record.original();
  return fields.some(function (name) {
    return original.getString(name) !== record.getString(name);
  });
}

function core() {
  return require(__hooks + '/lib/community-core.js');
}

function timeOf(value) {
  var parsed = new Date(String(value || '').replace(' ', 'T')).getTime();
  return isFinite(parsed) ? parsed : 0;
}

function safeFind(app, collection, filter, sort, limit, params) {
  try {
    return app.findRecordsByFilter(collection, filter, sort, limit, 0, params || {});
  } catch (_) {
    return [];
  }
}

// Newsletter author avatars may be inline data URLs megabytes long; only a
// plain link is worth shipping in a list payload.
function shortImageUrl(value) {
  var text = core().asText(value).trim();
  return text.length <= MAX_IMAGE_URL_LENGTH && /^(https?:\/\/|\/)/.test(text) ? text : '';
}

// One query for every person a response mentions, keyed by user id.
function loadIdentities(app, userIds) {
  var c = core();
  var ids = c.uniqueStrings(userIds.filter(Boolean));
  var identities = {};
  if (!ids.length) {
    return identities;
  }

  var userFilter = c.buildInFilter('id', ids, 'u');
  safeFind(app, 'users', userFilter.filter, '', ids.length, userFilter.params).forEach(function (user) {
    identities[String(user.id)] = { user: user, profile: null };
  });

  var profileFilter = c.buildInFilter('userId', ids, 'p');
  safeFind(app, 'community_profiles', profileFilter.filter, '', ids.length, profileFilter.params).forEach(function (profile) {
    var userId = profile.getString('userId');
    identities[userId] = identities[userId] || { user: null, profile: null };
    identities[userId].profile = profile;
  });

  return identities;
}

function describe(app, identity) {
  var c = core();
  var user = identity ? identity.user : null;
  var profile = identity ? identity.profile : null;
  var userAvatar = user ? user.getString('avatar') : '';

  return {
    name: (profile && profile.getString('displayName')) || (user && user.getString('name')) || '',
    handle: profile ? profile.getString('handle') : '',
    avatarUrl: profile ? c.profileAvatarUrl(app, profile) : (userAvatar ? c.fileUrl(app, user, userAvatar) : ''),
    isSuspended: Boolean(profile && profile.getBool('isSuspended')),
  };
}

function listFeaturedWriters(app) {
  return cached(app, WRITERS_CACHE_KEY, WRITERS_CACHE_TTL_MS, function () {
    return buildFeaturedWriters(app);
  });
}

function buildFeaturedWriters(app) {
  var users = safeFind(app, 'users', 'featuredWriter = true', 'name', MAX_WRITERS);
  var identities = loadIdentities(app, users.map(function (user) { return String(user.id); }));

  var items = [];
  users.forEach(function (user) {
    var person = describe(app, identities[String(user.id)]);
    // Suspension hides a member everywhere public, curation included.
    if (person.isSuspended) {
      return;
    }
    items.push({
      id: String(user.id),
      name: person.name,
      handle: person.handle,
      avatarUrl: person.avatarUrl,
    });
  });

  return { items: items };
}

function joinedActivity(app, limit) {
  return safeFind(app, 'users', 'id != ""', '-created', limit).map(function (user) {
    return { kind: 'joined', id: 'joined-' + user.id, actorId: String(user.id), subjectId: '', subjectTitle: '', createdAt: user.getString('created') };
  });
}

// Mirrors the public feed: published top-level posts only. Sensitive posts
// still count as activity but never leak their text into the preview.
function postedActivity(app, limit) {
  var c = core();
  return safeFind(app, 'community_posts', 'status = "published" && kind != "reply"', '-created', limit).map(function (post) {
    var excerpt = post.getBool('sensitive') ? '' : c.truncate(c.trimBody(post.getString('body')).replace(/\s+/g, ' '), EXCERPT_LENGTH);
    return { kind: 'posted', id: 'posted-' + post.id, actorId: post.getString('authorId'), subjectId: String(post.id), subjectTitle: excerpt, createdAt: post.getString('created') };
  });
}

function publishedActivity(app, limit) {
  var c = core();
  return safeFind(app, 'newsletters', 'status = "published"', '-publishedAt,-created', limit).map(function (newsletter) {
    return {
      kind: 'published',
      id: 'published-' + newsletter.id,
      actorId: newsletter.getString('createdById'),
      fallbackName: newsletter.getString('author'),
      fallbackAvatarUrl: shortImageUrl(newsletter.getString('authorAvatar')),
      subjectId: String(newsletter.id),
      subjectTitle: c.truncate(newsletter.getString('title'), EXCERPT_LENGTH * 2),
      createdAt: newsletter.getString('publishedAt') || newsletter.getString('created'),
    };
  });
}

function listRecentActivity(e) {
  var c = core();
  var app = e.app;
  var query = e.requestInfo().query || {};
  var limit = c.clampPageSize(query.limit, ACTIVITY_PAGE_SIZE, MAX_ACTIVITY_PAGE_SIZE);

  return cached(app, CACHE_PREFIX + 'activity:' + limit, ACTIVITY_CACHE_TTL_MS, function () {
    return buildRecentActivity(app, limit);
  });
}

function buildRecentActivity(app, limit) {
  var events = [].concat(joinedActivity(app, limit), postedActivity(app, limit), publishedActivity(app, limit));
  var identities = loadIdentities(app, events.map(function (event) { return event.actorId; }));

  var items = [];
  events
    .sort(function (a, b) { return timeOf(b.createdAt) - timeOf(a.createdAt); })
    .forEach(function (event) {
      if (items.length >= limit) {
        return;
      }
      var person = describe(app, identities[event.actorId]);
      if (person.isSuspended) {
        return;
      }
      items.push({
        id: event.id,
        kind: event.kind,
        actorName: person.name || event.fallbackName || '',
        actorHandle: person.handle,
        avatarUrl: person.avatarUrl || event.fallbackAvatarUrl || '',
        subjectId: event.subjectId,
        subjectTitle: event.subjectTitle,
        createdAt: event.createdAt,
      });
    });

  return { items: items };
}

module.exports = {
  listFeaturedWriters: listFeaturedWriters,
  listRecentActivity: listRecentActivity,
  invalidateWriters: invalidateWriters,
  affectsWriters: affectsWriters,
};
