// Route handlers for the community platform. Every handler runs with the hook
// app context, which bypasses collection rules, so each one re-checks
// authentication, ownership and moderation rights itself.

function core() {
  return require(__hooks + '/lib/community-core.js');
}

function content() {
  return require(__hooks + '/lib/community-content.js');
}

// ---------------------------------------------------------------------------
// Shared query helpers
// ---------------------------------------------------------------------------

// Keyset pagination. `created` alone is not unique enough under bulk inserts,
// so the cursor carries the id as a tiebreaker.
function applyCursor(filter, params, cursor) {
  if (!cursor) {
    return filter;
  }
  params.cursorCreated = cursor.created;
  params.cursorId = cursor.id;
  var clause = '(created < {:cursorCreated} || (created = {:cursorCreated} && id < {:cursorId}))';
  return filter ? '(' + filter + ') && ' + clause : clause;
}

function pageResult(records, limit, mapper) {
  var c = core();
  var hasMore = records.length > limit;
  var page = hasMore ? records.slice(0, limit) : records;
  var last = page.length ? page[page.length - 1] : null;

  return {
    items: mapper(page),
    hasMore: hasMore,
    cursor: last ? c.encodeCursor(last.getString('created'), String(last.id)) : '',
  };
}

function queryPosts(app, filter, params, limit, cursor) {
  var scopedFilter = applyCursor(filter, params, cursor);
  return app.findRecordsByFilter('community_posts', scopedFilter || 'id != ""', '-created,-id', limit + 1, 0, params);
}

function viewerContext(e) {
  var c = core();
  return {
    id: c.getAuthId(e.auth),
    role: c.getAuthRole(e.auth),
  };
}

function blockedUserIds(app, viewerId) {
  var c = core();
  if (!viewerId) {
    return [];
  }
  var ids = [];
  try {
    app.findRecordsByFilter('community_blocks', 'userId = {:userId}', '', 500, 0, { userId: viewerId })
      .forEach(function (record) { ids.push(record.getString('targetId')); });
  } catch (_) {}
  try {
    app.findRecordsByFilter('community_blocks', 'targetId = {:userId}', '', 500, 0, { userId: viewerId })
      .forEach(function (record) { ids.push(record.getString('userId')); });
  } catch (_) {}
  return c.uniqueStrings(ids);
}

function appendBlockExclusion(filter, params, blocked) {
  if (!blocked.length) {
    return filter;
  }
  var c = core();
  var built = c.buildNotInFilter('authorId', blocked.slice(0, 100), 'blk');
  var clause = built.filter;
  Object.keys(built.params).forEach(function (key) { params[key] = built.params[key]; });
  return filter ? '(' + filter + ') && ' + clause : clause;
}

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

function adjustPostCounter(tx, postId, field, delta) {
  var c = core();
  var post = c.findByIdOrNull(tx, 'community_posts', postId);
  if (!post) {
    return null;
  }
  post.set(field, Math.max(0, post.getInt(field) + delta));
  tx.save(post);
  return post;
}

function adjustProfileCounter(tx, userId, field, delta) {
  var c = core();
  var profile = c.findProfileByUserId(tx, userId);
  if (!profile) {
    return null;
  }
  profile.set(field, Math.max(0, profile.getInt(field) + delta));
  tx.save(profile);
  return profile;
}

// ---------------------------------------------------------------------------
// Post creation
// ---------------------------------------------------------------------------

function resolveMentionProfiles(app, handles) {
  var profiles = [];
  var c = core();
  (handles || []).forEach(function (handle) {
    var profile = c.findProfileByHandle(app, handle);
    if (profile) {
      profiles.push(profile);
    }
  });
  return profiles;
}

function claimMedia(app, ownerId, mediaIds) {
  var c = core();
  var claimed = [];
  c.uniqueStrings(mediaIds || []).slice(0, c.MAX_MEDIA_PER_POST).forEach(function (id) {
    var record = c.findByIdOrNull(app, 'community_media', id);
    if (!record) {
      throw new BadRequestError('One of the attachments is no longer available.');
    }
    if (record.getString('ownerId') !== ownerId) {
      throw new ForbiddenError('You can only attach media you uploaded.');
    }
    if (record.getString('postId')) {
      throw new BadRequestError('That attachment is already used by another post.');
    }
    claimed.push(record);
  });
  return claimed;
}

