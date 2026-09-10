// Serialization, media, link previews, hashtags and notifications for the
// community platform. Everything a reader receives is assembled here so the
// browser never needs `expand` or a second round trip.

function core() {
  return require(__hooks + '/lib/community-core.js');
}

var LINK_PREVIEW_TIMEOUT_SECONDS = 8;
var LINK_PREVIEW_MAX_BYTES = 524288;
var LINK_PREVIEW_TTL_MS = 604800000;

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

function serializeMedia(app, record) {
  if (!record) {
    return null;
  }

  var c = core();
  var kind = record.getString('kind') || 'image';
  var imageName = record.getString('image');
  var videoName = record.getString('video');
  var posterName = record.getString('poster');

  return {
    id: String(record.id),
    kind: kind,
    url: kind === 'video' ? c.fileUrl(app, record, videoName) : c.fileUrl(app, record, imageName),
    posterUrl: posterName ? c.fileUrl(app, record, posterName) : '',
    altText: record.getString('altText'),
    width: record.getInt('width'),
    height: record.getInt('height'),
    durationMs: record.getInt('durationMs'),
    byteSize: record.getInt('byteSize'),
  };
}

function loadMediaByIds(app, ids) {
  var c = core();
  var unique = c.uniqueStrings(ids || []);
  var map = {};
  if (!unique.length) {
    return map;
  }

  var built = c.buildInFilter('id', unique.slice(0, 200), 'media');
  var records = [];
  try {
    records = app.findRecordsByFilter('community_media', built.filter, 'created', 200, 0, built.params);
  } catch (_) {
    records = [];
  }

  records.forEach(function (record) {
    map[String(record.id)] = record;
  });

  return map;
}

function getUploadedFileSize(file) {
  if (!file) {
    return 0;
  }
  if (typeof file.size === 'number') {
    return file.size;
  }
  if (file.header && typeof file.header.size === 'number') {
    return file.header.size;
  }
  return 0;
}

function getUploadedFileName(file) {
  if (!file) {
    return '';
  }
  return String(file.originalName || file.name || '');
}

function detectMediaKind(file, requested) {
  var name = getUploadedFileName(file).toLowerCase();
  if (requested === 'video' || /\.(mp4|webm|mov)$/.test(name)) {
    return 'video';
  }
  return 'image';
}

function createMedia(e) {
  var c = core();
  var app = e.app;
  var profile = c.requireProfile(app, e.auth);
  var ownerId = profile.getString('userId');

  c.enforceRateLimit(app, 'media', ownerId);

  var body = e.requestInfo().body || {};
  var files = c.readUploadedFiles(e, 'file');
  if (!files.length) {
    throw new BadRequestError('Choose a file to upload.');
  }

  var file = files[0];
  var kind = detectMediaKind(file, String(body.kind || ''));
  var size = getUploadedFileSize(file);
  var limit = kind === 'video' ? 104857600 : 10485760;

  if (size > limit) {
    throw new BadRequestError(kind === 'video'
      ? 'Videos must be 100 MB or smaller.'
      : 'Images must be 10 MB or smaller.');
  }

  var record = c.newRecord(app, 'community_media');
  c.setValues(record, {
    ownerId: ownerId,
    postId: '',
    kind: kind,
    altText: c.truncate(String(body.altText || ''), c.MAX_ALT_TEXT_LENGTH),
    width: Math.max(0, Math.floor(Number(body.width) || 0)),
    height: Math.max(0, Math.floor(Number(body.height) || 0)),
    durationMs: Math.max(0, Math.floor(Number(body.durationMs) || 0)),
    byteSize: size,
    status: 'pending',
  });
  record.set(kind === 'video' ? 'video' : 'image', file);

  var posters = c.readUploadedFiles(e, 'poster');
  if (kind === 'video' && posters.length) {
    record.set('poster', posters[0]);
  }

  app.save(record);

  return serializeMedia(app, record);
}

