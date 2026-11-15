import type { RecordModel } from 'pocketbase';
import type { Newsletter } from '@/types/newsletter';
import { getPocketBase } from './client';
import { mapPBRecordToNewsletter } from './newsletters';
import { cachedRead, peekRead, readCache, readScope } from './read-cache';

export const NEWSLETTER_BATCH_SIZE = 10;
export type NewsletterFeedTab = 'latest' | 'top' | 'discussions' | 'bookmarks';
export interface NewsletterFeedQuery { search?: string; tab?: NewsletterFeedTab }
export interface NewsletterFeedPage {
  items: Newsletter[];
  nextPage: number;
  hasMore: boolean;
  totalItems: number;
}

export function normalizeNewsletterSearch(search = ''): string {
  return search.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

export function newsletterFeedKey({ search, tab = 'latest' }: NewsletterFeedQuery = {}): string {
  return `newsletters:feed:${JSON.stringify([tab, normalizeNewsletterSearch(search)])}`;
}

export function fetchNewsletterPage(query: NewsletterFeedQuery = {}, page = 1, force = false): Promise<NewsletterFeedPage> {
  const params = new URLSearchParams({ view: 'summary', compact: '1', status: 'published', feed: query.tab ?? 'latest', perPage: String(NEWSLETTER_BATCH_SIZE), page: String(page) });
  const search = normalizeNewsletterSearch(query.search);
  if (search) params.set('q', search);
  return cachedRead(`${newsletterFeedKey(query)}:page:${page}`, async () => {
    const response = await getPocketBase().send<{ items: RecordModel[]; totalPages: number; totalItems: number }>(`/api/newsletters?${params}`, { method: 'GET', requestKey: null });
    return { items: response.items.map(mapPBRecordToNewsletter), nextPage: page + 1, hasMore: page < response.totalPages && response.items.length > 0, totalItems: response.totalItems };
  }, { force });
}

const SESSION_KEY = 'newsletter:public-feed:v2:';
function canPersist(query: NewsletterFeedQuery): boolean {
  return readScope().endsWith('|anonymous|') && !normalizeNewsletterSearch(query.search) && (!query.tab || query.tab === 'latest');
}

export function getCachedNewsletterFeed(query: NewsletterFeedQuery = {}): NewsletterFeedPage | undefined {
  const key = newsletterFeedKey(query);
  const cached = peekRead<NewsletterFeedPage>(key, 300_000);
  if (cached || !canPersist(query)) return cached;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY + readScope());
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as { at: number; page: NewsletterFeedPage };
    if (Date.now() - entry.at > 300_000 || !Array.isArray(entry.page?.items) || entry.page.items.length > NEWSLETTER_BATCH_SIZE || entry.page.nextPage !== 2 || typeof entry.page.hasMore !== 'boolean' || !Number.isFinite(entry.page.totalItems)) return undefined;
    readCache.prime(readScope() + key, entry.page);
    return entry.page;
  } catch { return undefined; }
}

export function rememberNewsletterFeed(query: NewsletterFeedQuery, page: NewsletterFeedPage): void {
  readCache.set(readScope() + newsletterFeedKey(query), page);
  if (!canPersist(query)) return;
  try {
    // Refresh paints only the first batch from storage. Longer browsing sessions
    // stay in memory; no article bodies or inline images block startup.
    const items = page.items.slice(0, NEWSLETTER_BATCH_SIZE).map(item => ({ ...item, content: '', contentLoaded: false, searchText: undefined, commentItems: [], presentationFiles: [], presentationPreviews: [] }));
    const firstPage = { items, nextPage: 2, hasMore: page.hasMore || page.items.length > NEWSLETTER_BATCH_SIZE, totalItems: page.totalItems };
    const encoded = JSON.stringify({ at: Date.now(), page: firstPage });
    if (encoded.length < 100_000) sessionStorage.setItem(SESSION_KEY + readScope(), encoded);
  } catch { /* The feed works without browser storage. */ }
}