function createPost(e) {
  var c = core();
  var app = e.app;
  var profile = c.requireProfile(app, e.auth);
  var authorId = profile.getString('userId');
  var body = e.requestInfo().body || {};

  var parentId = c.asText(body.parentId).trim();
  var quotedPostId = c.asText(body.quotedPostId).trim();
  var kind = parentId ? 'reply' : (quotedPostId ? 'quote' : 'post');

  c.enforceRateLimit(app, kind === 'reply' ? 'reply' : 'post', authorId);

  var mediaIds = Array.isArray(body.mediaIds) ? body.mediaIds : [];
  var validation = c.validatePostInput(body.body, mediaIds.length, Boolean(quotedPostId));
  if (!validation.ok) {
    throw new BadRequestError(validation.message);
  }

  var clientId = c.asText(body.clientId).trim().slice(0, 64);
  if (clientId) {
    var duplicate = c.findOneOrNull(app, 'community_posts', 'authorId = {:authorId} && clientId = {:clientId}', {
      authorId: authorId,
      clientId: clientId,
    });
    if (duplicate) {
      // A retried request must not produce a second post.
      return content().serializePosts(app, [duplicate], authorId, c.getAuthRole(e.auth))[0];
    }
  }

  var parent = null;
  var rootId = '';
  var depth = 0;

  if (parentId) {
    parent = c.findByIdOrNull(app, 'community_posts', parentId);
    if (!parent || parent.getString('status') !== 'published') {
      throw new NotFoundError('That post is no longer available.');
    }
    if (blockedUserIds(app, authorId).indexOf(parent.getString('authorId')) !== -1) {
      throw new ForbiddenError('You cannot reply to this post.');
    }
    rootId = parent.getString('rootId') || String(parent.id);
    depth = Math.min(c.MAX_REPLY_DEPTH, parent.getInt('depth') + 1);
  }

  var quoted = null;
  if (quotedPostId) {
    quoted = c.findByIdOrNull(app, 'community_posts', quotedPostId);
    if (!quoted || quoted.getString('status') !== 'published') {
      throw new NotFoundError('The quoted post is no longer available.');
    }
    if (quoted.getString('quotedPostId') && String(quoted.id) === String(quotedPostId)) {
      throw new BadRequestError('A post cannot quote itself.');
    }
  }

  var parsed = c.parseEntities(validation.body);
  var mentionProfiles = resolveMentionProfiles(app, parsed.handles);
  var mentionIds = mentionProfiles.map(function (record) { return record.getString('userId'); });
  var media = claimMedia(app, authorId, mediaIds);

  var linkPreview = null;
  if (parsed.urls.length && !media.length && !quoted) {
    linkPreview = content().fetchLinkPreview(app, parsed.urls[0]);
    if (linkPreview && linkPreview.status !== 'ok') {
      linkPreview = null;
    }
  }

  var displayMap = {};
  parsed.entities.forEach(function (entity) {
    if (entity.type === 'hashtag') {
      displayMap[entity.value] = entity.display;
    }
  });

  var created = null;

  app.runInTransaction(function (tx) {
    var record = c.newRecord(tx, 'community_posts');
    c.setValues(record, {
      authorId: authorId,
      authorHandle: profile.getString('handle'),
      authorName: profile.getString('displayName'),
      authorAvatarUrl: c.profileAvatarUrl(tx, profile),
      body: validation.body,
      entities: parsed.entities,
      kind: kind,
      rootId: rootId,
      parentId: parentId,
      quotedPostId: quotedPostId,
      mediaIds: media.map(function (item) { return String(item.id); }),
      linkPreview: linkPreview || {},
      hashtags: parsed.hashtags,
      mentionIds: mentionIds,
      depth: depth,
      likeCount: 0,
      replyCount: 0,
      repostCount: 0,
      quoteCount: 0,
      bookmarkCount: 0,
      status: 'published',
      sensitive: body.sensitive === true,
      clientId: clientId,
    });
    tx.save(record);

    if (!rootId && kind !== 'reply') {
      record.set('rootId', String(record.id));
      tx.save(record);
    }

    media.forEach(function (item) {
      item.set('postId', String(record.id));
      item.set('status', 'attached');
      tx.save(item);
    });

    if (parent) {
      adjustPostCounter(tx, parentId, 'replyCount', 1);
    }
    if (quoted) {
      adjustPostCounter(tx, quotedPostId, 'quoteCount', 1);
    }

    adjustProfileCounter(tx, authorId, 'postCount', 1);
    created = record;
  });

  if (!created) {
    throw new BadRequestError('The post could not be saved. Try again.');
  }

  content().touchHashtags(app, parsed.hashtags, displayMap, 1);

  function notify(userId, kind) {
    content().createNotification(app, {
      userId: userId,
      kind: kind,
      actorId: authorId,
      actorHandle: profile.getString('handle'),
      actorName: profile.getString('displayName'),
      actorAvatarUrl: c.profileAvatarUrl(app, profile),
      postId: String(created.id),
      rootId: created.getString('rootId') || String(created.id),
      preview: c.buildPreview(validation.body),
    });
  }

  if (parent) {
    notify(parent.getString('authorId'), 'reply');
  }

  if (quoted) {
    notify(quoted.getString('authorId'), 'quote');
  }

  mentionIds.forEach(function (userId) {
    if (parent && userId === parent.getString('authorId')) {
      return;
    }
    notify(userId, 'mention');
  });

  return content().serializePosts(app, [created], authorId, c.getAuthRole(e.auth))[0];
}

function deletePost(e, postId) {
  var c = core();
  var app = e.app;
  var viewer = viewerContext(e);
  c.requireAuth(e.auth);

  var post = c.findByIdOrNull(app, 'community_posts', postId);
  if (!post) {
    throw new NotFoundError('That post no longer exists.');
  }

  var isAuthor = post.getString('authorId') === viewer.id;
  if (!isAuthor && !c.canModerate(viewer.role)) {
    throw new ForbiddenError('You can only delete your own posts.');
  }

  var hashtags = c.readJsonArray(post, 'hashtags');
  var parentId = post.getString('parentId');
  var quotedPostId = post.getString('quotedPostId');
  var authorId = post.getString('authorId');
  var mediaIds = c.readJsonArray(post, 'mediaIds');

  app.runInTransaction(function (tx) {
    ['community_likes', 'community_reposts', 'community_bookmarks'].forEach(function (collection) {
      try {
        tx.findRecordsByFilter(collection, 'postId = {:postId}', '', 500, 0, { postId: String(postId) })
          .forEach(function (record) { tx.delete(record); });
      } catch (_) {}
    });

    try {
      tx.findRecordsByFilter('community_notifications', 'postId = {:postId}', '', 500, 0, { postId: String(postId) })
        .forEach(function (record) { tx.delete(record); });
    } catch (_) {}

    mediaIds.forEach(function (id) {
      var media = c.findByIdOrNull(tx, 'community_media', id);
      if (media) {
        try { tx.delete(media); } catch (_) {}
      }
    });

    if (parentId) {
      adjustPostCounter(tx, parentId, 'replyCount', -1);
    }
    if (quotedPostId) {
      adjustPostCounter(tx, quotedPostId, 'quoteCount', -1);
    }
    adjustProfileCounter(tx, authorId, 'postCount', -1);

    // Replies stay reachable, so a post with children is tombstoned instead of
    // deleted outright.
    var current = c.findByIdOrNull(tx, 'community_posts', postId);
    if (!current) {
      return;
    }
    if (current.getInt('replyCount') > 0) {
      c.setValues(current, {
        status: 'deleted',
        body: '',
        entities: [],
        mediaIds: [],
        linkPreview: {},
        hashtags: [],
        mentionIds: [],
        likeCount: 0,
        repostCount: 0,
        quoteCount: 0,
        bookmarkCount: 0,
        removedAt: c.nowIso(),
      });
      tx.save(current);
      return;
    }
    tx.delete(current);
  });

  content().touchHashtags(app, hashtags, {}, -1);

  return { deleted: true, id: String(postId) };
}

