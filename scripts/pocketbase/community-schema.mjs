import { autodate, bool, file, json, number, text } from './schema-fields.mjs';

// The community platform never uses PocketBase relation fields or `expand`.
// Author identity is denormalized onto every record because the `users`
// collection restricts list/view to the record owner, so a reader can never
// resolve another account through the standard record API.
//
// Every write travels through the hook routes in pb_hooks/lib/community-*.js,
// which run with the hook app context and bypass collection rules. Write rules
// are therefore null (locked) on all community collections. Read rules are open
// only where the browser needs them: profile and post media are served straight
// from PocketBase file URLs, and file downloads are authorized by the owning
// collection view rule.

export const COMMUNITY_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
];

export const COMMUNITY_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
];

export const COMMUNITY_IMAGE_MAX_BYTES = 10485760;
export const COMMUNITY_VIDEO_MAX_BYTES = 104857600;
export const COMMUNITY_POSTER_MAX_BYTES = 2097152;

export const COMMUNITY_PROFILES_SCHEMA = {
  name: 'community_profiles',
  type: 'base',
  fields: [
    autodate('created', true, false),
    autodate('updated', true, true),
    text('userId', 255, { required: true }),
    text('handle', 30, { required: true }),
    text('displayName', 120),
    text('bio', 500),
    text('location', 120),
    text('website', 2000),
    text('avatarUrl', 2000),
    file('avatar', 1, COMMUNITY_IMAGE_MAX_BYTES, COMMUNITY_IMAGE_MIME_TYPES),
    file('banner', 1, COMMUNITY_IMAGE_MAX_BYTES, COMMUNITY_IMAGE_MIME_TYPES),
    text('pinnedPostId', 255),
    number('followerCount', 0, { onlyInt: true }),
    number('followingCount', 0, { onlyInt: true }),
    number('postCount', 0, { onlyInt: true }),
    bool('isSuspended'),
    text('suspendedReason', 500),
    text('suspendedById', 255),
    text('suspendedAt', 40),
  ],
  indexes: [
    'CREATE UNIQUE INDEX idx_community_profiles_user ON community_profiles (userId)',
    'CREATE UNIQUE INDEX idx_community_profiles_handle ON community_profiles (LOWER(handle))',
  ],
  listRule: '',
  viewRule: '',
  createRule: null,
  updateRule: null,
  deleteRule: null,
};

export const COMMUNITY_POSTS_SCHEMA = {
  name: 'community_posts',
  type: 'base',
  fields: [
    autodate('created', true, false),
    autodate('updated', true, true),
    text('authorId', 255, { required: true }),
    text('authorHandle', 30),
    text('authorName', 120),
    text('authorAvatarUrl', 2000),
    // Bodies are stored as plain text. The shared comment sanitizer forbids
    // anchors and strips every attribute, so links, mentions and hashtags are
    // persisted as offset ranges in `entities` and rendered as React nodes.
    text('body', 5000),
    json('entities'),
    text('kind', 20),
    text('rootId', 255),
    text('parentId', 255),
    text('quotedPostId', 255),
    json('mediaIds'),
    json('linkPreview'),
    json('hashtags'),
    json('mentionIds'),
    number('depth', 0, { onlyInt: true }),
    number('likeCount', 0, { onlyInt: true }),
    number('replyCount', 0, { onlyInt: true }),
    number('repostCount', 0, { onlyInt: true }),
    number('quoteCount', 0, { onlyInt: true }),
    number('bookmarkCount', 0, { onlyInt: true }),
    text('status', 20),
    bool('sensitive'),
    text('removedById', 255),
    text('removedReason', 500),
    text('removedAt', 40),
    text('clientId', 64),
  ],
  indexes: [
    'CREATE INDEX idx_community_posts_author ON community_posts (authorId, created)',
    'CREATE INDEX idx_community_posts_root ON community_posts (rootId, created)',
    'CREATE INDEX idx_community_posts_parent ON community_posts (parentId, created)',
    'CREATE INDEX idx_community_posts_kind_status ON community_posts (kind, status, created)',
    'CREATE INDEX idx_community_posts_quoted ON community_posts (quotedPostId)',
    "CREATE UNIQUE INDEX idx_community_posts_client ON community_posts (authorId, clientId) WHERE clientId != ''",
  ],
  listRule: null,
  viewRule: null,
  createRule: null,
  updateRule: null,
  deleteRule: null,
};

