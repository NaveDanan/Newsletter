import { eventWithUtcDates } from '@/lib/event-time';
import type { RecordModel } from 'pocketbase';
import { getPocketBase } from './client';
import { cachedRead, peekRead, readCache, readScope, invalidateReads } from './read-cache';
import { readStoredArticle, storePublicArticle, forgetStoredArticle } from '@/lib/article-store';
import { extractExcerpt, calculateReadTime } from '../newsletters';
import { inferNewsletterTextAlignment, normalizeNewsletterTextAlignment } from '../newsletter-alignment';
import type {
  Newsletter,
  NewsletterComment,
  NewsletterEvent,
  NewsletterEventAttendee,
  NewsletterFormData,
  NewsletterPoll,
  NewsletterPollOption,
  PresentationPreview,
} from '../../types/newsletter';

export const NEWSLETTERS_COLLECTION = 'newsletters';

interface NewsletterUpdateEmailResponse {
  recipientCount?: number;
}

interface ApiListResponse<T> {
  items?: T[];
  totalPages?: number;
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function normalizeComments(raw: unknown): NewsletterComment[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: unknown) => {
    if (!item || typeof item !== 'object') return null;
    const c = item as Record<string, unknown>;
    return {
      id: typeof c.id === 'string' ? c.id : `${Date.now()}-${Math.random()}`,
      authorId: typeof c.authorId === 'string' ? c.authorId : '',
      authorName: typeof c.authorName === 'string' ? c.authorName : '',
      authorAvatar: typeof c.authorAvatar === 'string' ? c.authorAvatar : undefined,
      body: typeof c.body === 'string' ? c.body : '',
      createdAt: typeof c.createdAt === 'string' ? c.createdAt : new Date().toISOString(),
      likes: typeof c.likes === 'number' ? c.likes : 0,
      likedByUserIds: Array.isArray(c.likedByUserIds) ? (c.likedByUserIds as string[]) : [],
    } as NewsletterComment;
  }).filter((c): c is NewsletterComment => c !== null);
}

export function normalizePoll(raw: unknown): NewsletterPoll | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const question = typeof p.question === 'string' ? p.question.trim() : '';
  if (!question) return null;

  const rawOptions = Array.isArray(p.options) ? p.options : [];
  const options: NewsletterPollOption[] = rawOptions.map((opt, index): NewsletterPollOption | null => {
    if (!opt || typeof opt !== 'object') return null;
    const o = opt as Record<string, unknown>;
    const text = typeof o.text === 'string' ? o.text.trim() : '';
    if (!text) return null;
    const voterUserIds = Array.isArray(o.voterUserIds)
      ? (o.voterUserIds as unknown[]).filter((id): id is string => typeof id === 'string' && Boolean(id))
      : [];
    return {
      id: typeof o.id === 'string' && o.id ? o.id : `opt-${index + 1}`,
      text,
      votes: typeof o.votes === 'number' ? Math.max(o.votes, voterUserIds.length) : voterUserIds.length,
      voterUserIds,
    };
  }).filter((o): o is NewsletterPollOption => o !== null);

  if (options.length === 0) return null;

  return {
    id: typeof p.id === 'string' && p.id ? p.id : `poll-${Date.now()}`,
    question,
    options,
    closed: Boolean(p.closed),
    createdAt: typeof p.createdAt === 'string' ? p.createdAt : undefined,
  };
}

export function normalizeEvent(raw: unknown): NewsletterEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  const title = typeof e.title === 'string' ? e.title.trim() : '';
  const startDate = typeof e.startDate === 'string' ? e.startDate.trim() : '';
  if (!title || !startDate) return null;

  const rawAttendees = Array.isArray(e.attendees) ? e.attendees : [];
  const attendees: NewsletterEventAttendee[] = rawAttendees.map((att): NewsletterEventAttendee | null => {
    if (!att || typeof att !== 'object') return null;
    const a = att as Record<string, unknown>;
    const userId = typeof a.userId === 'string' ? a.userId : '';
    if (!userId) return null;
    return {
      userId,
      name: typeof a.name === 'string' ? a.name : 'Attendee',
      avatar: typeof a.avatar === 'string' ? a.avatar : undefined,
      rsvpAt: typeof a.rsvpAt === 'string' ? a.rsvpAt : new Date().toISOString(),
    };
  }).filter((a): a is NewsletterEventAttendee => a !== null);

  return {
    id: typeof e.id === 'string' && e.id ? e.id : `event-${Date.now()}`,
    title,
    description: typeof e.description === 'string' ? e.description : '',
    startDate,
    endDate: typeof e.endDate === 'string' && e.endDate.trim() ? e.endDate.trim() : undefined,
    location: typeof e.location === 'string' ? e.location : '',
    attendees,
  };
}

