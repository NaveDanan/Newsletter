import { useCallback, useEffect, useState } from 'react';
import {
  createNavigationLink as createPocketBaseNavigationLink,
  deleteNavigationLink as deletePocketBaseNavigationLink,
  fetchNavigationLinks as fetchPocketBaseNavigationLinks,
  updateNavigationLink as updatePocketBaseNavigationLink,
} from '@/lib/pocketbase/navigation-links';
import {
  createNavigationLinkRecord,
  readStoredNavigationLinks,
  writeStoredNavigationLinks,
} from '@/lib/navigation-links';
import type { NavigationLink, NavigationLinkFormData } from '@/types/navigation-link';

export type NavigationLinksStorageMode = 'pocketbase' | 'local';

export function useNavigationLinks() {
  const [links, setLinks] = useState<NavigationLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storageMode, setStorageMode] = useState<NavigationLinksStorageMode>('pocketbase');

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    fetchPocketBaseNavigationLinks()
      .then((data) => {
        if (cancelled) {
          return;
        }

        setLinks(data);
        setStorageMode('pocketbase');
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }

        const message = err instanceof Error ? err.message : 'Failed to load navigation links';
        setLinks(readStoredNavigationLinks());
        setStorageMode('local');
        setError(message);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const persistLocalLinks = useCallback((updater: (previous: NavigationLink[]) => NavigationLink[]) => {
    let nextValue: NavigationLink[] = [];

    setLinks((previous) => {
      nextValue = updater(previous);
      writeStoredNavigationLinks(nextValue);
      return nextValue;
    });

    setStorageMode('local');
    setError(null);

    return nextValue;
  }, []);

  const addLink = useCallback(async (data: NavigationLinkFormData): Promise<NavigationLink | null> => {
    if (storageMode === 'pocketbase') {
      try {
        const created = await createPocketBaseNavigationLink(data);
        setLinks((previous) => [...previous, created]);
        setError(null);
        return created;
      } catch {
        // Fall through to local persistence.
      }
    }

    const created = createNavigationLinkRecord(data);
    persistLocalLinks((previous) => [...previous, created]);
    return created;
  }, [persistLocalLinks, storageMode]);

  const updateLink = useCallback(async (id: string, data: NavigationLinkFormData): Promise<NavigationLink | null> => {
    if (storageMode === 'pocketbase') {
      try {
        const updated = await updatePocketBaseNavigationLink(id, data);
        setLinks((previous) => previous.map((entry) => (entry.id === id ? updated : entry)));
        setError(null);
        return updated;
      } catch {
        // Fall through to local persistence.
      }
    }

    const updated = createNavigationLinkRecord(data, {
      id,
      created: links.find((entry) => entry.id === id)?.created,
    });

    persistLocalLinks((previous) => previous.map((entry) => (entry.id === id ? updated : entry)));
    return updated;
  }, [links, persistLocalLinks, storageMode]);

  const deleteLink = useCallback(async (id: string): Promise<boolean> => {
    if (storageMode === 'pocketbase') {
      try {
        await deletePocketBaseNavigationLink(id);
        setLinks((previous) => previous.filter((entry) => entry.id !== id));
        setError(null);
        return true;
      } catch {
        // Fall through to local persistence.
      }
    }

    persistLocalLinks((previous) => previous.filter((entry) => entry.id !== id));
    return true;
  }, [persistLocalLinks, storageMode]);

  return {
    links,
    isLoading,
    error,
    storageMode,
    addLink,
    updateLink,
    deleteLink,
  };
}