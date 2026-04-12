import { readStoredValue, writeStoredValue } from './localStorage';
import type { NavigationDropdown, NavigationDropdownFormData } from '@/types/navigation-link';
import { SEED_DROPDOWNS } from '@/types/navigation-link';

export const NAVIGATION_DROPDOWNS_STORAGE_KEY = 'newsletter-nav-dropdowns';

export function createDropdownId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `nav-dd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function readStoredDropdowns(): NavigationDropdown[] {
  const stored = readStoredValue<NavigationDropdown[] | null>(NAVIGATION_DROPDOWNS_STORAGE_KEY, null);

  if (!Array.isArray(stored)) {
    return SEED_DROPDOWNS.map((d) => ({ ...d }));
  }

  return stored;
}

export function writeStoredDropdowns(dropdowns: NavigationDropdown[]): void {
  writeStoredValue(NAVIGATION_DROPDOWNS_STORAGE_KEY, dropdowns);
}

export function createDropdownRecord(data: NavigationDropdownFormData, overrides: Partial<NavigationDropdown> = {}): NavigationDropdown {
  return {
    id: overrides.id ?? createDropdownId(),
    label: data.label.trim(),
    dotColor: data.dotColor.trim() || '#737373',
    hidden: overrides.hidden ?? false,
    order: overrides.order ?? 999,
  };
}
