import { getPocketBase, POCKETBASE_URL } from './client';
import {
  COMMUNITY_ENTITY_TYPES,
  COMMUNITY_NOTIFICATION_KINDS,
  COMMUNITY_POST_KINDS,
  COMMUNITY_POST_STATUSES,
  COMMUNITY_REPORT_REASONS,
  COMMUNITY_REPORT_STATUSES,
  type CommunityBlockResult,
  type CommunityEngagementResult,
  type CommunityEntity,
  type CommunityEntityType,
  type CommunityFeedTab,
  type CommunityFollowResult,
  type CommunityHashtag,
  type CommunityHashtagPage,
  type CommunityLinkPreview,
  type CommunityMedia,
  type CommunityMediaUpload,
  type CommunityNotification,
  type CommunityNotificationKind,
  type CommunityNotificationPage,
  type CommunityPage,
  type CommunityPost,
  type CommunityPostAuthor,
  type CommunityPostKind,
  type CommunityPostStatus,
  type CommunityProfile,
  type CommunityProfilePatch,
  type CommunityProfileTab,
  type CommunityReport,
  type CommunityReportReason,
  type CommunityReportStatus,
  type CommunitySearchType,
  type CommunitySession,
  type CommunityThread,
  type CommunityTrends,
} from '@/types/community';

// Client for the community hook routes registered in pb_hooks/community.pb.js.
// Every route returns a plain JSON envelope rather than a PocketBase record, so
// nothing here goes through pb.collection(...) and no collection rules apply.

