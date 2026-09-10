import type PocketBase from 'pocketbase';

/**
 * Initials for the account avatar, e.g. "Ada Lovelace" -> "AL".
 * Splits on spaces and the separators that show up inside email addresses, so
 * a user who never set a name still gets something better than a blank circle.
 */
export function initials(label: string | null | undefined): string {
  if (!label) {
    return 'N';
  }

  const parts = label.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'N';
}

/**
 * Absolute URL of a user record's avatar file, or `undefined` when there is none.
 *
 * PocketBase renames every stored file, so the URL changes on its own after an
 * upload — but a delete-then-reupload can land on the same name, and path-keyed
 * caches would then serve the stale bytes. The record's `updated` timestamp
 * rides along as `?v=` to make each version distinct.
 */
export function avatarUrlFor(pb: PocketBase, record: Record<string, unknown>): string | undefined {
  const fileName = typeof record.avatar === 'string' ? record.avatar : '';
  if (!fileName) {
    return undefined;
  }

  const files = pb.files as {
    getURL?: (record: Record<string, unknown>, fileName: string) => string;
    getUrl?: (record: Record<string, unknown>, fileName: string) => string;
  };

  const url = typeof files.getURL === 'function'
    ? files.getURL(record, fileName)
    : files.getUrl
      ? files.getUrl(record, fileName)
      : '';

  if (!url) {
    return undefined;
  }

  const version = typeof record.updated === 'string' ? record.updated : '';
  if (!version) {
    return url;
  }

  return `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(version)}`;
}
