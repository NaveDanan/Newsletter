import { useCallback, useEffect, useState } from 'react';
import { fetchActiveSubscriberCount } from '@/lib/pocketbase/subscribers';

export function useSubscriberCount() {
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);

  const refreshSubscriberCount = useCallback(async (): Promise<number> => {
    try {
      const count = await fetchActiveSubscriberCount();
      setSubscriberCount(count);
      return count;
    } catch (error) {
      console.error('Failed to load subscriber count:', error);
      setSubscriberCount(0);
      return 0;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadSubscriberCount = async () => {
      try {
        const count = await fetchActiveSubscriberCount();
        if (!cancelled) {
          setSubscriberCount(count);
        }
      } catch (error) {
        console.error('Failed to load subscriber count:', error);
        if (!cancelled) {
          setSubscriberCount(0);
        }
      }
    };

    void loadSubscriberCount();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    subscriberCount,
    refreshSubscriberCount,
  };
}