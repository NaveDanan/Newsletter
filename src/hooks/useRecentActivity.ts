import { useEffect, useState } from 'react';
import { fetchRecentActivity } from '@/lib/pocketbase/activity';
import type { ActivityItem } from '@/types/activity';

export function useRecentActivity(limit: number) {
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchRecentActivity(limit)
      .then((next) => {
        if (!cancelled) {
          setActivity(next);
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to load recent activity:', error);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [limit]);

  return { activity, isLoading };
}