// ---------------------------------------------------------------------------
// Engagement
// ---------------------------------------------------------------------------

function toggleJoin(e, options) {
  var c = core();
  var app = e.app;
  var profile = c.requireProfile(app, e.auth);
  var userId = profile.getString('userId');
  var postId = c.asText(options.postId);

  c.enforceRateLimit(app, options.rateKey, userId);

  var post = c.findByIdOrNull(app, 'community_posts', postId);
  if (!post || post.getString('status') !== 'published') {
    throw new NotFoundError('That post is no longer available.');
  }

  var active = false;
  var counter = 0;

  app.runInTransaction(function (tx) {
    var existing = c.findOneOrNull(tx, options.collection, 'postId = {:postId} && userId = {:userId}', {
      postId: postId,
      userId: userId,
    });

    if (existing) {
      tx.delete(existing);
      var decreased = adjustPostCounter(tx, postId, options.counterField, -1);
      counter = decreased ? decreased.getInt(options.counterField) : 0;
      active = false;
      return;
    }

    var record = c.newRecord(tx, options.collection);
    var values = { postId: postId, userId: userId };
    if (options.collection !== 'community_bookmarks') {
      values.postAuthorId = post.getString('authorId');
    }
    if (options.collection === 'community_reposts') {
      values.userHandle = profile.getString('handle');
      values.userName = profile.getString('displayName');
    }
    c.setValues(record, values);
    tx.save(record);

    var increased = adjustPostCounter(tx, postId, options.counterField, 1);
    counter = increased ? increased.getInt(options.counterField) : 0;
    active = true;
  });

  if (options.notificationKind) {
    if (active) {
      content().createNotification(app, {
        userId: post.getString('authorId'),
        actorId: userId,
        actorHandle: profile.getString('handle'),
        actorName: profile.getString('displayName'),
        actorAvatarUrl: c.profileAvatarUrl(app, profile),
        kind: options.notificationKind,
        postId: postId,
        rootId: post.getString('rootId') || postId,
        preview: c.buildPreview(post.getString('body')),
      });
    } else {
      content().removeNotification(app, post.getString('authorId'), userId, options.notificationKind, postId);
    }
  }

  var result = { postId: postId, active: active };
  result[options.responseKey] = counter;
  return result;
}

function toggleLike(e, postId) {
  return toggleJoin(e, {
    postId: postId,
    collection: 'community_likes',
    counterField: 'likeCount',
    responseKey: 'likeCount',
    rateKey: 'like',
    notificationKind: 'like',
  });
}

function toggleRepost(e, postId) {
  return toggleJoin(e, {
    postId: postId,
    collection: 'community_reposts',
    counterField: 'repostCount',
    responseKey: 'repostCount',
    rateKey: 'like',
    notificationKind: 'repost',
  });
}

function toggleBookmark(e, postId) {
  return toggleJoin(e, {
    postId: postId,
    collection: 'community_bookmarks',
    counterField: 'bookmarkCount',
    responseKey: 'bookmarkCount',
    rateKey: 'like',
    notificationKind: '',
  });
}

function toggleFollow(e, handle) {
  var c = core();
  var app = e.app;
  var profile = c.requireProfile(app, e.auth);
  var followerId = profile.getString('userId');

  c.enforceRateLimit(app, 'follow', followerId);

  var target = c.findProfileByHandle(app, handle);
  if (!target) {
    throw new NotFoundError('That account does not exist.');
  }

  var followingId = target.getString('userId');
  if (followingId === followerId) {
    throw new BadRequestError('You cannot follow yourself.');
  }

  var active = false;

  app.runInTransaction(function (tx) {
    var existing = c.findOneOrNull(tx, 'community_follows', 'followerId = {:followerId} && followingId = {:followingId}', {
      followerId: followerId,
      followingId: followingId,
    });

    if (existing) {
      tx.delete(existing);
      adjustProfileCounter(tx, followerId, 'followingCount', -1);
      adjustProfileCounter(tx, followingId, 'followerCount', -1);
      active = false;
      return;
    }

    var record = c.newRecord(tx, 'community_follows');
    c.setValues(record, { followerId: followerId, followingId: followingId });
    tx.save(record);
    adjustProfileCounter(tx, followerId, 'followingCount', 1);
    adjustProfileCounter(tx, followingId, 'followerCount', 1);
    active = true;
  });

  if (active) {
    content().createNotification(app, {
      userId: followingId,
      actorId: followerId,
      actorHandle: profile.getString('handle'),
      actorName: profile.getString('displayName'),
      actorAvatarUrl: c.profileAvatarUrl(app, profile),
      kind: 'follow',
      postId: '',
      rootId: '',
      preview: '',
    });
  } else {
    content().removeNotification(app, followingId, followerId, 'follow', '');
  }

  var refreshed = c.findProfileByUserId(app, followingId);
  return {
    handle: target.getString('handle'),
    isFollowing: active,
    followerCount: refreshed ? refreshed.getInt('followerCount') : 0,
  };
}

// ---------------------------------------------------------------------------
// Feeds
// ---------------------------------------------------------------------------

