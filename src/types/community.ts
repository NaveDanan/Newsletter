// TypeScript mirrors of the envelopes returned by the /api/community/* hook
// routes in pb_hooks/lib/community.js. The hooks always answer with fully
// denormalized objects because the users collection is not readable by
// non-admins and PocketBase relations are not used anywhere in this project.

export const COMMUNITY_FEED_TABS = ['for-you', 'following', 'latest'] as const;
export type CommunityFeedTab = (typeof COMMUNITY_FEED_TABS)[number];

export const COMMUNITY_PROFILE_TABS = ['posts', 'replies', 'media', 'likes'] as const;
export type CommunityProfileTab = (typeof COMMUNITY_PROFILE_TABS)[number];

export const COMMUNITY_POST_KINDS = ['post', 'reply', 'quote'] as const;
export type CommunityPostKind = (typeof COMMUNITY_POST_KINDS)[number];

export const COMMUNITY_POST_STATUSES = ['published', 'removed', 'deleted'] as const;
export type CommunityPostStatus = (typeof COMMUNITY_POST_STATUSES)[number];

export const COMMUNITY_NOTIFICATION_KINDS = ['like', 'reply', 'repost', 'quote', 'follow', 'mention'] as const;
export type CommunityNotificationKind = (typeof COMMUNITY_NOTIFICATION_KINDS)[number];

export const COMMUNITY_REPORT_REASONS = ['spam', 'abuse', 'harassment', 'misinformation', 'sensitive', 'other'] as const;
export type CommunityReportReason = (typeof COMMUNITY_REPORT_REASONS)[number];

export const COMMUNITY_REPORT_STATUSES = ['open', 'resolved', 'dismissed'] as const;
export type CommunityReportStatus = (typeof COMMUNITY_REPORT_STATUSES)[number];

export const COMMUNITY_ENTITY_TYPES = ['hashtag', 'mention', 'url'] as const;
export type CommunityEntityType = (typeof COMMUNITY_ENTITY_TYPES)[number];

export const COMMUNITY_SEARCH_TYPES = ['posts', 'people', 'hashtags'] as const;
export type CommunitySearchType = (typeof COMMUNITY_SEARCH_TYPES)[number];

// Client-side caps. They mirror the server constants in
// pb_hooks/lib/community-core.js and scripts/pocketbase/community-schema.mjs so
// the composer can reject oversized input before spending an upload.
export const COMMUNITY_MAX_BODY_LENGTH = 5000;
export const COMMUNITY_MAX_MEDIA_PER_POST = 4;
export const COMMUNITY_MAX_HANDLE_LENGTH = 30;
export const COMMUNITY_MIN_HANDLE_LENGTH = 3;
export const COMMUNITY_MAX_BIO_LENGTH = 500;
export const COMMUNITY_MAX_DISPLAY_NAME_LENGTH = 120;
export const COMMUNITY_MAX_LOCATION_LENGTH = 120;
export const COMMUNITY_MAX_ALT_TEXT_LENGTH = 1000;
export const COMMUNITY_MAX_REPORT_DETAILS_LENGTH = 1000;
export const COMMUNITY_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const COMMUNITY_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const COMMUNITY_FEED_PAGE_SIZE = 20;

// An offset range inside a post body. The server never returns HTML because
// src/lib/comment-formatting.ts bans anchors, so the renderer turns these
// ranges into React nodes itself.
export interface CommunityEntity {
  type: CommunityEntityType;
  start: number;
  end: number;
  /** Normalized value: a lowercase tag, a lowercase handle or an absolute URL. */
  value: string;
  /** The text exactly as the author typed it. */
  display: string;
}

export interface CommunityMedia {
  id: string;
  kind: 'image' | 'video';
  /** Root-relative path such as /api/files/<collection>/<record>/<file>. */
  url: string;
  posterUrl: string;
  altText: string;
  width: number;
  height: number;
  durationMs: number;
  byteSize: number;
}

export interface CommunityLinkPreview {
  url: string;
  title: string;
  description: string;
  imageUrl: string;
  siteName: string;
  status: string;
}

