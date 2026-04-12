import { readStoredValue, writeStoredValue } from './localStorage';
import type { NavigationLink, NavigationLinkFormData } from '@/types/navigation-link';

export const NAVIGATION_LINKS_STORAGE_KEY = 'newsletter-navigation-links';

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function createNavigationLinkId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `nav-link-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeNavigationLink(candidate: Partial<NavigationLink>): NavigationLink {
  return {
    id: normalizeString(candidate.id) || createNavigationLinkId(),
    dropdownId: normalizeString(candidate.dropdownId) || 'resources',
    name: normalizeString(candidate.name),
    description: normalizeString(candidate.description),
    url: normalizeString(candidate.url),
    iconUrl: normalizeString(candidate.iconUrl),
    hidden: typeof candidate.hidden === 'boolean' ? candidate.hidden : false,
    order: typeof candidate.order === 'number' ? candidate.order : 0,
    created: normalizeString(candidate.created) || undefined,
    updated: normalizeString(candidate.updated) || undefined,
  };
}

export function createNavigationLinkRecord(
  data: NavigationLinkFormData,
  overrides: Partial<NavigationLink> = {},
): NavigationLink {
  const now = new Date().toISOString();

  return normalizeNavigationLink({
    id: overrides.id ?? createNavigationLinkId(),
    created: overrides.created ?? now,
    updated: overrides.updated ?? now,
    ...data,
    ...overrides,
  });
}

export function readStoredNavigationLinks(): NavigationLink[] {
  const stored = readStoredValue<NavigationLink[]>(NAVIGATION_LINKS_STORAGE_KEY, []);

  if (!Array.isArray(stored)) {
    return [];
  }

  return stored.map((entry) => normalizeNavigationLink(entry));
}

export function writeStoredNavigationLinks(links: NavigationLink[]): void {
  writeStoredValue(NAVIGATION_LINKS_STORAGE_KEY, links.map((entry) => normalizeNavigationLink(entry)));
}