function listFeed(e) {
  var c = core();
  var app = e.app;
  var viewer = viewerContext(e);
  var query = e.requestInfo().query || {};
  var tab = c.includes(c.FEED_TABS, String(query.tab || '')) ? String(query.tab) : 'for-you';
  var limit = c.clampPageSize(query.perPage, c.FEED_PAGE_SIZE, c.MAX_FEED_PAGE_SIZE);
  var cursor = c.decodeCursor(query.cursor);

  var params = { status: 'published' };
  var filter = 'status = {:status} && kind != "reply"';

  if (tab === 'following') {
    if (!viewer.id) {
      throw new ForbiddenError('Sign in to see posts from accounts you follow.');
    }
    var followingIds = [viewer.id];
    try {
      app.findRecordsByFilter('community_follows', 'followerId = {:followerId}', '-created', 500, 0, { followerId: viewer.id })
        .forEach(function (record) { followingIds.push(record.getString('followingId')); });
    } catch (_) {}

    var built = c.buildInFilter('authorId', c.uniqueStrings(followingIds).slice(0, 200), 'fw');
    Object.keys(built.params).forEach(function (key) { params[key] = built.params[key]; });
    filter += ' && ' + built.filter;
  }

  filter = appendBlockExclusion(filter, params, blockedUserIds(app, viewer.id));

  var records = queryPosts(app, filter, params, limit, cursor);

  // "For you" ranks the freshest window by engagement so a quiet feed still
  // leads with the posts people actually reacted to.
  if (tab === 'for-you' && !cursor) {
    records = records.slice().sort(function (a, b) {
      var scoreA = a.getInt('likeCount') + a.getInt('replyCount') * 2 + a.getInt('repostCount') * 3;
      var scoreB = b.getInt('likeCount') + b.getInt('replyCount') * 2 + b.getInt('repostCount') * 3;
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      return a.getString('created') < b.getString('created') ? 1 : -1;
    });
  }

  return pageResult(records, limit, function (page) {
    return content().serializePosts(app, page, viewer.id, viewer.role);
  });
}

function getThread(e, postId) {
  var c = core();
  var app = e.app;
  var viewer = viewerContext(e);

  // A removed or tombstoned post keeps its permalink so the replies below it
  // stay reachable. serializePost strips the body for everyone except the
  // author and moderators, so only a missing record is a 404 here.
  var post = c.findByIdOrNull(app, 'community_posts', postId);
  if (!post) {
    throw new NotFoundError('That post is no longer available.');
  }

  var ancestors = [];
  var cursorPost = post;
  var guard = 0;
  while (cursorPost.getString('parentId') && guard < c.MAX_REPLY_DEPTH) {
    guard += 1;
    var parent = c.findByIdOrNull(app, 'community_posts', cursorPost.getString('parentId'));
    if (!parent) {
      break;
    }
    ancestors.unshift(parent);
    cursorPost = parent;
  }

  var query = e.requestInfo().query || {};
  var limit = c.clampPageSize(query.perPage, c.FEED_PAGE_SIZE, c.MAX_FEED_PAGE_SIZE);
  var cursor = c.decodeCursor(query.cursor);
  var params = { parentId: String(postId) };
  var filter = appendBlockExclusion('parentId = {:parentId}', params, blockedUserIds(app, viewer.id));
  var replyRecords = app.findRecordsByFilter(
    'community_posts',
    applyCursor(filter, params, cursor),
    '-created,-id',
    limit + 1,
    0,
    params
  );

  var replies = pageResult(replyRecords, limit, function (page) {
    return content().serializePosts(app, page, viewer.id, viewer.role);
  });

  return {
    post: content().serializePosts(app, [post], viewer.id, viewer.role)[0],
    ancestors: content().serializePosts(app, ancestors, viewer.id, viewer.role),
    replies: replies.items,
    hasMore: replies.hasMore,
    cursor: replies.cursor,
  };
}

function listBookmarks(e) {
  var c = core();
  var app = e.app;
  var viewer = viewerContext(e);
  c.requireAuth(e.auth);

  var query = e.requestInfo().query || {};
  var limit = c.clampPageSize(query.perPage, c.FEED_PAGE_SIZE, c.MAX_FEED_PAGE_SIZE);
  var cursor = c.decodeCursor(query.cursor);
  var params = { userId: viewer.id };
  var rows = app.findRecordsByFilter(
    'community_bookmarks',
    applyCursor('userId = {:userId}', params, cursor),
    '-created,-id',
    limit + 1,
    0,
    params
  );

  var hasMore = rows.length > limit;
  var page = hasMore ? rows.slice(0, limit) : rows;
  var postMap = content().loadPostsByIds(app, page.map(function (row) { return row.getString('postId'); }));
  var posts = [];
  page.forEach(function (row) {
    var post = postMap[row.getString('postId')];
    if (post && content().isVisible(post, viewer.id, viewer.role)) {
      posts.push(post);
    }
  });

  var last = page.length ? page[page.length - 1] : null;

  return {
    items: content().serializePosts(app, posts, viewer.id, viewer.role),
    hasMore: hasMore,
    cursor: last ? c.encodeCursor(last.getString('created'), String(last.id)) : '',
  };
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

function buildProfileViewerState(app, profile, viewer) {
  var c = core();
  var targetUserId = profile.getString('userId');
  if (!viewer.id) {
    return { isSelf: false, isFollowing: false, isFollowedBy: false };
  }
  return {
    isSelf: viewer.id === targetUserId,
    isFollowing: Boolean(c.findOneOrNull(app, 'community_follows', 'followerId = {:a} && followingId = {:b}', { a: viewer.id, b: targetUserId })),
    isFollowedBy: Boolean(c.findOneOrNull(app, 'community_follows', 'followerId = {:a} && followingId = {:b}', { a: targetUserId, b: viewer.id })),
  };
}

function getMe(e) {
  var c = core();
  var app = e.app;
  var profile = c.ensureProfile(app, c.requireAuth(e.auth));
  var viewer = viewerContext(e);
  var unread = 0;

  try {
    unread = app.findRecordsByFilter('community_notifications', 'userId = {:userId} && isRead = false', '', 0, 0, { userId: viewer.id }).length;
  } catch (_) {}

  return {
    profile: c.serializeProfile(app, profile, { isSelf: true }),
    unreadNotifications: unread,
    canModerate: c.canModerate(viewer.role),
  };
}

function getProfile(e, handle) {
  var c = core();
  var app = e.app;
  var viewer = viewerContext(e);
  var profile = c.findProfileByHandle(app, handle);

  if (!profile) {
    throw new NotFoundError('That account does not exist.');
  }

  return {
    profile: c.serializeProfile(app, profile, buildProfileViewerState(app, profile, viewer)),
  };
}

function updateProfile(e) {
  var c = core();
  var app = e.app;
  var profile = c.requireProfile(app, e.auth);
  var userId = profile.getString('userId');

  c.enforceRateLimit(app, 'profile', userId);

  var body = e.requestInfo().body || {};

  if (Object.prototype.hasOwnProperty.call(body, 'handle')) {
    var handle = c.normalizeHandle(body.handle);
    if (!c.isValidHandle(handle)) {
      throw new BadRequestError('Handles use 3 to 30 letters, numbers or underscores and must contain a letter.');
    }
    if (handle !== profile.getString('handle')) {
      if (c.isHandleTaken(app, handle, String(profile.id))) {
        throw new BadRequestError('That handle is already taken.');
      }
      profile.set('handle', handle);
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'displayName')) {
    profile.set('displayName', c.truncate(c.trimBody(body.displayName), c.MAX_DISPLAY_NAME_LENGTH));
  }
  if (Object.prototype.hasOwnProperty.call(body, 'bio')) {
    profile.set('bio', c.truncate(c.trimBody(body.bio), c.MAX_BIO_LENGTH));
  }
  if (Object.prototype.hasOwnProperty.call(body, 'location')) {
    profile.set('location', c.truncate(c.trimBody(body.location), c.MAX_LOCATION_LENGTH));
  }
  if (Object.prototype.hasOwnProperty.call(body, 'website')) {
    var website = c.normalizeWebsite(body.website);
    if (c.asText(body.website).trim() && !website) {
      throw new BadRequestError('Enter a valid website address.');
    }
    profile.set('website', website);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'pinnedPostId')) {
    var pinnedId = c.asText(body.pinnedPostId).trim();
    if (pinnedId) {
      var pinned = c.findByIdOrNull(app, 'community_posts', pinnedId);
      if (!pinned || pinned.getString('authorId') !== userId || pinned.getString('status') !== 'published') {
        throw new BadRequestError('You can only pin your own published post.');
      }
    }
    profile.set('pinnedPostId', pinnedId);
  }

  var avatars = c.readUploadedFiles(e, 'avatar');
  if (avatars.length) {
    profile.set('avatar', avatars[0]);
  }
  var banners = c.readUploadedFiles(e, 'banner');
  if (banners.length) {
    profile.set('banner', banners[0]);
  }

  app.save(profile);

  var handleValue = profile.getString('handle');
  var nameValue = profile.getString('displayName');
  var avatarValue = c.profileAvatarUrl(app, profile);

  // Author identity is denormalized onto posts, so a profile edit has to
  // rewrite the copies. Bounded to the most recent 500 posts per edit; older
  // posts keep the name they were published under.
  try {
    var posts = app.findRecordsByFilter('community_posts', 'authorId = {:authorId}', '-created', 500, 0, { authorId: userId });
    app.runInTransaction(function (tx) {
      posts.forEach(function (post) {
        var current = c.findByIdOrNull(tx, 'community_posts', String(post.id));
        if (!current) {
          return;
        }
        current.set('authorHandle', handleValue);
        current.set('authorName', nameValue);
        current.set('authorAvatarUrl', avatarValue);
        tx.save(current);
      });
    });
  } catch (_) {}

  return { profile: c.serializeProfile(app, profile, { isSelf: true }) };
}

