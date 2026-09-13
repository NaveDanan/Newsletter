import { getPocketBase } from './client';

export const NOTIFICATION_PREFERENCE_KEYS = ['mentions', 'comments', 'following', 'events', 'newsletters', 'activity'] as const;
export type NotificationPreferenceKey = 'enabled' | 'browser' | 'background' | (typeof NOTIFICATION_PREFERENCE_KEYS)[number];
export type NotificationPreferences = Record<NotificationPreferenceKey, boolean>;
export function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  return getPocketBase().send('/api/notifications/preferences', { method: 'GET', requestKey: null });
}
export function saveNotificationPreferences(patch: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
  return getPocketBase().send('/api/notifications/preferences', { method: 'PATCH', body: patch, requestKey: null });
}
export function notificationsChanged() {
  window.dispatchEvent(new Event('notifications:changed'));
}
