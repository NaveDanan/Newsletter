import type { Locale } from '@/locales/messages';
import { getPocketBase } from './client';

interface SubscribeToNewsletterInput {
  email: string;
  locale: Locale;
  source?: string;
}

interface NewsletterStatsResponse {
  activeSubscribers?: number;
  publishedNewsletters?: number;
}

export async function subscribeToNewsletter({ email, locale, source = 'sidebar' }: SubscribeToNewsletterInput): Promise<void> {
  const pb = getPocketBase();

  await pb.send('/api/newsletter/subscribe', {
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
}

export async function fetchActiveSubscriberCount(): Promise<number> {
  const pb = getPocketBase();
  const result = await pb.send<NewsletterStatsResponse>('/api/newsletter/stats', {
    method: 'GET',
  });

  return typeof result?.activeSubscribers === 'number' ? result.activeSubscribers : 0;
}