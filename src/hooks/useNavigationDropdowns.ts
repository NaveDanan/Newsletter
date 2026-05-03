import { useCallback, useEffect, useState } from 'react';
import {
  batchUpdateDropdownOrder as pbBatchUpdateOrder,
  createDropdown as pbCreateDropdown,
  deleteDropdown as pbDeleteDropdown,
  fetchDropdowns as pbFetchDropdowns,
  updateDropdown as pbUpdateDropdown,
} from '@/lib/pocketbase/navigation-dropdowns';
import {
  createDropdownRecord,
  readStoredDropdowns,
  writeStoredDropdowns,
} from '@/lib/navigation-dropdowns';
import type { NavigationDropdown, NavigationDropdownFormData } from '@/types/navigation-link';

export type DropdownStorageMode = 'pocketbase' | 'local';

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

export function useNavigationDropdowns() {
  const [dropdowns, setDropdowns] = useState<NavigationDropdown[]>(() => readStoredDropdowns());
  const [storageMode, setStorageMode] = useState<DropdownStorageMode>('pocketbase');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // On mount, try to load from PocketBase
  useEffect(() => {
    let cancelled = false;

    pbFetchDropdowns()
      .then((data) => {
        if (cancelled) return;
        setDropdowns(data);
        setStorageMode('pocketbase');
        setError(null);
      })
      .catch((fetchError: unknown) => {
        if (cancelled) return;
        setDropdowns(readStoredDropdowns());
        setStorageMode('local');
        setError(toErrorMessage(fetchError, 'Failed to load shared navigation dropdowns'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const persistLocal = useCallback((updater: (prev: NavigationDropdown[]) => NavigationDropdown[]) => {
    setDropdowns((prev) => {
      const next = updater(prev);
      writeStoredDropdowns(next);
      return next;
    });
    setStorageMode('local');
  }, []);

  const addDropdown = useCallback(async (data: NavigationDropdownFormData): Promise<NavigationDropdown> => {
    const maxOrder = dropdowns.reduce((max, d) => Math.max(max, d.order), -1);
    if (storageMode === 'pocketbase') {
      try {
        const created = await pbCreateDropdown({ ...data, order: maxOrder + 1 });
        setDropdowns((prev) => [...prev, created]);
        setError(null);
        return created;
      } catch (createError: unknown) {
        const message = toErrorMessage(createError, 'Failed to create shared navigation dropdown');
        setError(message);
        throw createError instanceof Error ? createError : new Error(message);
      }
    }

    const created = createDropdownRecord(data, { order: maxOrder + 1 });
    persistLocal((prev) => [...prev, created]);
    return created;
  }, [dropdowns, persistLocal, storageMode]);

  const updateDropdown = useCallback(async (id: string, data: Partial<NavigationDropdownFormData & { hidden: boolean; order: number }>): Promise<void> => {
    if (storageMode === 'pocketbase') {
      try {
        const updated = await pbUpdateDropdown(id, data);
        setDropdowns((prev) => prev.map((d) => (d.id === id ? updated : d)));
        setError(null);
        return;
      } catch (updateError: unknown) {
        const message = toErrorMessage(updateError, 'Failed to update shared navigation dropdown');
        setError(message);
        throw updateError instanceof Error ? updateError : new Error(message);
      }
    }

    persistLocal((prev) => prev.map((d) => {
      if (d.id !== id) return d;
      return {
        ...d,
        ...(data.label !== undefined ? { label: data.label.trim() } : {}),
        ...(data.dotColor !== undefined ? { dotColor: data.dotColor.trim() } : {}),
        ...(data.hidden !== undefined ? { hidden: data.hidden } : {}),
        ...(data.order !== undefined ? { order: data.order } : {}),
      };
    }));
  }, [persistLocal, storageMode]);

  const removeDropdown = useCallback(async (id: string): Promise<void> => {
    if (storageMode === 'pocketbase') {
      try {
        await pbDeleteDropdown(id);
        setDropdowns((prev) => prev.filter((d) => d.id !== id));
        setError(null);
        return;
      } catch (deleteError: unknown) {
        const message = toErrorMessage(deleteError, 'Failed to delete shared navigation dropdown');
        setError(message);
        throw deleteError instanceof Error ? deleteError : new Error(message);
      }
    }

    persistLocal((prev) => prev.filter((d) => d.id !== id));
  }, [persistLocal, storageMode]);

  const toggleDropdownVisibility = useCallback(async (id: string): Promise<void> => {
    const dd = dropdowns.find((d) => d.id === id);
    if (!dd) return;
    await updateDropdown(id, { hidden: !dd.hidden });
  }, [dropdowns, updateDropdown]);

  const reorderDropdowns = useCallback(async (ids: string[]): Promise<void> => {
    const items = ids.map((id, i) => ({ id, order: i }));
    if (storageMode === 'pocketbase') {
      try {
        await pbBatchUpdateOrder(items);
        setDropdowns((prev) => {
          const map = new Map(prev.map((d) => [d.id, d]));
          return ids.map((id, i) => {
            const d = map.get(id);
            return d ? { ...d, order: i } : null;
          }).filter(Boolean) as NavigationDropdown[];
        });
        setError(null);
        return;
      } catch (reorderError: unknown) {
        const message = toErrorMessage(reorderError, 'Failed to reorder shared navigation dropdowns');
        setError(message);
        throw reorderError instanceof Error ? reorderError : new Error(message);
      }
    }

    persistLocal((prev) => {
      const map = new Map(prev.map((d) => [d.id, d]));
      return ids.map((id, i) => {
        const d = map.get(id);
        return d ? { ...d, order: i } : null;
      }).filter(Boolean) as NavigationDropdown[];
    });
  }, [persistLocal, storageMode]);

  return {
    dropdowns: [...dropdowns].sort((a, b) => a.order - b.order),
    isLoading,
    error,
    storageMode,
    addDropdown,
    updateDropdown,
    removeDropdown,
    toggleDropdownVisibility,
    reorderDropdowns,
  };
}