export interface CommunityPostAuthor {
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl: string;
  isFollowing: boolean;
}

export interface CommunityPost {
  id: string;
  kind: CommunityPostKind;
  status: CommunityPostStatus;
  body: string;
  entities: CommunityEntity[];
  hashtags: string[];
  media: CommunityMedia[];
  linkPreview: CommunityLinkPreview | null;
  quotedPost: CommunityPost | null;
  quotedPostId: string;
  parentId: string;
  rootId: string;
  depth: number;
  sensitive: boolean;
  createdAt: string;
  updatedAt: string;
  likeCount: number;
  replyCount: number;
  repostCount: number;
  quoteCount: number;
  bookmarkCount: number;
  liked: boolean;
  reposted: boolean;
  bookmarked: boolean;
  removedReason: string;
  /** null on a removed post, whose author identity is withheld. */
  author: CommunityPostAuthor | null;
  isAuthor: boolean;
  canModerate: boolean;
}

export interface CommunityProfile {
  id: string;
  userId: string;
  handle: string;
  displayName: string;
  bio: string;
  location: string;
  website: string;
  avatarUrl: string;
  bannerUrl: string;
  pinnedPostId: string;
  followerCount: number;
  followingCount: number;
  postCount: number;
  isSuspended: boolean;
  suspendedReason: string;
  createdAt: string;
  isFollowing: boolean;
  isFollowedBy: boolean;
  isSelf: boolean;
}

export interface CommunitySession {
  profile: CommunityProfile;
  unreadNotifications: number;
  canModerate: boolean;
}

export interface CommunityHashtag {
  tag: string;
  displayTag: string;
  postCount: number;
  recentCount: number;
  lastUsedAt: string;
}

export interface CommunityNotification {
  id: string;
  kind: CommunityNotificationKind;
  actorId: string;
  actorHandle: string;
  actorName: string;
  actorAvatarUrl: string;
  postId: string;
  rootId: string;
  preview: string;
  isRead: boolean;
  createdAt: string;
}

// Every list route answers with keyset pagination: an opaque cursor plus a
// hasMore flag. Offsets are never used because the feed shifts under writes.
export interface CommunityPage<T> {
  items: T[];
  hasMore: boolean;
  cursor: string;
}

export interface CommunityNotificationPage extends CommunityPage<CommunityNotification> {
  unreadCount: number;
}

export interface CommunityHashtagPage extends CommunityPage<CommunityPost> {
  tag: string;
}

export interface CommunityThread {
  post: CommunityPost;
  ancestors: CommunityPost[];
  replies: CommunityPost[];
  hasMore: boolean;
  cursor: string;
}

export interface CommunityTrends {
  trends: CommunityHashtag[];
  suggestions: CommunityProfile[];
}

export interface CommunityFollowResult {
  handle: string;
  isFollowing: boolean;
  followerCount: number;
}

export interface CommunityBlockResult {
  handle: string;
  isBlocked: boolean;
}

export interface CommunityEngagementResult {
  postId: string;
  active: boolean;
  likeCount?: number;
  repostCount?: number;
  bookmarkCount?: number;
}

export interface CommunityReport {
  id: string;
  reason: CommunityReportReason;
  details: string;
  status: CommunityReportStatus;
  resolution: string;
  createdAt: string;
  reviewedAt: string;
  reporterHandle: string;
  subjectHandle: string;
  subjectUserId: string;
  post: CommunityPost | null;
}

export interface CommunityComposerDraft {
  body: string;
  mediaIds: string[];
  parentId?: string;
  quotedPostId?: string;
  /** Idempotency key so a retried submit never creates a second post. */
  clientId?: string;
  sensitive?: boolean;
}

export interface CommunityProfilePatch {
  handle?: string;
  displayName?: string;
  bio?: string;
  location?: string;
  website?: string;
  pinnedPostId?: string;
  avatar?: File | null;
  banner?: File | null;
}

export interface CommunityMediaUpload {
  file: File;
  kind?: 'image' | 'video';
  altText?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  poster?: File | null;
}
