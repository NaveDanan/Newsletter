import type { Locale } from '@/locales/messages';
import { getPocketBase } from './client';

interface SubscribeToNewsletterInput {
  email: string;
  locale: Locale;
  source?: string;
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