// ---------------------------------------------------------------------------
// Primitive readers
// ---------------------------------------------------------------------------

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function bool(value: unknown): boolean {
  return value === true;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

// The hooks return root-relative file paths (/api/files/...) so a copy that was
// denormalized onto a post stays valid if the deployment origin changes. The
// browser needs them resolved against the PocketBase origin, which is not
// necessarily the page origin during local development.
export function resolveCommunityFileUrl(path: string): string {
  const value = str(path).trim();
  if (!value) {
    return '';
  }
  if (/^(https?:)?\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }
  const base = POCKETBASE_URL.replace(/\/+$/, '');
  return value.startsWith('/') ? `${base}${value}` : `${base}/${value}`;
}

export function getPocketBaseErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const response = record((error as { response?: unknown }).response);
    const message = str(response.message);
    if (message) {
      return message;
    }
    const data = record(response.data);
    const details = Object.entries(data)
      .map(([key, value]) => {
        const entry = record(value);
        return str(entry.message) || `${key}: ${String(value)}`;
      })
      .filter(Boolean)
      .join(', ');
    if (details) {
      return details;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapEntity(raw: unknown): CommunityEntity | null {
  const value = record(raw);
  const start = num(value.start);
  const end = num(value.end);
  if (end <= start) {
    return null;
  }
  return {
    type: oneOf<CommunityEntityType>(value.type, COMMUNITY_ENTITY_TYPES, 'hashtag'),
    start,
    end,
    value: str(value.value),
    display: str(value.display),
  };
}

function mapEntities(raw: unknown): CommunityEntity[] {
  return list(raw)
    .map(mapEntity)
    .filter((entity): entity is CommunityEntity => entity !== null)
    .sort((a, b) => a.start - b.start);
}

export function mapCommunityMedia(raw: unknown): CommunityMedia {
  const value = record(raw);
  const kind = str(value.kind) === 'video' ? 'video' : 'image';
  return {
    id: str(value.id),
    kind,
    url: resolveCommunityFileUrl(str(value.url)),
    posterUrl: resolveCommunityFileUrl(str(value.posterUrl)),
    altText: str(value.altText),
    width: num(value.width),
    height: num(value.height),
    durationMs: num(value.durationMs),
    byteSize: num(value.byteSize),
  };
}

function mapLinkPreview(raw: unknown): CommunityLinkPreview | null {
  const value = record(raw);
  const url = str(value.url);
  if (!url) {
    return null;
  }
  return {
    url,
    title: str(value.title),
    description: str(value.description),
    imageUrl: str(value.imageUrl),
    siteName: str(value.siteName),
    status: str(value.status) || 'ok',
  };
}

function mapAuthor(raw: unknown): CommunityPostAuthor | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const value = record(raw);
  return {
    userId: str(value.userId),
    handle: str(value.handle),
    displayName: str(value.displayName),
    avatarUrl: resolveCommunityFileUrl(str(value.avatarUrl)),
    isFollowing: bool(value.isFollowing),
  };
}

export function mapCommunityPost(raw: unknown, depth = 0): CommunityPost {
  const value = record(raw);
  return {
    id: str(value.id),
    kind: oneOf<CommunityPostKind>(value.kind, COMMUNITY_POST_KINDS, 'post'),
    status: oneOf<CommunityPostStatus>(value.status, COMMUNITY_POST_STATUSES, 'published'),
    body: str(value.body),
    entities: mapEntities(value.entities),
    hashtags: list(value.hashtags).map(str).filter(Boolean),
    media: list(value.media).map(mapCommunityMedia),
    linkPreview: mapLinkPreview(value.linkPreview),
    // The server only ever nests one level, but the guard keeps a malformed
    // payload from recursing without an end.
    quotedPost: depth === 0 && value.quotedPost ? mapCommunityPost(value.quotedPost, depth + 1) : null,
    quotedPostId: str(value.quotedPostId),
    parentId: str(value.parentId),
    rootId: str(value.rootId),
    depth: num(value.depth),
    sensitive: bool(value.sensitive),
    createdAt: str(value.createdAt),
    updatedAt: str(value.updatedAt),
    likeCount: num(value.likeCount),
    replyCount: num(value.replyCount),
    repostCount: num(value.repostCount),
    quoteCount: num(value.quoteCount),
    bookmarkCount: num(value.bookmarkCount),
    liked: bool(value.liked),
    reposted: bool(value.reposted),
    bookmarked: bool(value.bookmarked),
    removedReason: str(value.removedReason),
    author: mapAuthor(value.author),
    isAuthor: bool(value.isAuthor),
    canModerate: bool(value.canModerate),
  };
}

export function mapCommunityProfile(raw: unknown): CommunityProfile {
  const value = record(raw);
  return {
    id: str(value.id),
    userId: str(value.userId),
    handle: str(value.handle),
    displayName: str(value.displayName),
    bio: str(value.bio),
    location: str(value.location),
    website: str(value.website),
    avatarUrl: resolveCommunityFileUrl(str(value.avatarUrl)),
    bannerUrl: resolveCommunityFileUrl(str(value.bannerUrl)),
    pinnedPostId: str(value.pinnedPostId),
    followerCount: num(value.followerCount),
    followingCount: num(value.followingCount),
    postCount: num(value.postCount),
    isSuspended: bool(value.isSuspended),
    suspendedReason: str(value.suspendedReason),
    createdAt: str(value.createdAt),
    isFollowing: bool(value.isFollowing),
    isFollowedBy: bool(value.isFollowedBy),
    isSelf: bool(value.isSelf),
  };
}

function mapHashtag(raw: unknown): CommunityHashtag {
  const value = record(raw);
  const tag = str(value.tag);
  return {
    tag,
    displayTag: str(value.displayTag) || tag,
    postCount: num(value.postCount),
    recentCount: num(value.recentCount),
    lastUsedAt: str(value.lastUsedAt),
  };
}

function mapNotification(raw: unknown): CommunityNotification {
  const value = record(raw);
  return {
    id: str(value.id),
    kind: oneOf<CommunityNotificationKind>(value.kind, COMMUNITY_NOTIFICATION_KINDS, 'like'),
    actorId: str(value.actorId),
    actorHandle: str(value.actorHandle),
    actorName: str(value.actorName),
    actorAvatarUrl: resolveCommunityFileUrl(str(value.actorAvatarUrl)),
    postId: str(value.postId),
    rootId: str(value.rootId),
    preview: str(value.preview),
    isRead: bool(value.isRead),
    createdAt: str(value.createdAt),
  };
}

function mapReport(raw: unknown): CommunityReport {
  const value = record(raw);
  return {
    id: str(value.id),
    reason: oneOf<CommunityReportReason>(value.reason, COMMUNITY_REPORT_REASONS, 'other'),
    details: str(value.details),
    status: oneOf<CommunityReportStatus>(value.status, COMMUNITY_REPORT_STATUSES, 'open'),
    resolution: str(value.resolution),
    createdAt: str(value.createdAt),
    reviewedAt: str(value.reviewedAt),
    reporterHandle: str(value.reporterHandle),
    subjectHandle: str(value.subjectHandle),
    subjectUserId: str(value.subjectUserId),
    post: value.post ? mapCommunityPost(value.post) : null,
  };
}

function mapPage<T>(raw: unknown, mapper: (item: unknown) => T): CommunityPage<T> {
  const value = record(raw);
  return {
    items: list(value.items).map(mapper),
    hasMore: bool(value.hasMore),
    cursor: str(value.cursor),
  };
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === '') {
      return;
    }
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

async function getJson(path: string): Promise<unknown> {
  return getPocketBase().send(path, { method: 'GET', requestKey: null });
}

async function sendJson(path: string, method: 'POST' | 'PATCH' | 'DELETE', payload?: unknown): Promise<unknown> {
  return getPocketBase().send(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
    requestKey: null,
  });
}

