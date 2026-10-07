import type { Locale } from '@/locales/messages';
import { getPocketBase } from './client';
import { cachedRead, peekRead, readCache, readScope } from './read-cache';

const STATS_KEY = '/api/newsletter/stats';
export interface NewsletterStats { activeSubscribers: number; publishedNewsletters: number }
export function getCachedNewsletterStats(): NewsletterStats | undefined { return peekRead(STATS_KEY, 300_000); }
function invalidateStats(scope: string) { readCache.invalidate(scope + STATS_KEY); }

interface SubscribeToNewsletterInput {
  email: string;
  locale: Locale;
  source?: string;
}

interface NewsletterStatsResponse {
  activeSubscribers?: number;
  publishedNewsletters?: number;
}

interface SubscribeToNewsletterResponse {
  status?: 'subscribed' | 'already_subscribed';
}

interface UnsubscribeFromNewsletterInput {
  subscriberId: string;
  email?: string;
}

interface UnsubscribeFromNewsletterResponse {
  status?: 'unsubscribed' | 'already_unsubscribed';
}

function isClientResponseError(error: unknown): error is { response?: { message?: unknown } } {
  return Boolean(error && typeof error === 'object');
}

export async function subscribeToNewsletter({ email, locale, source = 'sidebar' }: SubscribeToNewsletterInput): Promise<'subscribed' | 'already_subscribed'> {
  const pb = getPocketBase();

  const scope = readScope();
  invalidateStats(scope);
  try {
    const result = await pb.send<SubscribeToNewsletterResponse>('/api/newsletter/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        locale,
        source,
      }),
    });

    return result?.status === 'already_subscribed' ? 'already_subscribed' : 'subscribed';
  } catch (error) {
    if (isClientResponseError(error) && typeof error.response?.message === 'string' && error.response.message.trim()) {
      throw new Error(error.response.message);
    }

    throw error;
  } finally { invalidateStats(scope); }
}

export async function unsubscribeFromNewsletter({ subscriberId, email }: UnsubscribeFromNewsletterInput): Promise<'unsubscribed' | 'already_unsubscribed'> {
  const pb = getPocketBase();

  const scope = readScope();
  invalidateStats(scope);
  try {
    const result = await pb.send<UnsubscribeFromNewsletterResponse>('/api/newsletter/unsubscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subscriberId,
        email,
      }),
    });

    return result?.status === 'already_unsubscribed' ? 'already_unsubscribed' : 'unsubscribed';
  } catch (error) {
    if (isClientResponseError(error) && typeof error.response?.message === 'string' && error.response.message.trim()) {
      throw new Error(error.response.message);
    }

    throw error;
  } finally { invalidateStats(scope); }
}

export function fetchNewsletterStats({ force = false } = {}): Promise<NewsletterStats> {
  return cachedRead(STATS_KEY, async () => {
    const result = await getPocketBase().send<NewsletterStatsResponse>(STATS_KEY, { method: 'GET', requestKey: null });
    return {
      activeSubscribers: typeof result?.activeSubscribers === 'number' ? result.activeSubscribers : 0,
      publishedNewsletters: typeof result?.publishedNewsletters === 'number' ? result.publishedNewsletters : 0,
    };
  }, { force });
}

export async function fetchActiveSubscriberCount(): Promise<number> {
  return (await fetchNewsletterStats()).activeSubscribers;
}
