import type { RecordModel } from 'pocketbase';
import { getPocketBase } from './client';
import { extractExcerpt, calculateReadTime } from '../newsletters';
import { inferNewsletterTextAlignment, normalizeNewsletterTextAlignment } from '../newsletter-alignment';
import type { Newsletter, NewsletterComment, NewsletterFormData, PresentationPreview } from '../../types/newsletter';

export const NEWSLETTERS_COLLECTION = 'newsletters';

interface NewsletterUpdateEmailResponse {
  recipientCount?: number;
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
    excerpt: extractExcerpt(content),
    author: typeof record['author'] === 'string' ? record['author'] : '',
    authorAvatar: typeof record['authorAvatar'] === 'string' ? record['authorAvatar'] : undefined,
    createdById: typeof record['createdById'] === 'string' ? record['createdById'] : undefined,
    publishedAt: typeof record['publishedAt'] === 'string' && record['publishedAt'] ? record['publishedAt'] : record.created.slice(0, 10),
    readTime: calculateReadTime(content),
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
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function fetchNewsletters(): Promise<Newsletter[]> {
  const pb = getPocketBase();
  const records = await pb.collection(NEWSLETTERS_COLLECTION).getFullList({ sort: '-created' });
  return records.map(mapPBRecordToNewsletter);
}

export async function createNewsletter(
  data: NewsletterFormData,
  extra: { createdById?: string; authorAvatar?: string } = {},
): Promise<Newsletter> {
  const pb = getPocketBase();
  const payload = buildNewsletterCreatePayload(data, extra);

  try {
    const record = await pb.collection(NEWSLETTERS_COLLECTION).create(payload);
    return mapPBRecordToNewsletter(record);
  } catch (error) {
    if (!isClientResponseError(error) || error.status !== 400) {
      throw error;
    }

    const fallbackPayload = stripUnsupportedNewsletterFields(payload);
    try {
      const record = await pb.collection(NEWSLETTERS_COLLECTION).create(fallbackPayload);
      return mapPBRecordToNewsletter(record);
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
  const pb = getPocketBase();
  // Recompute derived fields if content changed
  const patch: Record<string, unknown> = { ...data };
  if (typeof data.content === 'string') {
    patch.excerpt = extractExcerpt(data.content);
    patch.readTime = calculateReadTime(data.content);
  }

  try {
    const record = await pb.collection(NEWSLETTERS_COLLECTION).update(id, patch);
    return mapPBRecordToNewsletter(record);
  } catch (error) {
    if (!isClientResponseError(error) || error.status !== 400) {
      throw error;
    }

    const fallbackPatch = stripUnsupportedNewsletterFields(patch);
    try {
      const record = await pb.collection(NEWSLETTERS_COLLECTION).update(id, fallbackPatch);
      return mapPBRecordToNewsletter(record);
    } catch (fallbackError) {
      const message = getPocketBaseErrorMessage(fallbackError);
      throw new Error(message);
    }
  }
}

export async function removeNewsletter(id: string): Promise<void> {
  const pb = getPocketBase();
  await pb.collection(NEWSLETTERS_COLLECTION).delete(id);
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

  const newsletter = mapPBRecordToNewsletter(record);
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