export const COMMUNITY_MEDIA_SCHEMA = {
  name: 'community_media',
  type: 'base',
  fields: [
    autodate('created', true, false),
    autodate('updated', true, true),
    text('ownerId', 255, { required: true }),
    text('postId', 255),
    text('kind', 20),
    file('image', 1, COMMUNITY_IMAGE_MAX_BYTES, COMMUNITY_IMAGE_MIME_TYPES),
    file('video', 1, COMMUNITY_VIDEO_MAX_BYTES, COMMUNITY_VIDEO_MIME_TYPES),
    file('poster', 1, COMMUNITY_POSTER_MAX_BYTES, COMMUNITY_IMAGE_MIME_TYPES),
    text('altText', 1000),
    number('width', 0, { onlyInt: true }),
    number('height', 0, { onlyInt: true }),
    number('durationMs', 0, { onlyInt: true }),
    number('byteSize', 0, { onlyInt: true }),
    text('status', 20),
  ],
  indexes: [
    'CREATE INDEX idx_community_media_owner ON community_media (ownerId, created)',
    'CREATE INDEX idx_community_media_post ON community_media (postId)',
  ],
  // Media files are served through PocketBase file URLs, which authorize on the
  // owning collection view rule. The records themselves stay read-only.
  listRule: '',
  viewRule: '',
  createRule: null,
  updateRule: null,
  deleteRule: null,
};

export const COMMUNITY_LIKES_SCHEMA = {
  name: 'community_likes',
  type: 'base',
  fields: [
    autodate('created', true, false),
    text('postId', 255, { required: true }),
    text('userId', 255, { required: true }),
    text('postAuthorId', 255),
  ],
  indexes: [
    'CREATE UNIQUE INDEX idx_community_likes_pair ON community_likes (postId, userId)',
    'CREATE INDEX idx_community_likes_user ON community_likes (userId, created)',
  ],
  listRule: null,
  viewRule: null,
  createRule: null,
  updateRule: null,
  deleteRule: null,
};

export const COMMUNITY_REPOSTS_SCHEMA = {
  name: 'community_reposts',
  type: 'base',
  fields: [
    autodate('created', true, false),
    text('postId', 255, { required: true }),
    text('userId', 255, { required: true }),
    text('userHandle', 30),
    text('userName', 120),
    text('postAuthorId', 255),
  ],
  indexes: [
    'CREATE UNIQUE INDEX idx_community_reposts_pair ON community_reposts (postId, userId)',
    'CREATE INDEX idx_community_reposts_user ON community_reposts (userId, created)',
  ],
  listRule: null,
  viewRule: null,
  createRule: null,
  updateRule: null,
  deleteRule: null,
};

export const COMMUNITY_BOOKMARKS_SCHEMA = {
  name: 'community_bookmarks',
  type: 'base',
  fields: [
    autodate('created', true, false),
    text('postId', 255, { required: true }),
    text('userId', 255, { required: true }),
  ],
  indexes: [
    'CREATE UNIQUE INDEX idx_community_bookmarks_pair ON community_bookmarks (postId, userId)',
    'CREATE INDEX idx_community_bookmarks_user ON community_bookmarks (userId, created)',
  ],
  listRule: null,
  viewRule: null,
  createRule: null,
  updateRule: null,
  deleteRule: null,
};

export const COMMUNITY_FOLLOWS_SCHEMA = {
  name: 'community_follows',
  type: 'base',
  fields: [
    autodate('created', true, false),
    text('followerId', 255, { required: true }),
    text('followingId', 255, { required: true }),
  ],
  indexes: [
    'CREATE UNIQUE INDEX idx_community_follows_pair ON community_follows (followerId, followingId)',
    'CREATE INDEX idx_community_follows_following ON community_follows (followingId, created)',
  ],
  listRule: null,
  viewRule: null,
  createRule: null,
  updateRule: null,
  deleteRule: null,
};

export const COMMUNITY_BLOCKS_SCHEMA = {
  name: 'community_blocks',
  type: 'base',
  fields: [
    autodate('created', true, false),
    text('userId', 255, { required: true }),
    text('targetId', 255, { required: true }),
    text('kind', 20),
  ],
  indexes: [
    'CREATE UNIQUE INDEX idx_community_blocks_pair ON community_blocks (userId, targetId, kind)',
  ],
  listRule: null,
  viewRule: null,
  createRule: null,
  updateRule: null,
  deleteRule: null,
};

