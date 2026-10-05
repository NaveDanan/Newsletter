import { useEffect, useState } from 'react';
import { fetchFeaturedWriters } from '@/lib/pocketbase/writers';
import type { SiteWriter } from '@/types/writer';

/** The admin-curated homepage writers. Empty while loading or on failure. */
export function useSiteWriters() {
  const [writers, setWriters] = useState<SiteWriter[]>([]);

  useEffect(() => {
    let cancelled = false;

    fetchFeaturedWriters()
      .then((next) => {
        if (!cancelled) {
          setWriters(next);
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to load featured writers:', error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { writers };
}