async function sendForm(path: string, method: 'POST' | 'PATCH', payload: FormData): Promise<unknown> {
  return getPocketBase().send(path, { method, body: payload, requestKey: null });
}

// --- Session and profiles --------------------------------------------------

export async function fetchCommunitySession(): Promise<CommunitySession> {
  const value = record(await getJson('/api/community/me'));
  return {
    profile: mapCommunityProfile(value.profile),
    unreadNotifications: num(value.unreadNotifications),
    canModerate: bool(value.canModerate),
  };
}

const PROFILE_TEXT_FIELDS = ['handle', 'displayName', 'bio', 'location', 'website', 'pinnedPostId'] as const;

export async function updateCommunityProfile(patch: CommunityProfilePatch): Promise<CommunityProfile> {
  const hasFiles = Boolean(patch.avatar || patch.banner);

  if (!hasFiles) {
    const body: Record<string, unknown> = {};
    PROFILE_TEXT_FIELDS.forEach((key) => {
      if (patch[key] !== undefined) {
        body[key] = patch[key];
      }
    });
    const value = record(await sendJson('/api/community/me', 'PATCH', body));
    return mapCommunityProfile(value.profile);
  }

  // PATCH /api/community/me is registered with $apis.bodyLimit(0) so an avatar
  // or banner can ride along with the text fields in one multipart request.
  const form = new FormData();
  PROFILE_TEXT_FIELDS.forEach((key) => {
    const value = patch[key];
    if (value !== undefined) {
      form.append(key, String(value));
    }
  });
  if (patch.avatar) {
    form.append('avatar', patch.avatar);
  }
  if (patch.banner) {
    form.append('banner', patch.banner);
  }

  const value = record(await sendForm('/api/community/me', 'PATCH', form));
  return mapCommunityProfile(value.profile);
}

export async function fetchCommunityProfile(handle: string): Promise<CommunityProfile> {
  const value = record(await getJson(`/api/community/profiles/${encodeURIComponent(handle)}`));
  return mapCommunityProfile(value.profile);
}

export async function fetchCommunityProfilePosts(
  handle: string,
  options: { tab?: CommunityProfileTab; cursor?: string; perPage?: number } = {},
): Promise<CommunityPage<CommunityPost>> {
  const query = buildQuery({ tab: options.tab, cursor: options.cursor, perPage: options.perPage });
  const path = `/api/community/profiles/${encodeURIComponent(handle)}/posts${query}`;
  return mapPage(await getJson(path), (item) => mapCommunityPost(item));
}

export async function fetchCommunityConnections(
  handle: string,
  direction: 'followers' | 'following',
  options: { cursor?: string; perPage?: number } = {},
): Promise<CommunityPage<CommunityProfile>> {
  const query = buildQuery({ cursor: options.cursor, perPage: options.perPage });
  const path = `/api/community/profiles/${encodeURIComponent(handle)}/${direction}${query}`;
  return mapPage(await getJson(path), mapCommunityProfile);
}

export async function toggleCommunityFollow(handle: string): Promise<CommunityFollowResult> {
  const path = `/api/community/profiles/${encodeURIComponent(handle)}/follow`;
  const value = record(await sendJson(path, 'POST'));
  return {
    handle: str(value.handle) || handle,
    isFollowing: bool(value.isFollowing),
    followerCount: num(value.followerCount),
  };
}

export async function toggleCommunityBlock(handle: string): Promise<CommunityBlockResult> {
  const path = `/api/community/profiles/${encodeURIComponent(handle)}/block`;
  const value = record(await sendJson(path, 'POST'));
  return { handle: str(value.handle) || handle, isBlocked: bool(value.isBlocked) };
}

// --- Feed and posts --------------------------------------------------------

export async function fetchCommunityFeed(
  options: { tab?: CommunityFeedTab; cursor?: string; perPage?: number } = {},
): Promise<CommunityPage<CommunityPost>> {
  const query = buildQuery({ tab: options.tab, cursor: options.cursor, perPage: options.perPage });
  return mapPage(await getJson(`/api/community/feed${query}`), (item) => mapCommunityPost(item));
}