export const COMMUNITY_NOTIFICATIONS_SCHEMA = {
  name: 'community_notifications',
  type: 'base',
  fields: [
    autodate('created', true, false),
    text('userId', 255, { required: true }),
    text('actorId', 255),
    text('actorHandle', 30),
    text('actorName', 120),
    text('actorAvatarUrl', 2000),
    text('kind', 20),
    text('postId', 255),
    text('rootId', 255),
    text('preview', 300),
    bool('isRead'),
  ],
  indexes: [
    'CREATE INDEX idx_community_notifications_user ON community_notifications (userId, created)',
    'CREATE UNIQUE INDEX idx_community_notifications_event ON community_notifications (userId, actorId, kind, postId)',
  ],
  listRule: null,
  viewRule: null,
  createRule: null,
  updateRule: null,
  deleteRule: null,
};

export const COMMUNITY_HASHTAGS_SCHEMA = {
  name: 'community_hashtags',
  type: 'base',
  fields: [
    autodate('created', true, false),
    autodate('updated', true, true),
    text('tag', 80, { required: true }),
    text('displayTag', 80),
    number('postCount', 0, { onlyInt: true }),
    number('recentCount', 0, { onlyInt: true }),
    text('lastUsedAt', 40),
  ],
  indexes: [
    'CREATE UNIQUE INDEX idx_community_hashtags_tag ON community_hashtags (tag)',
    'CREATE INDEX idx_community_hashtags_recent ON community_hashtags (recentCount)',
  ],
  listRule: null,
  viewRule: null,
  createRule: null,
  updateRule: null,
  deleteRule: null,
};

export const COMMUNITY_LINK_PREVIEWS_SCHEMA = {
  name: 'community_link_previews',
  type: 'base',
  fields: [
    autodate('created', true, false),
    autodate('updated', true, true),
    text('urlKey', 64, { required: true }),
    text('url', 2000),
    text('title', 300),
    text('description', 600),
    text('imageUrl', 2000),
    text('siteName', 200),
    text('status', 20),
    text('fetchedAt', 40),
  ],
  indexes: [
    'CREATE UNIQUE INDEX idx_community_link_previews_key ON community_link_previews (urlKey)',
  ],
  listRule: null,
  viewRule: null,
  createRule: null,
  updateRule: null,
  deleteRule: null,
};

export const COMMUNITY_REPORTS_SCHEMA = {
  name: 'community_reports',
  type: 'base',
  fields: [
    autodate('created', true, false),
    autodate('updated', true, true),
    text('postId', 255),
    text('profileUserId', 255),
    text('reporterId', 255, { required: true }),
    text('reason', 40),
    text('details', 1000),
    text('status', 20),
    text('reviewedById', 255),
    text('reviewedAt', 40),
    text('resolution', 40),
  ],
  indexes: [
    'CREATE UNIQUE INDEX idx_community_reports_pair ON community_reports (reporterId, postId, profileUserId)',
    'CREATE INDEX idx_community_reports_status ON community_reports (status, created)',
  ],
  listRule: null,
  viewRule: null,
  createRule: null,
  updateRule: null,
  deleteRule: null,
};

export const COMMUNITY_RATE_LIMITS_SCHEMA = {
  name: 'community_rate_limits',
  type: 'base',
  fields: [
    autodate('created', true, false),
    autodate('updated', true, true),
    text('bucketKey', 200, { required: true }),
    number('count', 0, { onlyInt: true }),
    text('windowStartedAt', 40),
  ],
  indexes: [
    'CREATE UNIQUE INDEX idx_community_rate_limits_bucket ON community_rate_limits (bucketKey)',
  ],
  listRule: null,
  viewRule: null,
  createRule: null,
  updateRule: null,
  deleteRule: null,
};

export const COMMUNITY_COLLECTION_SCHEMAS = [
  COMMUNITY_PROFILES_SCHEMA,
  COMMUNITY_POSTS_SCHEMA,
  COMMUNITY_MEDIA_SCHEMA,
  COMMUNITY_LIKES_SCHEMA,
  COMMUNITY_REPOSTS_SCHEMA,
  COMMUNITY_BOOKMARKS_SCHEMA,
  COMMUNITY_FOLLOWS_SCHEMA,
  COMMUNITY_BLOCKS_SCHEMA,
  COMMUNITY_NOTIFICATIONS_SCHEMA,
  COMMUNITY_HASHTAGS_SCHEMA,
  COMMUNITY_LINK_PREVIEWS_SCHEMA,
  COMMUNITY_REPORTS_SCHEMA,
  COMMUNITY_RATE_LIMITS_SCHEMA,
];
