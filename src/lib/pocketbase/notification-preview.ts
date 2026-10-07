import { fetchCommunityNotifications } from './community';
import { cachedRead, peekRead } from './read-cache';
import type { CommunityNotificationPage } from '@/types/community';

const KEY = 'community:notification-preview';
export function peekNotificationPreview() { return peekRead<CommunityNotificationPage>(KEY, 30_000); }

export function fetchNotificationPreview(force = false): Promise<CommunityNotificationPage> {
  return cachedRead(KEY, () => fetchCommunityNotifications({ preview: true }), { force, maxAge: 30_000 });
}