function getRecordFileUrl(pb: ReturnType<typeof getPocketBase>, record: RecordModel, fileName: string): string {
  const files = pb.files as { getURL?: (record: RecordModel, fileName: string) => string; getUrl?: (record: RecordModel, fileName: string) => string };
  if (typeof files.getURL === 'function') {
    return files.getURL(record, fileName);
  }

  return files.getUrl ? files.getUrl(record, fileName) : '';
}

function parsePresentationPreviewManifest(raw: unknown): { presentations?: unknown[] } {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as { presentations?: unknown[] };

  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    return parsed && typeof parsed === 'object' ? parsed as { presentations?: unknown[] } : {};
  } catch {
    return {};
  }
}

function mapPresentationPreviews(pb: ReturnType<typeof getPocketBase>, record: RecordModel): PresentationPreview[] {
  const manifest = parsePresentationPreviewManifest(record['presentationPreviewManifest']);
  const presentations = Array.isArray(manifest.presentations) ? manifest.presentations : [];

  return presentations.map((item): PresentationPreview | null => {
    if (!item || typeof item !== 'object') return null;
    const value = item as Record<string, unknown>;
    const sourceFileName = typeof value.sourceFileName === 'string' ? value.sourceFileName : '';
    if (!sourceFileName) return null;

    const previewFiles = Array.isArray(value.previewFiles)
      ? value.previewFiles.filter((fileName): fileName is string => typeof fileName === 'string' && fileName.length > 0)
      : [];

    return {
      sourceFileName,
      sourceUrl: getRecordFileUrl(pb, record, sourceFileName),
      title: typeof value.title === 'string' ? value.title : undefined,
      status: value.status === 'failed' ? 'failed' : 'ready',
      slideCount: typeof value.slideCount === 'number' ? value.slideCount : previewFiles.length,
      previewFiles,
      previewUrls: previewFiles.map((fileName) => getRecordFileUrl(pb, record, fileName)),
      error: typeof value.error === 'string' ? value.error : undefined,
      createdAt: typeof value.createdAt === 'string' ? value.createdAt : undefined,
    };
  }).filter((preview): preview is PresentationPreview => preview !== null);
}

function isClientResponseError(error: unknown): error is { status?: number; response?: { data?: Record<string, unknown> } } {
  return Boolean(error && typeof error === 'object');
}

function buildNewsletterCorePayload(data: NewsletterFormData) {
  return {
    title: data.title,
    subtitle: data.subtitle,
    content: data.content,
    excerpt: extractExcerpt(data.content),
    author: data.author,
    readTime: calculateReadTime(data.content),
    coverImage: data.coverImage,
    textAlignment: inferNewsletterTextAlignment(data.content),
    tags: data.tags,
    status: data.status,
    poll: data.poll ?? null,
    event: data.event ? eventWithUtcDates(data.event) : null,
    ...(data.publishedAt ? { publishedAt: data.publishedAt } : {}),
  };
}

function buildNewsletterCreatePayload(
  data: NewsletterFormData,
  extra: { createdById?: string; authorAvatar?: string },
) {
  const core = buildNewsletterCorePayload(data);

  return {
    ...core,
    publishedAt: new Date().toISOString().split('T')[0],
    createdById: extra.createdById ?? '',
    authorAvatar: extra.authorAvatar ?? '',
    likes: 0,
    comments: 0,
    shares: 0,
    likedByUserIds: [],
    bookmarkedByUserIds: [],
    commentItems: [],
  };
}

