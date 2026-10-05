import { avatarUrlFor } from '@/lib/avatar';
import { getPocketBase, normalizeUserRole } from './client';
import { resolveCommunityFileUrl } from './community';
import type { SiteWriter, WriterCandidate } from '@/types/writer';

// "Our Writers" is admin-curated, never derived from roles. The public list is
// served by /api/site/writers because the users collection is owner/admin-only;
// curation edits users.featuredWriter directly, which only an admin may change.

// Page size for loading every account into the admin curation list.
const CANDIDATE_PAGE_SIZE = 500;

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function items(value: unknown): Record<string, unknown>[] {
  const list = value && typeof value === 'object' ? (value as { items?: unknown }).items : null;
  return Array.isArray(list)
    ? list.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
}

export async function fetchFeaturedWriters(): Promise<SiteWriter[]> {
  const response: unknown = await getPocketBase().send('/api/site/writers', { method: 'GET', requestKey: null });
  return items(response)
    .map((item) => ({
      id: str(item.id),
      name: str(item.name).trim(),
      handle: str(item.handle),
      avatarUrl: resolveCommunityFileUrl(str(item.avatarUrl)),
    }))
    .filter((writer) => writer.id);
}

export async function fetchWriterCandidates(): Promise<WriterCandidate[]> {
  const pb = getPocketBase();
  const records = await pb.collection('users').getFullList({
    sort: '-featuredWriter,name',
    batch: CANDIDATE_PAGE_SIZE,
    requestKey: null,
  });

  return records.map((record) => ({
    id: record.id,
    name: str(record.name).trim(),
    email: str(record.email),
    role: normalizeUserRole(record.role),
    avatarUrl: avatarUrlFor(pb, record) ?? '',
    featured: record.featuredWriter === true,
  }));
}

export async function setWriterFeatured(userId: string, featured: boolean): Promise<void> {
  await getPocketBase().collection('users').update(userId, { featuredWriter: featured }, { requestKey: null });
}
