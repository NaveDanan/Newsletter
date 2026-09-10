import type { RecordModel } from 'pocketbase';
import { getPocketBase } from './client';

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
