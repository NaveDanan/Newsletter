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
