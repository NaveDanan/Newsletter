import { readScope } from '@/lib/pocketbase/read-cache';
import { useEffect, useState } from 'react';
import { fetchRecentActivity, getCachedRecentActivity } from '@/lib/pocketbase/activity';
import type { ActivityItem } from '@/types/activity';

export function useRecentActivity(limit: number) {
  const scope = readScope();
  const [activity, setActivity] = useState<ActivityItem[]>(() => getCachedRecentActivity(limit) ?? []);
  const [isLoading, setIsLoading] = useState(() => !getCachedRecentActivity(limit));

  const [lastScope, setLastScope] = useState(scope + limit);
  if (lastScope !== scope + limit) { setLastScope(scope + limit); setActivity(getCachedRecentActivity(limit) ?? []); setIsLoading(!getCachedRecentActivity(limit)); }

  useEffect(() => {
    let cancelled = false;

    fetchRecentActivity(limit)
      .then((next) => {
        if (!cancelled && scope === readScope()) {
          setActivity(next);
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to load recent activity:', error);
      })
      .finally(() => {
        if (!cancelled && scope === readScope()) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [limit, scope]);

  return { activity, isLoading };
}
