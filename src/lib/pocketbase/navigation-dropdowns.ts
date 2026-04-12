import type { RecordModel } from 'pocketbase';
import { getPocketBase } from './client';
import type { NavigationDropdown, NavigationDropdownFormData } from '@/types/navigation-link';

export const NAV_DROPDOWNS_COLLECTION = 'nav_dropdowns';

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function mapPBRecordToDropdown(record: RecordModel): NavigationDropdown {
  return {
    id: record.id,
    label: normalizeString(record['label']),
    dotColor: normalizeString(record['dotColor']) || '#737373',
    hidden: Boolean(record['hidden']),
    order: typeof record['order'] === 'number' ? record['order'] : 0,
  };
}

export async function fetchDropdowns(): Promise<NavigationDropdown[]> {
  const pb = getPocketBase();
  const records = await pb.collection(NAV_DROPDOWNS_COLLECTION).getFullList({ sort: 'order' });
  return records.map(mapPBRecordToDropdown);
}

export async function createDropdown(data: NavigationDropdownFormData & { hidden?: boolean; order?: number }): Promise<NavigationDropdown> {
  const pb = getPocketBase();
  const record = await pb.collection(NAV_DROPDOWNS_COLLECTION).create({
    label: data.label,
    dotColor: data.dotColor,
    hidden: data.hidden ?? false,
    order: data.order ?? 0,
  });
  return mapPBRecordToDropdown(record);
}

export async function updateDropdown(
  id: string,
  data: Partial<NavigationDropdownFormData & { hidden: boolean; order: number }>,
): Promise<NavigationDropdown> {
  const pb = getPocketBase();
  const payload: Record<string, unknown> = {};
  if (data.label !== undefined) payload.label = data.label;
  if (data.dotColor !== undefined) payload.dotColor = data.dotColor;
  if (data.hidden !== undefined) payload.hidden = data.hidden;
  if (data.order !== undefined) payload.order = data.order;
  const record = await pb.collection(NAV_DROPDOWNS_COLLECTION).update(id, payload);
  return mapPBRecordToDropdown(record);
}

export async function deleteDropdown(id: string): Promise<void> {
  const pb = getPocketBase();
  await pb.collection(NAV_DROPDOWNS_COLLECTION).delete(id);
}

export async function batchUpdateDropdownOrder(items: { id: string; order: number }[]): Promise<void> {
  const pb = getPocketBase();
  await Promise.all(
    items.map((item) => pb.collection(NAV_DROPDOWNS_COLLECTION).update(item.id, { order: item.order })),
  );
}
