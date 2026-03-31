import type { RecordModel } from 'pocketbase';
import { getPocketBase } from './client';
import { extractExcerpt, calculateReadTime } from '../newsletters';
import type { Newsletter, NewsletterComment, NewsletterFormData } from '../../types/newsletter';

export const NEWSLETTERS_COLLECTION = 'newsletters';

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

export function mapPBRecordToNewsletter(record: RecordModel): Newsletter {
  const content = typeof record['content'] === 'string' ? record['content'] : '';
  const commentItems = normalizeComments(record['commentItems']);
  return {
    id: record.id,
    title: typeof record['title'] === 'string' ? record['title'] : '',
    subtitle: typeof record['subtitle'] === 'string' ? record['subtitle'] : '',
    content,
    excerpt: extractExcerpt(content),
    author: typeof record['author'] === 'string' ? record['author'] : '',
    authorAvatar: typeof record['authorAvatar'] === 'string' ? record['authorAvatar'] : undefined,
    createdById: typeof record['createdById'] === 'string' ? record['createdById'] : undefined,
    publishedAt: typeof record['publishedAt'] === 'string' ? record['publishedAt'] : record.created.slice(0, 10),
    readTime: calculateReadTime(content),
    coverImage: typeof record['coverImage'] === 'string' ? record['coverImage'] : '',
    likes: typeof record['likes'] === 'number' ? record['likes'] : 0,
    comments: typeof record['comments'] === 'number' ? record['comments'] : commentItems.length,
    shares: typeof record['shares'] === 'number' ? record['shares'] : 0,
    tags: Array.isArray(record['tags']) ? (record['tags'] as string[]) : [],
    status: record['status'] === 'draft' ? 'draft' : 'published',
    likedByUserIds: Array.isArray(record['likedByUserIds']) ? (record['likedByUserIds'] as string[]) : [],
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
  const record = await pb.collection(NEWSLETTERS_COLLECTION).create({
    ...data,
    excerpt: extractExcerpt(data.content),
    readTime: calculateReadTime(data.content),
    publishedAt: new Date().toISOString().split('T')[0],
    createdById: extra.createdById ?? '',
    authorAvatar: extra.authorAvatar ?? '',
    likes: 0,
    comments: 0,
    shares: 0,
    likedByUserIds: [],
    commentItems: [],
  });
  return mapPBRecordToNewsletter(record);
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
  const record = await pb.collection(NEWSLETTERS_COLLECTION).update(id, patch);
  return mapPBRecordToNewsletter(record);
}

export async function removeNewsletter(id: string): Promise<void> {
  const pb = getPocketBase();
  await pb.collection(NEWSLETTERS_COLLECTION).delete(id);
}
