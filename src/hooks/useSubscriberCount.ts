import { useCallback, useEffect, useState } from 'react';
import { fetchNewsletterStats, getCachedNewsletterStats, type NewsletterStats } from '@/lib/pocketbase/subscribers';
import { readScope } from '@/lib/pocketbase/read-cache';

export function useSubscriberCount() {
  const scope = readScope();
  const [stats, setStats] = useState<NewsletterStats | undefined>(() => getCachedNewsletterStats());
  const [lastScope, setLastScope] = useState(scope);
  if (lastScope !== scope) { setLastScope(scope); setStats(getCachedNewsletterStats()); }

  const refreshSubscriberCount = useCallback(async (): Promise<number> => {
    try {
      const next = await fetchNewsletterStats({ force: true });
      if (scope === readScope()) setStats(next);
      return next.activeSubscribers;
    } catch (error) {
      console.error('Failed to load subscriber count:', error);
      return 0;
    }
  }, [scope]);

  useEffect(() => {
    let cancelled = false;
    void fetchNewsletterStats({ force: true }).then(next => {
      if (!cancelled && scope === readScope()) setStats(next);
    }).catch(error => {
      console.error('Failed to load subscriber count:', error);
      if (!cancelled && scope === readScope()) setStats(current => current ?? { activeSubscribers: 0, publishedNewsletters: 0 });
    });
    return () => { cancelled = true; };
  }, [scope]);

  return { subscriberCount: stats?.activeSubscribers ?? null, publishedNewsletterCount: stats?.publishedNewsletters ?? null, refreshSubscriberCount };
}
