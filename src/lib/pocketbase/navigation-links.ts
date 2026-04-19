import type { RecordModel } from 'pocketbase';
import { getPocketBase } from './client';
import { normalizeNavigationLink } from '@/lib/navigation-links';
import type { NavigationLink, NavigationLinkFormData } from '@/types/navigation-link';

export const NAVIGATION_LINKS_COLLECTION = 'navigation_links';

function getRecordFileUrl(pb: ReturnType<typeof getPocketBase>, record: RecordModel, fileName: string): string {
  const files = pb.files as { getURL?: (record: RecordModel, fileName: string) => string; getUrl?: (record: RecordModel, fileName: string) => string };
  if (typeof files.getURL === 'function') {
    return files.getURL(record, fileName);
  }

  return files.getUrl ? files.getUrl(record, fileName) : '';
}

/**
 * Check if a string is a base64 data URI (custom uploaded image, not an SVG default icon).
 */
function isBase64DataUri(url: string): boolean {
  return url.startsWith('data:image/') && url.includes(';base64,') && !url.startsWith('data:image/svg+xml');
}

/**
 * Convert a base64 data URI to a File object for PocketBase upload.
 */
function dataUriToFile(dataUri: string, filename: string): File {
  const [header, base64] = dataUri.split(',');
  const mime = header.match(/data:(.*?);/)?.[1] ?? 'image/png';
  const ext = mime.split('/')[1] || 'png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], `${filename}.${ext}`, { type: mime });
}

export function mapPBRecordToNavigationLink(record: RecordModel): NavigationLink {
  const pb = getPocketBase();
  // Resolve icon: prefer uploaded file, fall back to iconUrl text field
  let resolvedIconUrl = record['iconUrl'] ?? '';
  if (record['icon']) {
    resolvedIconUrl = getRecordFileUrl(pb, record, record['icon']);
  }

  return normalizeNavigationLink({
    id: record.id,
    dropdownId: record['dropdownId'],
    name: record['name'],
    description: record['description'],
    url: record['url'],
    iconUrl: resolvedIconUrl,
    hidden: record['hidden'],
    order: record['order'],
    created: record['created'],
    updated: record['updated'],
  });
}

export async function fetchNavigationLinks(): Promise<NavigationLink[]> {
  const pb = getPocketBase();
  const records = await pb.collection(NAVIGATION_LINKS_COLLECTION).getFullList({ sort: 'created' });
  return records.map(mapPBRecordToNavigationLink);
}

function buildLinkPayload(data: NavigationLinkFormData): FormData | Record<string, unknown> {
  const iconUrl = data.iconUrl ?? '';

  // If the icon is a custom-uploaded base64 image, upload it as a file
  if (isBase64DataUri(iconUrl)) {
    const formData = new FormData();
    formData.append('dropdownId', data.dropdownId);
    formData.append('name', data.name);
    formData.append('description', data.description ?? '');
    formData.append('url', data.url);
    formData.append('iconUrl', ''); // clear text field
    formData.append('hidden', String(data.hidden ?? false));
    formData.append('order', String(data.order ?? 0));
    formData.append('icon', dataUriToFile(iconUrl, `icon-${Date.now()}`));
    return formData;
  }

  // Otherwise (SVG data URI default icon or external URL), store as text
  return {
    dropdownId: data.dropdownId,
    name: data.name,
    description: data.description,
    url: data.url,
    iconUrl: iconUrl,
    icon: null, // clear any previous file
    hidden: data.hidden,
    order: data.order,
  };
}

export async function createNavigationLink(data: NavigationLinkFormData): Promise<NavigationLink> {
  const pb = getPocketBase();
  const payload = buildLinkPayload(data);
  const record = await pb.collection(NAVIGATION_LINKS_COLLECTION).create(payload);
  return mapPBRecordToNavigationLink(record);
}

export async function updateNavigationLink(id: string, data: NavigationLinkFormData): Promise<NavigationLink> {
  const pb = getPocketBase();
  const payload = buildLinkPayload(data);
  const record = await pb.collection(NAVIGATION_LINKS_COLLECTION).update(id, payload);
  return mapPBRecordToNavigationLink(record);
}

export async function deleteNavigationLink(id: string): Promise<void> {
  const pb = getPocketBase();
  await pb.collection(NAVIGATION_LINKS_COLLECTION).delete(id);
}