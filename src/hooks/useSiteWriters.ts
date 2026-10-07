import { readScope } from '@/lib/pocketbase/read-cache';
import { useEffect, useState } from 'react';
import { fetchFeaturedWriters, getCachedFeaturedWriters } from '@/lib/pocketbase/writers';
import type { SiteWriter } from '@/types/writer';

/** The admin-curated homepage writers. Empty while loading or on failure. */
export function useSiteWriters() {
  const scope = readScope();
  const [writers, setWriters] = useState<SiteWriter[]>(() => getCachedFeaturedWriters() ?? []);

  const [lastScope, setLastScope] = useState(scope);
  if (lastScope !== scope) { setLastScope(scope); setWriters(getCachedFeaturedWriters() ?? []); }

  useEffect(() => {
    let cancelled = false;

    fetchFeaturedWriters()
      .then((next) => {
        if (!cancelled && scope === readScope()) {
          setWriters(next);
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to load featured writers:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [scope]);

  return { writers };
}