// Media uploaded but never attached to a post would otherwise accumulate.
function pruneOrphanMedia(app) {
  var cutoff = new Date(Date.now() - 86400000).toISOString();
  try {
    var orphans = app.findRecordsByFilter(
      'community_media',
      'status = "pending" && created < {:cutoff}',
      'created',
      200,
      0,
      { cutoff: cutoff }
    );
    orphans.forEach(function (record) {
      try { app.delete(record); } catch (_) {}
    });
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Hashtags
// ---------------------------------------------------------------------------

function touchHashtags(app, tags, displayMap, delta) {
  var c = core();
  (tags || []).forEach(function (tag) {
    try {
      app.runInTransaction(function (tx) {
        var record = c.findOneOrNull(tx, 'community_hashtags', 'tag = {:tag}', { tag: tag });
        if (!record) {
          if (delta <= 0) {
            return;
          }
          record = c.newRecord(tx, 'community_hashtags');
          c.setValues(record, {
            tag: tag,
            displayTag: (displayMap && displayMap[tag]) || tag,
            postCount: 0,
            recentCount: 0,
          });
        }
        record.set('postCount', Math.max(0, record.getInt('postCount') + delta));
        record.set('recentCount', Math.max(0, record.getInt('recentCount') + delta));
        if (delta > 0) {
          record.set('lastUsedAt', c.nowIso());
        }
        tx.save(record);
      });
    } catch (_) {}
  });
}

function serializeHashtag(record) {
  return {
    tag: record.getString('tag'),
    displayTag: record.getString('displayTag') || record.getString('tag'),
    postCount: record.getInt('postCount'),
    recentCount: record.getInt('recentCount'),
    lastUsedAt: record.getString('lastUsedAt'),
  };
}

// ---------------------------------------------------------------------------
// Link previews
// ---------------------------------------------------------------------------

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, function (_, hex) { return String.fromCharCode(parseInt(hex, 16)); })
    .replace(/&#(\d+);/g, function (_, dec) { return String.fromCharCode(parseInt(dec, 10)); })
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function findMetaContent(html, names) {
  var index;
  for (index = 0; index < names.length; index += 1) {
    var name = names[index].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var patterns = [
      new RegExp('<meta[^>]+(?:property|name)\\s*=\\s*["\']' + name + '["\'][^>]*content\\s*=\\s*["\']([^"\']*)["\']', 'i'),
      new RegExp('<meta[^>]+content\\s*=\\s*["\']([^"\']*)["\'][^>]*(?:property|name)\\s*=\\s*["\']' + name + '["\']', 'i'),
    ];
    var patternIndex;
    for (patternIndex = 0; patternIndex < patterns.length; patternIndex += 1) {
      var match = patterns[patternIndex].exec(html);
      if (match && match[1]) {
        return decodeHtmlEntities(match[1]).trim();
      }
    }
  }
  return '';
}

function parseOpenGraph(html, url) {
  var c = core();
  var titleMatch = /<title[^>]*>([\s\S]{0,500}?)<\/title>/i.exec(html);

  return {
    title: c.truncate(findMetaContent(html, ['og:title', 'twitter:title']) || (titleMatch ? decodeHtmlEntities(titleMatch[1]).replace(/\s+/g, ' ').trim() : ''), 300),
    description: c.truncate(findMetaContent(html, ['og:description', 'twitter:description', 'description']), 600),
    imageUrl: c.normalizeUrl(findMetaContent(html, ['og:image:secure_url', 'og:image', 'twitter:image'])),
    siteName: c.truncate(findMetaContent(html, ['og:site_name']) || c.getUrlHost(url), 200),
  };
}

function serializeLinkPreview(record) {
  if (!record) {
    return null;
  }
  return {
    url: record.getString('url'),
    title: record.getString('title'),
    description: record.getString('description'),
    imageUrl: record.getString('imageUrl'),
    siteName: record.getString('siteName'),
    status: record.getString('status') || 'ok',
  };
}

function fetchLinkPreview(app, rawUrl) {
  var c = core();
  var url = c.normalizeUrl(rawUrl);
  if (!url || !c.isFetchableUrl(url)) {
    return null;
  }

  var key = c.hashKey(url);
  var cached = c.findOneOrNull(app, 'community_link_previews', 'urlKey = {:key}', { key: key });
  if (cached) {
    var age = Date.now() - (new Date(cached.getString('fetchedAt')).getTime() || 0);
    if (age >= 0 && age < LINK_PREVIEW_TTL_MS) {
      return serializeLinkPreview(cached);
    }
  }

  var parsed = { title: '', description: '', imageUrl: '', siteName: c.getUrlHost(url) };
  var status = 'ok';

  try {
    var response = $http.send({
      url: url,
      method: 'GET',
      timeout: LINK_PREVIEW_TIMEOUT_SECONDS,
      headers: { 'User-Agent': 'NewsletterCommunityBot/1.0 (+link-preview)' },
    });

    if (response.statusCode >= 400) {
      status = 'error';
    } else {
      var html = toString(response.body).slice(0, LINK_PREVIEW_MAX_BYTES);
      parsed = parseOpenGraph(html, url);
      if (!parsed.title && !parsed.description) {
        status = 'empty';
      }
    }
  } catch (_) {
    status = 'error';
  }

  var record = cached || c.newRecord(app, 'community_link_previews');
  c.setValues(record, {
    urlKey: key,
    url: url,
    title: parsed.title,
    description: parsed.description,
    imageUrl: parsed.imageUrl,
    siteName: parsed.siteName,
    status: status,
    fetchedAt: c.nowIso(),
  });

  try {
    app.save(record);
  } catch (_) {
    return {
      url: url,
      title: parsed.title,
      description: parsed.description,
      imageUrl: parsed.imageUrl,
      siteName: parsed.siteName,
      status: status,
    };
  }

  return serializeLinkPreview(record);
}

function handleLinkPreview(e) {
  var c = core();
  var profile = c.requireProfile(e.app, e.auth);
  c.enforceRateLimit(e.app, 'preview', profile.getString('userId'));

  var body = e.requestInfo().body || {};
  var preview = fetchLinkPreview(e.app, String(body.url || ''));
  if (!preview || preview.status === 'error') {
    return e.json(200, { preview: null });
  }

  return e.json(200, { preview: preview });
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

function createNotification(app, options) {
  var c = core();
  var userId = c.asText(options.userId);
  var actorId = c.asText(options.actorId);

  if (!userId || !actorId || userId === actorId) {
    return;
  }

  try {
    var record = c.newRecord(app, 'community_notifications');
    c.setValues(record, {
      userId: userId,
      actorId: actorId,
      actorHandle: c.asText(options.actorHandle),
      actorName: c.asText(options.actorName),
      actorAvatarUrl: c.asText(options.actorAvatarUrl),
      kind: c.asText(options.kind),
      postId: c.asText(options.postId),
      rootId: c.asText(options.rootId),
      preview: c.truncate(c.asText(options.preview), 300),
      isRead: false,
    });
    app.save(record);
  } catch (_) {
    // The unique (userId, actorId, kind, postId) index collapses repeats such as
    // an unlike/like cycle into a single notification.
  }
}

function removeNotification(app, userId, actorId, kind, postId) {
  var c = core();
  // A follow notification carries no post, and a bound empty parameter matches
  // no row, so the empty case has to be compared as a filter literal.
  var postClause = c.buildEqualsFilter('postId', c.asText(postId), 'postId');
  var params = { userId: c.asText(userId), actorId: c.asText(actorId), kind: kind };
  Object.keys(postClause.params).forEach(function (key) { params[key] = postClause.params[key]; });

  var record = c.findOneOrNull(
    app,
    'community_notifications',
    'userId = {:userId} && actorId = {:actorId} && kind = {:kind} && ' + postClause.filter,
    params
  );
  if (record) {
    try { app.delete(record); } catch (_) {}
  }
}

function serializeNotification(record) {
  return {
    id: String(record.id),
    kind: record.getString('kind'),
    actorId: record.getString('actorId'),
    actorHandle: record.getString('actorHandle'),
    actorName: record.getString('actorName'),
    actorAvatarUrl: record.getString('actorAvatarUrl'),
    postId: record.getString('postId'),
    rootId: record.getString('rootId'),
    preview: record.getString('preview'),
    isRead: record.getBool('isRead'),
    createdAt: record.getString('created'),
  };
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

function collectViewerState(app, viewerId, postIds) {
  var c = core();
  var state = { likes: {}, reposts: {}, bookmarks: {} };
  var ids = c.uniqueStrings(postIds || []);

  if (!viewerId || !ids.length) {
    return state;
  }

  var built = c.buildInFilter('postId', ids.slice(0, 200), 'vp');
  var filter = built.filter + ' && userId = {:viewer}';
  var params = built.params;
  params.viewer = viewerId;

  [['community_likes', 'likes'], ['community_reposts', 'reposts'], ['community_bookmarks', 'bookmarks']]
    .forEach(function (pair) {
      try {
        app.findRecordsByFilter(pair[0], filter, '', 400, 0, params).forEach(function (record) {
          state[pair[1]][record.getString('postId')] = true;
        });
      } catch (_) {}
    });

  return state;
}

function collectFollowState(app, viewerId, userIds) {
  var c = core();
  var following = {};
  var ids = c.uniqueStrings(userIds || []);

  if (!viewerId || !ids.length) {
    return following;
  }

  var built = c.buildInFilter('followingId', ids.slice(0, 200), 'vf');
  var params = built.params;
  params.viewer = viewerId;

  try {
    app.findRecordsByFilter('community_follows', built.filter + ' && followerId = {:viewer}', '', 400, 0, params)
      .forEach(function (record) {
        following[record.getString('followingId')] = true;
      });
  } catch (_) {}

  return following;
}

function loadPostsByIds(app, ids) {
  var c = core();
  var unique = c.uniqueStrings(ids || []);
  var map = {};
  if (!unique.length) {
    return map;
  }

  var built = c.buildInFilter('id', unique.slice(0, 200), 'post');
  try {
    app.findRecordsByFilter('community_posts', built.filter, '', 200, 0, built.params).forEach(function (record) {
      map[String(record.id)] = record;
    });
  } catch (_) {}

  return map;
}

function isVisible(post, viewerId, viewerRole) {
  var c = core();
  if (!post) {
    return false;
  }
  var status = post.getString('status') || 'published';
  if (status === 'published') {
    return true;
  }
  if (c.canModerate(viewerRole)) {
    return true;
  }
  return status === 'removed' && post.getString('authorId') === c.asText(viewerId);
}

// A removed post keeps its position in a thread so replies stay reachable, but
// its body and media never reach the client.
function serializeRemovedPost(post) {
  return {
    id: String(post.id),
    status: post.getString('status'),
    removedReason: post.getString('removedReason'),
    createdAt: post.getString('created'),
    kind: post.getString('kind') || 'post',
    parentId: post.getString('parentId'),
    rootId: post.getString('rootId'),
    body: '',
    entities: [],
    media: [],
    linkPreview: null,
    quotedPost: null,
    author: null,
    likeCount: 0,
    replyCount: post.getInt('replyCount'),
    repostCount: 0,
    quoteCount: 0,
    bookmarkCount: 0,
    liked: false,
    reposted: false,
    bookmarked: false,
    isAuthor: false,
    canModerate: false,
  };
}

function serializePost(app, post, ctx) {
  var c = core();
  if (!post) {
    return null;
  }

  var context = ctx || {};
  var status = post.getString('status') || 'published';

  if (status !== 'published' && !c.canModerate(context.viewerRole) && post.getString('authorId') !== c.asText(context.viewerId)) {
    return serializeRemovedPost(post);
  }

  var mediaIds = c.readJsonArray(post, 'mediaIds');
  var mediaMap = context.mediaMap || {};
  var media = [];
  mediaIds.forEach(function (id) {
    var record = mediaMap[String(id)];
    if (record) {
      media.push(serializeMedia(app, record));
    }
  });

  var linkPreview = c.readJson(post, 'linkPreview', null);
  if (linkPreview && !linkPreview.url) {
    linkPreview = null;
  }

  var id = String(post.id);
  var viewerState = context.viewerState || { likes: {}, reposts: {}, bookmarks: {} };
  var authorId = post.getString('authorId');

  var quotedPost = null;
  if (!context.skipQuote) {
    var quotedId = post.getString('quotedPostId');
    if (quotedId) {
      var quotedRecord = (context.quotedMap || {})[quotedId];
      if (quotedRecord) {
        quotedPost = serializePost(app, quotedRecord, {
          viewerId: context.viewerId,
          viewerRole: context.viewerRole,
          mediaMap: context.mediaMap,
          viewerState: viewerState,
          followState: context.followState,
          skipQuote: true,
        });
      }
    }
  }

  return {
    id: id,
    kind: post.getString('kind') || 'post',
    status: status,
    body: post.getString('body'),
    entities: c.readJsonArray(post, 'entities'),
    hashtags: c.readJsonArray(post, 'hashtags'),
    media: media,
    linkPreview: linkPreview,
    quotedPost: quotedPost,
    quotedPostId: post.getString('quotedPostId'),
    parentId: post.getString('parentId'),
    rootId: post.getString('rootId'),
    depth: post.getInt('depth'),
    sensitive: post.getBool('sensitive'),
    createdAt: post.getString('created'),
    updatedAt: post.getString('updated'),
    likeCount: post.getInt('likeCount'),
    replyCount: post.getInt('replyCount'),
    repostCount: post.getInt('repostCount'),
    quoteCount: post.getInt('quoteCount'),
    bookmarkCount: post.getInt('bookmarkCount'),
    liked: Boolean(viewerState.likes[id]),
    reposted: Boolean(viewerState.reposts[id]),
    bookmarked: Boolean(viewerState.bookmarks[id]),
    removedReason: post.getString('removedReason'),
    author: {
      userId: authorId,
      handle: post.getString('authorHandle'),
      displayName: post.getString('authorName'),
      avatarUrl: post.getString('authorAvatarUrl'),
      isFollowing: Boolean((context.followState || {})[authorId]),
    },
    isAuthor: authorId === c.asText(context.viewerId),
    canModerate: Boolean(c.canModerate(context.viewerRole)),
  };
}

// Assembles the shared context (media, quoted posts, viewer engagement, follow
// state) for a batch of posts with a fixed number of queries.
function buildPostContext(app, posts, viewerId, viewerRole) {
  var c = core();
  var mediaIds = [];
  var quotedIds = [];
  var authorIds = [];
  var postIds = [];

  posts.forEach(function (post) {
    if (!post) {
      return;
    }
    postIds.push(String(post.id));
    authorIds.push(post.getString('authorId'));
    c.readJsonArray(post, 'mediaIds').forEach(function (id) { mediaIds.push(String(id)); });
    var quoted = post.getString('quotedPostId');
    if (quoted) {
      quotedIds.push(quoted);
    }
  });

  var quotedMap = loadPostsByIds(app, quotedIds);
  Object.keys(quotedMap).forEach(function (key) {
    postIds.push(key);
    authorIds.push(quotedMap[key].getString('authorId'));
    c.readJsonArray(quotedMap[key], 'mediaIds').forEach(function (id) { mediaIds.push(String(id)); });
  });

  return {
    viewerId: viewerId,
    viewerRole: viewerRole,
    mediaMap: loadMediaByIds(app, mediaIds),
    quotedMap: quotedMap,
    viewerState: collectViewerState(app, viewerId, postIds),
    followState: collectFollowState(app, viewerId, authorIds),
  };
}

function serializePosts(app, posts, viewerId, viewerRole) {
  var context = buildPostContext(app, posts, viewerId, viewerRole);
  return posts.map(function (post) {
    return serializePost(app, post, context);
  }).filter(Boolean);
}

module.exports = {
  serializeMedia: serializeMedia,
  loadMediaByIds: loadMediaByIds,
  getUploadedFileSize: getUploadedFileSize,
  getUploadedFileName: getUploadedFileName,
  detectMediaKind: detectMediaKind,
  createMedia: createMedia,
  pruneOrphanMedia: pruneOrphanMedia,
  touchHashtags: touchHashtags,
  serializeHashtag: serializeHashtag,
  decodeHtmlEntities: decodeHtmlEntities,
  findMetaContent: findMetaContent,
  parseOpenGraph: parseOpenGraph,
  fetchLinkPreview: fetchLinkPreview,
  serializeLinkPreview: serializeLinkPreview,
  handleLinkPreview: handleLinkPreview,
  createNotification: createNotification,
  removeNotification: removeNotification,
  serializeNotification: serializeNotification,
  collectViewerState: collectViewerState,
  collectFollowState: collectFollowState,
  loadPostsByIds: loadPostsByIds,
  isVisible: isVisible,
  serializePost: serializePost,
  serializePosts: serializePosts,
  buildPostContext: buildPostContext,
};