function listProfilePosts(e, handle) {
  var c = core();
  var app = e.app;
  var viewer = viewerContext(e);
  var profile = c.findProfileByHandle(app, handle);

  if (!profile) {
    throw new NotFoundError('That account does not exist.');
  }

  var targetUserId = profile.getString('userId');
  var query = e.requestInfo().query || {};
  var tab = c.includes(c.PROFILE_TABS, String(query.tab || '')) ? String(query.tab) : 'posts';
  var limit = c.clampPageSize(query.perPage, c.FEED_PAGE_SIZE, c.MAX_FEED_PAGE_SIZE);
  var cursor = c.decodeCursor(query.cursor);

  if (tab === 'likes') {
    if (viewer.id !== targetUserId && !c.canModerate(viewer.role)) {
      throw new ForbiddenError('Likes are only visible to the account owner.');
    }
    var likeParams = { userId: targetUserId };
    var likeRows = app.findRecordsByFilter(
      'community_likes',
      applyCursor('userId = {:userId}', likeParams, cursor),
      '-created,-id',
      limit + 1,
      0,
      likeParams
    );
    var likeHasMore = likeRows.length > limit;
    var likePage = likeHasMore ? likeRows.slice(0, limit) : likeRows;
    var likedMap = content().loadPostsByIds(app, likePage.map(function (row) { return row.getString('postId'); }));
    var likedPosts = [];
    likePage.forEach(function (row) {
      var post = likedMap[row.getString('postId')];
      if (post && content().isVisible(post, viewer.id, viewer.role)) {
        likedPosts.push(post);
      }
    });
    var lastLike = likePage.length ? likePage[likePage.length - 1] : null;
    return {
      items: content().serializePosts(app, likedPosts, viewer.id, viewer.role),
      hasMore: likeHasMore,
      cursor: lastLike ? c.encodeCursor(lastLike.getString('created'), String(lastLike.id)) : '',
    };
  }

  var params = { authorId: targetUserId, status: 'published' };
  var filter = 'authorId = {:authorId} && status = {:status}';

  if (tab === 'posts') {
    filter += ' && kind != "reply"';
  } else if (tab === 'replies') {
    filter += ' && kind = "reply"';
  } else if (tab === 'media') {
    // The :length modifier reports the byte length of the stored JSON, not the
    // number of entries, so an empty array passes it. A populated array is the
    // only value that contains a quote character, because ids are strings.
    filter += ' && mediaIds ~ \'"\'';
  }

  var records = queryPosts(app, filter, params, limit, cursor);

  return pageResult(records, limit, function (page) {
    return content().serializePosts(app, page, viewer.id, viewer.role);
  });
}