function stripUnsupportedNewsletterFields(payload: Record<string, unknown>) {
  const nextPayload = { ...payload };
  delete nextPayload.authorAvatar;
  delete nextPayload.createdById;
  delete nextPayload.likedByUserIds;
  delete nextPayload.bookmarkedByUserIds;
  delete nextPayload.commentItems;
  delete nextPayload.publishedAt;
  delete nextPayload.likes;
  delete nextPayload.comments;
  delete nextPayload.shares;
  delete nextPayload.textAlignment;
  delete nextPayload.poll;
  delete nextPayload.event;
  return nextPayload;
}

function getPocketBaseErrorMessage(error: unknown): string {
  if (!isClientResponseError(error)) {
    return error instanceof Error ? error.message : 'PocketBase request failed';
  }

  const fields = error.response?.data;
  if (!fields || Object.keys(fields).length === 0) {
    return error instanceof Error ? error.message : 'PocketBase request failed';
  }

  const details = Object.entries(fields)
    .map(([key, value]) => {
      if (value && typeof value === 'object' && 'message' in value) {
        return `${key}: ${String((value as { message?: unknown }).message ?? '')}`;
      }
      return `${key}: ${String(value)}`;
    })
    .join(', ');

  return details || (error instanceof Error ? error.message : 'PocketBase request failed');
}

export function mapPBRecordToNewsletter(record: RecordModel): Newsletter {
  const pb = getPocketBase();
  const content = typeof record['content'] === 'string' ? record['content'] : '';
  const commentItems = normalizeComments(record['commentItems']);
  const presentationFiles = Array.isArray(record['presentationFiles'])
    ? (record['presentationFiles'] as string[]).map((fileName) => getRecordFileUrl(pb, record, fileName))
    : [];
  const presentationPreviews = mapPresentationPreviews(pb, record);
  return {
    id: record.id,
    title: typeof record['title'] === 'string' ? record['title'] : '',
    subtitle: typeof record['subtitle'] === 'string' ? record['subtitle'] : '',
    content,
    contentLoaded: record['contentLoaded'] !== false,
    searchText: typeof record['searchText'] === 'string' ? record['searchText'] : undefined,
    updatedAt: record.updated,
    excerpt: record['contentLoaded'] === false ? String(record['excerpt'] || '') : extractExcerpt(content),
    author: typeof record['author'] === 'string' ? record['author'] : '',
    authorAvatar: typeof record['authorAvatar'] === 'string' ? record['authorAvatar'] : undefined,
    createdById: typeof record['createdById'] === 'string' ? record['createdById'] : undefined,
    publishedAt: typeof record['publishedAt'] === 'string' && record['publishedAt'] ? record['publishedAt'] : record.created.slice(0, 10),
    readTime: record['contentLoaded'] === false ? String(record['readTime'] || '1 min read') : calculateReadTime(content),
    coverImage: typeof record['coverImage'] === 'string' ? record['coverImage'] : '',
    textAlignment: normalizeNewsletterTextAlignment(record['textAlignment']) ?? inferNewsletterTextAlignment(content),
    likes: typeof record['likes'] === 'number' ? record['likes'] : 0,
    comments: typeof record['comments'] === 'number' ? record['comments'] : commentItems.length,
    shares: typeof record['shares'] === 'number' ? record['shares'] : 0,
    tags: Array.isArray(record['tags']) ? (record['tags'] as string[]) : [],
    status: record['status'] === 'draft' ? 'draft' : 'published',
    presentationFiles,
    presentationPreviews,
    likedByUserIds: Array.isArray(record['likedByUserIds']) ? (record['likedByUserIds'] as string[]) : [],
    bookmarkedByUserIds: Array.isArray(record['bookmarkedByUserIds']) ? (record['bookmarkedByUserIds'] as string[]) : [],
    commentItems,
    poll: normalizePoll(record['poll']),
    event: normalizeEvent(record['event']),
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

const LIST_KEY = 'newsletters:summary';
const SESSION_KEY = 'newsletter:public-feed:v1:';

export function getCachedNewsletters(): Newsletter[] | undefined {
  const cached = peekRead<Newsletter[]>(LIST_KEY, 300_000);
  if (cached) return cached;
  if (!readScope().endsWith('|anonymous|')) return undefined;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY + readScope());
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as { at: number; items: Newsletter[] };
    if (Date.now() - entry.at > 300_000 || !Array.isArray(entry.items)) return undefined;
    readCache.prime(readScope() + LIST_KEY, entry.items);
    return entry.items;
  } catch { return undefined; }
}

