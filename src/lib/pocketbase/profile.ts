import type { RecordModel } from 'pocketbase';
import { getPocketBase, subscribeToAuthRecord } from './client';

/**
 * Self-service edits to the signed-in user's own record.
 *
 * The PocketBase SDK merges the updated record back into `authStore` whenever
 * the ids match, which fires `authStore.onChange` and therefore re-runs the
 * subscriber in `AuthContext`. That is what makes a new avatar appear
 * everywhere at once — no manual refresh, no second request.
 *
 * `getPocketBase()` is called per operation on purpose: `resetPocketBase()`
 * nulls the singleton on sign-out, so a captured client would go stale.
 */

export async function updateUserName(userId: string, name: string): Promise<RecordModel> {
  const pb = getPocketBase();
  return pb.collection('users').update<RecordModel>(userId, { name });
}

export async function uploadUserAvatar(userId: string, blob: Blob): Promise<RecordModel> {
  const pb = getPocketBase();
  const formData = new FormData();
  formData.append('avatar', blob, `avatar-${Date.now()}.png`);
  return pb.collection('users').update<RecordModel>(userId, formData);
}

export async function removeUserAvatar(userId: string): Promise<RecordModel> {
  const pb = getPocketBase();
  return pb.collection('users').update<RecordModel>(userId, { avatar: null });
}

export interface AppearancePreferences {
  themePreference: string;
  accentPreset: string;
  accentCustomHex: string;
}

export interface AccountAppearance {
  userId: string;
  preferences: AppearancePreferences;
}

function readAccountAppearance(record: RecordModel | null): AccountAppearance | null {
  if (!record) {
    return null;
  }
  const text = (key: string) => (typeof record[key] === 'string' ? record[key] : '');
  return {
    userId: record.id,
    preferences: {
      themePreference: text('themePreference'),
      accentPreset: text('accentPreset'),
      accentCustomHex: text('accentCustomHex'),
    },
  };
}

// The theme is applied above AuthProvider, so these read the auth store
// directly instead of going through useAuth().

export function currentAccountAppearance(): AccountAppearance | null {
  return readAccountAppearance(getPocketBase().authStore.record);
}

export function subscribeToAccountAppearance(listener: (account: AccountAppearance | null) => void): () => void {
  return subscribeToAuthRecord((record) => {
    listener(readAccountAppearance(record));
  });
}

/**
 * Saves onto `userId`'s account and returns what the server stored. Resolves
 * to null without writing when that account is no longer the signed-in one, so
 * an edit queued before a sign-out or account switch never lands elsewhere.
 */
export async function saveAccountAppearance(
  userId: string,
  patch: Partial<AppearancePreferences>,
): Promise<AccountAppearance | null> {
  const pb = getPocketBase();
  if (pb.authStore.record?.id !== userId) {
    return null;
  }
  const record = await pb.collection('users').update<RecordModel>(userId, patch, { requestKey: null });
  return readAccountAppearance(record);
}