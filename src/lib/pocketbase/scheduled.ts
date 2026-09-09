import { getPocketBase } from './client';

export interface ScheduledNewsletterPreview {
  id: string;
  title: string;
  subtitle: string;
  publishedAt: string;
  readTime: string;
}

export interface ScheduledJobResult {
  status?: string;
  reason?: string;
  recipientCount?: number;
  sentCount?: number;
  newsletterCount?: number;
  newsletterIds?: string[];
  pendingNewsletterCount?: number;
  subscriberCount?: number;
  message?: string;
}

export interface NewsletterDigestSchedule {
  key: string;
  enabled: boolean;
  intervalMinutes: number;
  maxNewsletters: number;
  lastRunAt: string;
  lastSuccessAt: string;
  lastError: string;
  lastResult: ScheduledJobResult;
  updatedBy: string;
  pendingNewsletters: ScheduledNewsletterPreview[];
  scheduledNewsletters: ScheduledNewsletterPreview[];
  pendingNewsletterCount: number;
  scheduledNewsletterCount: number;
  activeSubscriberCount: number;
  syncedRegisteredUsers: number;
}

export interface NewsletterDigestSchedulePatch {
  enabled?: boolean;
  intervalMinutes?: number;
  maxNewsletters?: number;
}

export async function fetchNewsletterDigestSchedule(): Promise<NewsletterDigestSchedule> {
  const pb = getPocketBase();
  return pb.send<NewsletterDigestSchedule>('/api/scheduled/newsletter-digest', {
    method: 'GET',
    requestKey: null,
  });
}

export async function updateNewsletterDigestSchedule(
  patch: NewsletterDigestSchedulePatch,
): Promise<NewsletterDigestSchedule> {
  const pb = getPocketBase();
  return pb.send<NewsletterDigestSchedule>('/api/scheduled/newsletter-digest', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
    requestKey: null,
  });
}

export async function runNewsletterDigestNow(): Promise<NewsletterDigestSchedule> {
  const pb = getPocketBase();
  return pb.send<NewsletterDigestSchedule>('/api/scheduled/newsletter-digest/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
    requestKey: null,
  });
}

export interface NewsletterImportSchedule {
  enabled: boolean;
  repositoryUrl: string;
  username: string;
  hasToken: boolean;
  intervalMinutes: number;
  isRunning: boolean;
  lastRunAt: string;
  lastSuccessAt: string;
  lastError: string;
  lastResult: {
    status?: 'ok' | 'partial' | 'error' | 'running';
    importedFiles?: number;
    articleCount?: number;
    skipped?: number;
    deferred?: number;
    errors?: { file: string; message: string }[];
  };
}

export interface NewsletterImportPatch {
  enabled?: boolean;
  repositoryUrl?: string;
  username?: string;
  token?: string;
  clearToken?: boolean;
  intervalMinutes?: number;
}

export function fetchNewsletterImportSchedule(): Promise<NewsletterImportSchedule> {
  return getPocketBase().send('/api/scheduled/newsletter-import', { method: 'GET', requestKey: null });
}

export function updateNewsletterImportSchedule(patch: NewsletterImportPatch): Promise<NewsletterImportSchedule> {
  return getPocketBase().send('/api/scheduled/newsletter-import', { method: 'PATCH', body: patch, requestKey: null });
}

export function runNewsletterImportNow(): Promise<NewsletterImportSchedule> {
  return getPocketBase().send('/api/scheduled/newsletter-import/run', { method: 'POST', body: {}, requestKey: null });
}

export interface TrackedNewsletterFile {
  id: string;
  sourceUrl: string;
  checksum: string;
  importedAt: string;
  newsletterIds: string[];
}

export interface TrackedNewsletterFilesPage {
  items: TrackedNewsletterFile[];
  page: number;
  hasMore: boolean;
}

export function fetchTrackedNewsletterFiles(page = 1): Promise<TrackedNewsletterFilesPage> {
  return getPocketBase().send('/api/scheduled/newsletter-import/files', { method: 'GET', query: { page }, requestKey: null });
}

export function updateTrackedNewsletterFile(id: string, patch: Pick<TrackedNewsletterFile, 'sourceUrl' | 'checksum'>): Promise<TrackedNewsletterFile> {
  return getPocketBase().send(`/api/scheduled/newsletter-import/files/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch, requestKey: null });
}

export function removeTrackedNewsletterFile(id: string): Promise<{ removed: boolean }> {
  return getPocketBase().send(`/api/scheduled/newsletter-import/files/${encodeURIComponent(id)}`, { method: 'DELETE', requestKey: null });
}