export function rememberNewsletters(items: Newsletter[]): void {
  if (peekRead<Newsletter[]>(LIST_KEY, 300_000) === items) return;
  readCache.set(readScope() + LIST_KEY, items);
  if (!readScope().endsWith('|anonymous|')) return;
  try {
    // Bodies and base64 images belong in their individual requests, never in
    // synchronous storage on the critical refresh path.
    const summaries = items.map((item) => ({ ...item, content: '', contentLoaded: false,
      searchText: item.searchText ?? item.content.replace(/<img\b[^>]*>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim(),
      coverImage: /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,/i.test(item.coverImage) ? `/api/newsletters/${encodeURIComponent(item.id)}/cover?v=${encodeURIComponent(item.updatedAt || '')}` : item.coverImage,
      commentItems: [], presentationFiles: [], presentationPreviews: [],
    }));
    const encoded = JSON.stringify({ at: Date.now(), items: summaries });
    if (encoded.length < 500_000) sessionStorage.setItem(SESSION_KEY + readScope(), encoded);
  } catch { /* Storage is optional, including in private browsing. */ }
}

export async function fetchNewsletters({ summary = false, force = false } = {}): Promise<Newsletter[]> {
  return cachedRead(summary ? LIST_KEY : 'newsletters:full', async () => {
    const pb = getPocketBase();
    const path = `/api/newsletters?sort=-created&perPage=100${summary ? '&view=summary' : ''}`;
    const first = await pb.send<ApiListResponse<RecordModel>>(path, { method: 'GET', requestKey: null });
    const pages = await Promise.all(Array.from({ length: Math.max(0, (first.totalPages ?? 1) - 1) }, (_, index) =>
      pb.send<ApiListResponse<RecordModel>>(`${path}&page=${index + 2}`, { method: 'GET', requestKey: null })));
    return [first, ...pages].flatMap((page) => (page.items ?? []).map(mapPBRecordToNewsletter));
  }, { force });
}

export function getCachedNewsletter(id: string): Newsletter | undefined {
  return peekRead<Newsletter>(`newsletter:${id}`);
}

export function getStoredNewsletter(id: string): Promise<Newsletter | undefined> {
  return readScope().endsWith('|anonymous|') ? readStoredArticle(readScope() + id) : Promise.resolve(undefined);
}

export function fetchNewsletter(id: string, force = false): Promise<Newsletter> {
  return cachedRead(`newsletter:${id}`, async () => {
    const scope = readScope();
    try {
      const record = await getPocketBase().send<RecordModel>(`/api/newsletters/${encodeURIComponent(id)}`, { method: 'GET', requestKey: null });
      const newsletter = mapPBRecordToNewsletter(record);
      if (scope.endsWith('|anonymous|')) void storePublicArticle(scope + id, newsletter);
      return newsletter;
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error && [401, 403, 404].includes(Number(error.status))) {
        readCache.invalidate(scope + `newsletter:${id}`);
        void forgetStoredArticle(scope + id);
      }
      throw error;
    }
  }, { force });
}

export function prefetchNewsletter(id: string): void {
  void fetchNewsletter(id).catch(() => { /* Navigation displays a failed read. */ });
}

export function invalidateNewsletterReads(): void {
  invalidateReads();
  try { sessionStorage.removeItem(SESSION_KEY + readScope()); } catch { /* Optional storage. */ }
}

function rememberMutatedNewsletter(record: RecordModel, scope: string): Newsletter {
  invalidateNewsletterReads();
  const newsletter = mapPBRecordToNewsletter(record);
  if (scope === readScope()) readCache.set(scope + `newsletter:${newsletter.id}`, newsletter);
  return newsletter;
}

export async function createNewsletter(
  data: NewsletterFormData,
  extra: { createdById?: string; authorAvatar?: string } = {},
): Promise<Newsletter> {
  const scope = readScope();
  const pb = getPocketBase();
  const payload = buildNewsletterCreatePayload(data, extra);

  try {
    const record = await pb.send<RecordModel>('/api/newsletters', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      requestKey: null,
    });
    return rememberMutatedNewsletter(record, scope);
  } catch (error) {
    if (!isClientResponseError(error) || error.status !== 400) {
      throw error;
    }

    const fallbackPayload = stripUnsupportedNewsletterFields(payload);
    try {
      const record = await pb.send<RecordModel>('/api/newsletters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fallbackPayload),
        requestKey: null,
      });
      return rememberMutatedNewsletter(record, scope);
    } catch (fallbackError) {
      const message = getPocketBaseErrorMessage(fallbackError);
      throw new Error(message);
    }
  }
}