function listProfileConnections(e, handle, direction) {
  var c = core();
  var app = e.app;
  var viewer = viewerContext(e);
  var profile = c.findProfileByHandle(app, handle);

  if (!profile) {
    throw new NotFoundError('That account does not exist.');
  }

  var targetUserId = profile.getString('userId');
  var query = e.requestInfo().query || {};
  var limit = c.clampPageSize(query.perPage, c.FEED_PAGE_SIZE, c.MAX_FEED_PAGE_SIZE);
  var cursor = c.decodeCursor(query.cursor);
  var isFollowers = direction === 'followers';
  var params = {};
  params.userId = targetUserId;

  var rows = app.findRecordsByFilter(
    'community_follows',
    applyCursor(isFollowers ? 'followingId = {:userId}' : 'followerId = {:userId}', params, cursor),
    '-created,-id',
    limit + 1,
    0,
    params
  );

  var hasMore = rows.length > limit;
  var page = hasMore ? rows.slice(0, limit) : rows;
  var profiles = [];

  page.forEach(function (row) {
    var otherId = isFollowers ? row.getString('followerId') : row.getString('followingId');
    var other = c.findProfileByUserId(app, otherId);
    if (other) {
      profiles.push(c.serializeProfile(app, other, buildProfileViewerState(app, other, viewer)));
    }
  });

  var last = page.length ? page[page.length - 1] : null;

  return {
    items: profiles,
    hasMore: hasMore,
    cursor: last ? c.encodeCursor(last.getString('created'), String(last.id)) : '',
  };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

function listNotifications(e) {
  var c = core();
  var app = e.app;
  var viewer = viewerContext(e);
  c.requireAuth(e.auth);

  var query = e.requestInfo().query || {};
  var limit = c.clampPageSize(query.perPage, c.NOTIFICATION_PAGE_SIZE, c.MAX_FEED_PAGE_SIZE);
  var cursor = c.decodeCursor(query.cursor);
  var params = { userId: viewer.id };
  var filter = 'userId = {:userId}';

  if (c.includes(c.NOTIFICATION_KINDS, String(query.kind || ''))) {
    params.kind = String(query.kind);
    filter += ' && kind = {:kind}';
  }

  var records = app.findRecordsByFilter(
    'community_notifications',
    applyCursor(filter, params, cursor),
    '-created,-id',
    limit + 1,
    0,
    params
  );

  var unread = 0;
  try {
    unread = app.findRecordsByFilter('community_notifications', 'userId = {:userId} && isRead = false', '', 0, 0, { userId: viewer.id }).length;
  } catch (_) {}

  var result = pageResult(records, limit, function (page) {
    return page.map(content().serializeNotification);
  });
  result.unreadCount = unread;
  return result;
}

function markNotificationsRead(e) {
  var c = core();
  var app = e.app;
  var viewer = viewerContext(e);
  c.requireAuth(e.auth);

  var body = e.requestInfo().body || {};
  var ids = Array.isArray(body.ids) ? c.uniqueStrings(body.ids).slice(0, 200) : [];
  var updated = 0;

  app.runInTransaction(function (tx) {
    var records;
    if (ids.length) {
      var built = c.buildInFilter('id', ids, 'note');
      var params = built.params;
      params.userId = viewer.id;
      records = tx.findRecordsByFilter('community_notifications', built.filter + ' && userId = {:userId}', '', 200, 0, params);
    } else {
      records = tx.findRecordsByFilter('community_notifications', 'userId = {:userId} && isRead = false', '', 500, 0, { userId: viewer.id });
    }

    records.forEach(function (record) {
      if (record.getBool('isRead')) {
        return;
      }
      record.set('isRead', true);
      tx.save(record);
      updated += 1;
    });
  });

  return { updated: updated };
}

// ---------------------------------------------------------------------------
// Search and discovery
// ---------------------------------------------------------------------------

function search(e) {
  var c = core();
  var app = e.app;
  var viewer = viewerContext(e);
  var query = e.requestInfo().query || {};
  var term = c.trimBody(query.q).slice(0, 120);
  var type = String(query.type || 'posts');
  var limit = c.clampPageSize(query.perPage, c.FEED_PAGE_SIZE, c.MAX_FEED_PAGE_SIZE);
  var cursor = c.decodeCursor(query.cursor);

  if (!term) {
    return { items: [], hasMore: false, cursor: '', type: type };
  }

  if (type === 'people') {
    var handleTerm = c.normalizeHandle(term);
    var peopleParams = { term: '%' + term + '%', handle: '%' + handleTerm + '%' };
    var peopleRows = app.findRecordsByFilter(
      'community_profiles',
      applyCursor('(handle ~ {:handle} || displayName ~ {:term}) && isSuspended = false', peopleParams, cursor),
      '-created,-id',
      limit + 1,
      0,
      peopleParams
    );
    var peopleHasMore = peopleRows.length > limit;
    var peoplePage = peopleHasMore ? peopleRows.slice(0, limit) : peopleRows;
    var lastPerson = peoplePage.length ? peoplePage[peoplePage.length - 1] : null;
    return {
      type: 'people',
      items: peoplePage.map(function (record) {
        return c.serializeProfile(app, record, buildProfileViewerState(app, record, viewer));
      }),
      hasMore: peopleHasMore,
      cursor: lastPerson ? c.encodeCursor(lastPerson.getString('created'), String(lastPerson.id)) : '',
    };
  }

  if (type === 'hashtags') {
    var tagTerm = c.normalizeHashtag(term);
    var tagRows = app.findRecordsByFilter('community_hashtags', 'tag ~ {:tag}', '-postCount', limit, 0, { tag: '%' + tagTerm + '%' });
    return {
      type: 'hashtags',
      items: tagRows.map(content().serializeHashtag),
      hasMore: false,
      cursor: '',
    };
  }

  var params = { status: 'published', term: '%' + term + '%' };
  var filter = 'status = {:status} && body ~ {:term}';

  if (term.charAt(0) === '#') {
    params.tag = '%"' + c.normalizeHashtag(term) + '"%';
    filter = 'status = {:status} && hashtags ~ {:tag}';
  }

  filter = appendBlockExclusion(filter, params, blockedUserIds(app, viewer.id));

  var records = queryPosts(app, filter, params, limit, cursor);
  var result = pageResult(records, limit, function (page) {
    return content().serializePosts(app, page, viewer.id, viewer.role);
  });
  result.type = 'posts';
  return result;
}

function listHashtagPosts(e, tag) {
  var c = core();
  var app = e.app;
  var viewer = viewerContext(e);
  var normalized = c.normalizeHashtag(tag);

  if (!normalized) {
    throw new BadRequestError('Provide a hashtag.');
  }

  var query = e.requestInfo().query || {};
  var limit = c.clampPageSize(query.perPage, c.FEED_PAGE_SIZE, c.MAX_FEED_PAGE_SIZE);
  var cursor = c.decodeCursor(query.cursor);
  var params = { status: 'published', tag: '%"' + normalized + '"%' };
  var filter = appendBlockExclusion('status = {:status} && hashtags ~ {:tag}', params, blockedUserIds(app, viewer.id));
  var records = queryPosts(app, filter, params, limit, cursor);

  var result = pageResult(records, limit, function (page) {
    return content().serializePosts(app, page, viewer.id, viewer.role);
  });
  result.tag = normalized;
  return result;
}

function getTrends(e) {
  var c = core();
  var app = e.app;
  var viewer = viewerContext(e);
  var trends = [];
  var suggestions = [];

  try {
    trends = app.findRecordsByFilter('community_hashtags', 'postCount > 0', '-recentCount,-postCount', 10, 0)
      .map(content().serializeHashtag);
  } catch (_) {}

  try {
    var followingIds = [];
    if (viewer.id) {
      followingIds.push(viewer.id);
      app.findRecordsByFilter('community_follows', 'followerId = {:followerId}', '', 500, 0, { followerId: viewer.id })
        .forEach(function (record) { followingIds.push(record.getString('followingId')); });
    }

    var candidates = app.findRecordsByFilter('community_profiles', 'isSuspended = false', '-followerCount,-postCount', 20, 0);
    candidates.forEach(function (record) {
      if (suggestions.length >= 5) {
        return;
      }
      if (c.includes(followingIds, record.getString('userId'))) {
        return;
      }
      suggestions.push(c.serializeProfile(app, record, { isFollowing: false, isSelf: false }));
    });
  } catch (_) {}

  return { trends: trends, suggestions: suggestions };
}

// ---------------------------------------------------------------------------
// Reports, blocks and moderation
// ---------------------------------------------------------------------------

function createReport(e) {
  var c = core();
  var app = e.app;
  var profile = c.requireProfile(app, e.auth);
  var reporterId = profile.getString('userId');

  c.enforceRateLimit(app, 'report', reporterId);

  var body = e.requestInfo().body || {};
  var postId = c.asText(body.postId).trim();
  var profileHandle = c.normalizeHandle(body.handle);
  var reason = c.includes(c.REPORT_REASONS, String(body.reason || '')) ? String(body.reason) : 'other';
  var profileUserId = '';

  if (profileHandle) {
    var target = c.findProfileByHandle(app, profileHandle);
    if (!target) {
      throw new NotFoundError('That account does not exist.');
    }
    profileUserId = target.getString('userId');
  }

  if (!postId && !profileUserId) {
    throw new BadRequestError('Choose a post or an account to report.');
  }

  if (postId && !c.findByIdOrNull(app, 'community_posts', postId)) {
    throw new NotFoundError('That post is no longer available.');
  }

  // Exactly one of postId / profileUserId is set on any report, and the other
  // has to be compared as an empty literal because a bound empty parameter
  // matches nothing. The unique index covers all three columns together.
  var postClause = c.buildEqualsFilter('postId', postId, 'postId');
  var profileClause = c.buildEqualsFilter('profileUserId', profileUserId, 'profileUserId');
  var reportParams = { reporterId: reporterId };
  Object.keys(postClause.params).forEach(function (key) { reportParams[key] = postClause.params[key]; });
  Object.keys(profileClause.params).forEach(function (key) { reportParams[key] = profileClause.params[key]; });

  var existing = c.findOneOrNull(
    app,
    'community_reports',
    'reporterId = {:reporterId} && ' + postClause.filter + ' && ' + profileClause.filter,
    reportParams
  );

  if (existing) {
    return { reported: true, duplicate: true };
  }

  var record = c.newRecord(app, 'community_reports');
  c.setValues(record, {
    postId: postId,
    profileUserId: profileUserId,
    reporterId: reporterId,
    reason: reason,
    details: c.truncate(c.trimBody(body.details), c.MAX_REPORT_DETAILS_LENGTH),
    status: 'open',
  });
  app.save(record);

  return { reported: true, duplicate: false };
}

function toggleBlock(e, handle) {
  var c = core();
  var app = e.app;
  var profile = c.requireProfile(app, e.auth);
  var userId = profile.getString('userId');
  var target = c.findProfileByHandle(app, handle);

  if (!target) {
    throw new NotFoundError('That account does not exist.');
  }

  var targetId = target.getString('userId');
  if (targetId === userId) {
    throw new BadRequestError('You cannot block yourself.');
  }

  var active = false;

  app.runInTransaction(function (tx) {
    var existing = c.findOneOrNull(tx, 'community_blocks', 'userId = {:userId} && targetId = {:targetId} && kind = "block"', {
      userId: userId,
      targetId: targetId,
    });

    if (existing) {
      tx.delete(existing);
      active = false;
      return;
    }

    var record = c.newRecord(tx, 'community_blocks');
    c.setValues(record, { userId: userId, targetId: targetId, kind: 'block' });
    tx.save(record);
    active = true;

    // Blocking severs the follow edges in both directions, the way X does.
    ['a', 'b'].forEach(function (direction) {
      var follow = c.findOneOrNull(tx, 'community_follows', 'followerId = {:followerId} && followingId = {:followingId}', {
        followerId: direction === 'a' ? userId : targetId,
        followingId: direction === 'a' ? targetId : userId,
      });
      if (!follow) {
        return;
      }
      tx.delete(follow);
      adjustProfileCounter(tx, direction === 'a' ? userId : targetId, 'followingCount', -1);
      adjustProfileCounter(tx, direction === 'a' ? targetId : userId, 'followerCount', -1);
    });
  });

  return { handle: target.getString('handle'), isBlocked: active };
}

function ensureModerator(auth) {
  var c = core();
  c.requireAuth(auth);
  if (!c.canModerate(c.getAuthRole(auth))) {
    throw new ForbiddenError('Moderator access is required.');
  }
}

function listReports(e) {
  var c = core();
  var app = e.app;
  ensureModerator(e.auth);

  var query = e.requestInfo().query || {};
  var status = c.includes(c.REPORT_STATUSES, String(query.status || '')) ? String(query.status) : 'open';
  var limit = c.clampPageSize(query.perPage, c.FEED_PAGE_SIZE, c.MAX_FEED_PAGE_SIZE);
  var cursor = c.decodeCursor(query.cursor);
  var params = { status: status };
  var records = app.findRecordsByFilter(
    'community_reports',
    applyCursor('status = {:status}', params, cursor),
    '-created,-id',
    limit + 1,
    0,
    params
  );

  var hasMore = records.length > limit;
  var page = hasMore ? records.slice(0, limit) : records;
  var postMap = content().loadPostsByIds(app, page.map(function (record) { return record.getString('postId'); }));
  var postContext = buildReportPostContext(app, postMap, e);
  var last = page.length ? page[page.length - 1] : null;

  return {
    items: page.map(function (record) {
      var post = postMap[record.getString('postId')];
      var reporter = c.findProfileByUserId(app, record.getString('reporterId'));
      var subject = record.getString('profileUserId') ? c.findProfileByUserId(app, record.getString('profileUserId')) : null;

      return {
        id: String(record.id),
        reason: record.getString('reason'),
        details: record.getString('details'),
        status: record.getString('status'),
        resolution: record.getString('resolution'),
        createdAt: record.getString('created'),
        reviewedAt: record.getString('reviewedAt'),
        reporterHandle: reporter ? reporter.getString('handle') : '',
        subjectHandle: subject ? subject.getString('handle') : '',
        subjectUserId: record.getString('profileUserId'),
        post: post ? content().serializePost(app, post, postContext) : null,
      };
    }),
    hasMore: hasMore,
    cursor: last ? c.encodeCursor(last.getString('created'), String(last.id)) : '',
  };
}

function buildReportPostContext(app, postMap, e) {
  var viewer = viewerContext(e);
  var posts = Object.keys(postMap).map(function (key) { return postMap[key]; });
  return content().buildPostContext(app, posts, viewer.id, viewer.role);
}

function resolveReport(e, reportId) {
  var c = core();
  var app = e.app;
  ensureModerator(e.auth);

  var body = e.requestInfo().body || {};
  var status = c.includes(c.REPORT_STATUSES, String(body.status || '')) ? String(body.status) : 'resolved';
  var record = c.findByIdOrNull(app, 'community_reports', reportId);

  if (!record) {
    throw new NotFoundError('That report no longer exists.');
  }

  c.setValues(record, {
    status: status,
    resolution: c.truncate(c.asText(body.resolution), 40),
    reviewedById: c.getAuthId(e.auth),
    reviewedAt: c.nowIso(),
  });
  app.save(record);

  return { id: String(record.id), status: status };
}

function moderatePost(e, postId) {
  var c = core();
  var app = e.app;
  ensureModerator(e.auth);

  var body = e.requestInfo().body || {};
  var restore = body.restore === true;
  var post = c.findByIdOrNull(app, 'community_posts', postId);

  if (!post) {
    throw new NotFoundError('That post no longer exists.');
  }

  if (restore) {
    c.setValues(post, { status: 'published', removedById: '', removedReason: '', removedAt: '' });
  } else {
    c.setValues(post, {
      status: 'removed',
      removedById: c.getAuthId(e.auth),
      removedReason: c.truncate(c.trimBody(body.reason), 500),
      removedAt: c.nowIso(),
    });
  }

  app.save(post);

  return { id: String(post.id), status: post.getString('status') };
}

function moderateProfile(e, handle) {
  var c = core();
  var app = e.app;
  ensureModerator(e.auth);

  var body = e.requestInfo().body || {};
  var profile = c.findProfileByHandle(app, handle);

  if (!profile) {
    throw new NotFoundError('That account does not exist.');
  }

  var suspend = body.suspend !== false;

  if (suspend) {
    c.setValues(profile, {
      isSuspended: true,
      suspendedReason: c.truncate(c.trimBody(body.reason), 500),
      suspendedById: c.getAuthId(e.auth),
      suspendedAt: c.nowIso(),
    });
  } else {
    c.setValues(profile, { isSuspended: false, suspendedReason: '', suspendedById: '', suspendedAt: '' });
  }

  app.save(profile);

  return { handle: profile.getString('handle'), isSuspended: profile.getBool('isSuspended') };
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

function tick(app) {
  try {
    app.findCollectionByNameOrId('community_posts');
  } catch (_) {
    return;
  }

  try {
    core().pruneRateLimits(app);
  } catch (_) {}

  try {
    content().pruneOrphanMedia(app);
  } catch (_) {}

  // recentCount decays so a tag that trended last month stops leading trends.
  try {
    var cutoff = new Date(Date.now() - 604800000).toISOString();
    app.findRecordsByFilter('community_hashtags', 'recentCount > 0 && lastUsedAt < {:cutoff}', '-recentCount', 50, 0, { cutoff: cutoff })
      .forEach(function (record) {
        record.set('recentCount', Math.floor(record.getInt('recentCount') / 2));
        try { app.save(record); } catch (_) {}
      });
  } catch (_) {}
}

module.exports = {
  applyCursor: applyCursor,
  pageResult: pageResult,
  blockedUserIds: blockedUserIds,
  appendBlockExclusion: appendBlockExclusion,
  createPost: createPost,
  deletePost: deletePost,
  toggleLike: toggleLike,
  toggleRepost: toggleRepost,
  toggleBookmark: toggleBookmark,
  toggleFollow: toggleFollow,
  listFeed: listFeed,
  getThread: getThread,
  listBookmarks: listBookmarks,
  getMe: getMe,
  getProfile: getProfile,
  updateProfile: updateProfile,
  listProfilePosts: listProfilePosts,
  listProfileConnections: listProfileConnections,
  listNotifications: listNotifications,
  markNotificationsRead: markNotificationsRead,
  search: search,
  listHashtagPosts: listHashtagPosts,
  getTrends: getTrends,
  createReport: createReport,
  toggleBlock: toggleBlock,
  ensureModerator: ensureModerator,
  listReports: listReports,
  resolveReport: resolveReport,
  moderatePost: moderatePost,
  moderateProfile: moderateProfile,
  tick: tick,
};
