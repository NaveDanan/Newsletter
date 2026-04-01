import type { RecordModel } from 'pocketbase';
import { getPocketBase } from './client';
import { normalizeNavigationLink } from '@/lib/navigation-links';
import type { NavigationLink, NavigationLinkFormData } from '@/types/navigation-link';

export const NAVIGATION_LINKS_COLLECTION = 'navigation_links';

export function mapPBRecordToNavigationLink(record: RecordModel): NavigationLink {
  return normalizeNavigationLink({
    id: record.id,
    name: record['name'],
    description: record['description'],
    url: record['url'],
    iconUrl: record['iconUrl'],
    created: record['created'],
    updated: record['updated'],
  });
}

export async function fetchNavigationLinks(): Promise<NavigationLink[]> {
  const pb = getPocketBase();
  const records = await pb.collection(NAVIGATION_LINKS_COLLECTION).getFullList({ sort: 'created' });
  return records.map(mapPBRecordToNavigationLink);
}

export async function createNavigationLink(data: NavigationLinkFormData): Promise<NavigationLink> {
  const pb = getPocketBase();
  const record = await pb.collection(NAVIGATION_LINKS_COLLECTION).create({
    name: data.name,
    description: data.description,
    url: data.url,
    iconUrl: data.iconUrl,
  });

  return mapPBRecordToNavigationLink(record);
}

export async function updateNavigationLink(id: string, data: NavigationLinkFormData): Promise<NavigationLink> {
  const pb = getPocketBase();
  const record = await pb.collection(NAVIGATION_LINKS_COLLECTION).update(id, {
    name: data.name,
    description: data.description,
    url: data.url,
    iconUrl: data.iconUrl,
  });

  return mapPBRecordToNavigationLink(record);
}

export async function deleteNavigationLink(id: string): Promise<void> {
  const pb = getPocketBase();
  await pb.collection(NAVIGATION_LINKS_COLLECTION).delete(id);
}