export async function patchNewsletter(
  id: string,
  data: Partial<Newsletter>,
): Promise<Newsletter> {
  const scope = readScope();
  const pb = getPocketBase();
  // Recompute derived fields if content changed
  const patch: Record<string, unknown> = { ...data };
  if (data.event) patch.event = eventWithUtcDates(data.event);
  if (typeof data.content === 'string') {
    patch.excerpt = extractExcerpt(data.content);
    patch.readTime = calculateReadTime(data.content);
  }

  try {
    const record = await pb.send<RecordModel>(`/api/newsletters/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patch),
      requestKey: null,
    });
    return rememberMutatedNewsletter(record, scope);
  } catch (error) {
    if (!isClientResponseError(error) || error.status !== 400) {
      throw error;
    }

    const fallbackPatch = stripUnsupportedNewsletterFields(patch);
    try {
      const record = await pb.send<RecordModel>(`/api/newsletters/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fallbackPatch),
        requestKey: null,
      });
      return rememberMutatedNewsletter(record, scope);
    } catch (fallbackError) {
      const message = getPocketBaseErrorMessage(fallbackError);
      throw new Error(message);
    }
  }
}

export async function removeNewsletter(id: string): Promise<void> {
  invalidateNewsletterReads();
  const pb = getPocketBase();
  await pb.send(`/api/newsletters/${id}`, {
    method: 'DELETE',
    requestKey: null,
  });
  invalidateNewsletterReads();
}

export async function makeNewsletterPublic(id: string): Promise<Newsletter> {
  const scope = readScope();
  const pb = getPocketBase();
  const record = await pb.send<RecordModel>(`/api/newsletters/${id}/make-public`, {
    method: 'POST',
    requestKey: null,
  });
  return rememberMutatedNewsletter(record, scope);
}

export async function makeNewsletterDraft(id: string): Promise<Newsletter> {
  const scope = readScope();
  const pb = getPocketBase();
  const record = await pb.send<RecordModel>(`/api/newsletters/${id}/make-draft`, {
    method: 'POST',
    requestKey: null,
  });
  return rememberMutatedNewsletter(record, scope);
}

export async function sendNewsletterUpdateEmail(id: string): Promise<number> {
  const pb = getPocketBase();
  const result = await pb.send<NewsletterUpdateEmailResponse>('/api/newsletter/send-update', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      newsletterId: id,
    }),
  });

  return typeof result?.recipientCount === 'number' ? result.recipientCount : 0;
}

export async function uploadNewsletterPresentation(
  id: string,
  file: File,
): Promise<{ newsletter: Newsletter; url: string; fileName: string; previewUrls: string[]; previewStatus: 'ready' | 'failed'; previewError?: string }> {
  const scope = readScope();
  const pb = getPocketBase();
  const payload = new FormData();
  payload.append('newsletterId', id);
  payload.append('presentationFile', file);

  const upload = await pb.send<{
    status?: 'ready' | 'failed';
    fileName?: string;
    error?: string;
  }>('/api/newsletter/presentation-upload', {
    method: 'POST',
    body: payload,
    requestKey: null,
  });
  const record = await pb.collection(NEWSLETTERS_COLLECTION).getOne(id, { requestKey: null });
  const fileName = upload.fileName;

  if (!fileName) {
    throw new Error('Uploaded presentation file was not returned by PocketBase');
  }

  const newsletter = rememberMutatedNewsletter(record, scope);
  const preview = newsletter.presentationPreviews?.find((item) => item.sourceFileName === fileName);

  return {
    newsletter,
    url: getRecordFileUrl(pb, record, fileName),
    fileName,
    previewUrls: preview?.previewUrls ?? [],
    previewStatus: upload.status === 'failed' ? 'failed' : 'ready',
    previewError: upload.error,
  };
}