export async function fetchCommunityThread(
  postId: string,
  options: { cursor?: string; perPage?: number } = {},
): Promise<CommunityThread> {
  const query = buildQuery({ cursor: options.cursor, perPage: options.perPage });
  const value = record(await getJson(`/api/community/posts/${encodeURIComponent(postId)}${query}`));
  return {
    post: mapCommunityPost(value.post),
    ancestors: list(value.ancestors).map((item) => mapCommunityPost(item)),
    replies: list(value.replies).map((item) => mapCommunityPost(item)),
    hasMore: bool(value.hasMore),
    cursor: str(value.cursor),
  };
}

export async function createCommunityPost(draft: {
  body: string;
  mediaIds?: string[];
  parentId?: string;
  quotedPostId?: string;
  clientId?: string;
  sensitive?: boolean;
}): Promise<CommunityPost> {
  const payload = {
    body: draft.body,
    mediaIds: draft.mediaIds ?? [],
    parentId: draft.parentId ?? '',
    quotedPostId: draft.quotedPostId ?? '',
    clientId: draft.clientId ?? '',
    sensitive: draft.sensitive === true,
  };
  return mapCommunityPost(await sendJson('/api/community/posts', 'POST', payload));
}

export async function deleteCommunityPost(postId: string): Promise<void> {
  await sendJson(`/api/community/posts/${encodeURIComponent(postId)}`, 'DELETE');
}

async function toggleEngagement(
  postId: string,
  action: 'like' | 'repost' | 'bookmark',
): Promise<CommunityEngagementResult> {
  const path = `/api/community/posts/${encodeURIComponent(postId)}/${action}`;
  const value = record(await sendJson(path, 'POST'));
  return {
    postId: str(value.postId) || postId,
    active: bool(value.active),
    likeCount: typeof value.likeCount === 'number' ? value.likeCount : undefined,
    repostCount: typeof value.repostCount === 'number' ? value.repostCount : undefined,
    bookmarkCount: typeof value.bookmarkCount === 'number' ? value.bookmarkCount : undefined,
  };
}

export async function toggleCommunityLike(postId: string): Promise<CommunityEngagementResult> {
  return toggleEngagement(postId, 'like');
}

export async function toggleCommunityRepost(postId: string): Promise<CommunityEngagementResult> {
  return toggleEngagement(postId, 'repost');
}

export async function toggleCommunityBookmark(postId: string): Promise<CommunityEngagementResult> {
  return toggleEngagement(postId, 'bookmark');
}

export async function fetchCommunityBookmarks(
  options: { cursor?: string; perPage?: number } = {},
): Promise<CommunityPage<CommunityPost>> {
  const query = buildQuery({ cursor: options.cursor, perPage: options.perPage });
  return mapPage(await getJson(`/api/community/bookmarks${query}`), (item) => mapCommunityPost(item));
}

// --- Media and link previews -----------------------------------------------

export async function uploadCommunityMedia(upload: CommunityMediaUpload): Promise<CommunityMedia> {
  const form = new FormData();
  form.append('file', upload.file);
  if (upload.kind) {
    form.append('kind', upload.kind);
  }
  if (upload.altText) {
    form.append('altText', upload.altText);
  }
  if (upload.width) {
    form.append('width', String(Math.round(upload.width)));
  }
  if (upload.height) {
    form.append('height', String(Math.round(upload.height)));
  }
  if (upload.durationMs) {
    form.append('durationMs', String(Math.round(upload.durationMs)));
  }
  if (upload.poster) {
    form.append('poster', upload.poster);
  }

  return mapCommunityMedia(await sendForm('/api/community/media', 'POST', form));
}

export async function fetchCommunityLinkPreview(url: string): Promise<CommunityLinkPreview | null> {
  const value = record(await sendJson('/api/community/link-preview', 'POST', { url }));
  return mapLinkPreview(value.preview);
}

// --- Notifications ---------------------------------------------------------

export async function fetchCommunityNotifications(
  options: { kind?: CommunityNotificationKind; cursor?: string; perPage?: number } = {},
): Promise<CommunityNotificationPage> {
  const query = buildQuery({ kind: options.kind, cursor: options.cursor, perPage: options.perPage });
  const raw = await getJson(`/api/community/notifications${query}`);
  const page = mapPage(raw, mapNotification);
  return { ...page, unreadCount: num(record(raw).unreadCount) };
}

export async function markCommunityNotificationsRead(ids: string[] = []): Promise<number> {
  const value = record(await sendJson('/api/community/notifications/read', 'POST', { ids }));
  return num(value.updated);
}

// --- Discovery -------------------------------------------------------------

export async function searchCommunityPosts(
  term: string,
  options: { cursor?: string; perPage?: number } = {},
): Promise<CommunityPage<CommunityPost>> {
  const query = buildQuery({ q: term, type: 'posts', cursor: options.cursor, perPage: options.perPage });
  return mapPage(await getJson(`/api/community/search${query}`), (item) => mapCommunityPost(item));
}

export async function searchCommunityPeople(
  term: string,
  options: { cursor?: string; perPage?: number } = {},
): Promise<CommunityPage<CommunityProfile>> {
  const query = buildQuery({ q: term, type: 'people', cursor: options.cursor, perPage: options.perPage });
  return mapPage(await getJson(`/api/community/search${query}`), mapCommunityProfile);
}

export async function searchCommunityHashtags(term: string): Promise<CommunityHashtag[]> {
  const query = buildQuery({ q: term, type: 'hashtags' });
  return mapPage(await getJson(`/api/community/search${query}`), mapHashtag).items;
}

export function communitySearchTypeOf(value: string): CommunitySearchType {
  return oneOf<CommunitySearchType>(value, ['posts', 'people', 'hashtags'], 'posts');
}

export async function fetchCommunityHashtagPosts(
  tag: string,
  options: { cursor?: string; perPage?: number } = {},
): Promise<CommunityHashtagPage> {
  const query = buildQuery({ cursor: options.cursor, perPage: options.perPage });
  const raw = await getJson(`/api/community/hashtags/${encodeURIComponent(tag)}${query}`);
  const page = mapPage(raw, (item) => mapCommunityPost(item));
  return { ...page, tag: str(record(raw).tag) || tag };
}

export async function fetchCommunityTrends(): Promise<CommunityTrends> {
  const value = record(await getJson('/api/community/trends'));
  return {
    trends: list(value.trends).map(mapHashtag),
    suggestions: list(value.suggestions).map(mapCommunityProfile),
  };
}

// --- Reports and moderation ------------------------------------------------

export async function reportCommunityContent(input: {
  postId?: string;
  handle?: string;
  reason: CommunityReportReason;
  details?: string;
}): Promise<{ reported: boolean; duplicate: boolean }> {
  const value = record(await sendJson('/api/community/reports', 'POST', {
    postId: input.postId ?? '',
    handle: input.handle ?? '',
    reason: input.reason,
    details: input.details ?? '',
  }));
  return { reported: bool(value.reported), duplicate: bool(value.duplicate) };
}

export async function fetchCommunityReports(
  options: { status?: CommunityReportStatus; cursor?: string; perPage?: number } = {},
): Promise<CommunityPage<CommunityReport>> {
  const query = buildQuery({ status: options.status, cursor: options.cursor, perPage: options.perPage });
  return mapPage(await getJson(`/api/community/moderation/reports${query}`), mapReport);
}

export async function resolveCommunityReport(
  reportId: string,
  status: CommunityReportStatus,
  resolution = '',
): Promise<{ id: string; status: CommunityReportStatus }> {
  const path = `/api/community/moderation/reports/${encodeURIComponent(reportId)}`;
  const value = record(await sendJson(path, 'PATCH', { status, resolution }));
  return {
    id: str(value.id) || reportId,
    status: oneOf<CommunityReportStatus>(value.status, COMMUNITY_REPORT_STATUSES, status),
  };
}

export async function moderateCommunityPost(
  postId: string,
  options: { restore?: boolean; reason?: string } = {},
): Promise<{ id: string; status: CommunityPostStatus }> {
  const path = `/api/community/moderation/posts/${encodeURIComponent(postId)}`;
  const value = record(await sendJson(path, 'PATCH', {
    restore: options.restore === true,
    reason: options.reason ?? '',
  }));
  return {
    id: str(value.id) || postId,
    status: oneOf<CommunityPostStatus>(value.status, COMMUNITY_POST_STATUSES, 'removed'),
  };
}

export async function moderateCommunityProfile(
  handle: string,
  options: { suspend?: boolean; reason?: string } = {},
): Promise<{ handle: string; isSuspended: boolean }> {
  const path = `/api/community/moderation/profiles/${encodeURIComponent(handle)}`;
  const value = record(await sendJson(path, 'PATCH', {
    suspend: options.suspend !== false,
    reason: options.reason ?? '',
  }));
  return { handle: str(value.handle) || handle, isSuspended: bool(value.isSuspended) };
}
