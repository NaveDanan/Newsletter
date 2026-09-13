import { getPocketBase } from '@/lib/pocketbase/client';
import type { NotificationPreferences } from '@/lib/pocketbase/notifications';
import type { Locale } from '@/locales/messages';

const OWNER_KEY = 'notification-browser-owner';
export interface BrowserNotificationMessage { id: string; userId: string; title: string; body: string; path: string; dir: 'ltr' | 'rtl' }
export function browserNotificationsSupported() {
  return typeof window !== 'undefined' && window.isSecureContext && 'Notification' in window && 'serviceWorker' in navigator;
}
export function browserNotificationsEnabled(userId: string) {
  return browserNotificationsSupported() && Notification.permission === 'granted' && localStorage.getItem(OWNER_KEY) === userId;
}
async function registration() {
  await navigator.serviceWorker.register('/notification-worker.js', { scope: '/' });
  return navigator.serviceWorker.ready;
}
export async function ensureBackgroundNotifications(userId: string, locale: Locale) {
  if (!browserNotificationsEnabled(userId) || !('PushManager' in window)) return false;
  const worker = await registration();
  const { publicKey } = await getPocketBase().send<{ publicKey: string }>('/api/notifications/push/config', { requestKey: null });
  const bytes = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
  const subscription = await worker.pushManager.getSubscription() || await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
  await getPocketBase().send('/api/notifications/push/subscribe', { method: 'POST', body: { subscription: subscription.toJSON(), locale }, requestKey: null });
  return true;
}
export async function syncBrowserNotificationOwner(userId: string, preferences: NotificationPreferences) {
  if (!browserNotificationsSupported()) return;
  const worker = await navigator.serviceWorker.getRegistration('/');
  if (!worker?.active) return;
  await new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(resolve, 2000);
    channel.port1.onmessage = () => { window.clearTimeout(timeout); channel.port1.close(); resolve(); };
    worker.active!.postMessage({ type: 'notification-owner', state: { userId, enabled: preferences.enabled && preferences.browser && browserNotificationsEnabled(userId), background: preferences.background } }, [channel.port2]);
  });
}
export async function enableBrowserNotifications(userId: string, locale: Locale, background: boolean) {
  if (!browserNotificationsSupported()) throw new Error('unsupported');
  const permission = await new Promise<NotificationPermission>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('permission-timeout')), 30000);
    Notification.requestPermission().then((value) => { window.clearTimeout(timer); resolve(value); }, (error) => { window.clearTimeout(timer); reject(error); });
  });
  if (permission !== 'granted') throw new Error('permission');
  await registration();
  localStorage.setItem(OWNER_KEY, userId);
  if (background) {
    try { if (!await ensureBackgroundNotifications(userId, locale)) throw new Error('unsupported'); }
    catch (error) { localStorage.removeItem(OWNER_KEY); throw error; }
  }
}
export async function disableBrowserNotifications() {
  const client = getPocketBase();
  const token = client.authStore.token;
  localStorage.removeItem(OWNER_KEY);
  if (!browserNotificationsSupported()) return;
  const worker = await navigator.serviceWorker.getRegistration('/');
  worker?.active?.postMessage({ type: 'notification-owner', state: { userId: '', enabled: false, background: false } });
  const subscription = await worker?.pushManager?.getSubscription();
  if (subscription) {
    try { if (token) await client.send('/api/notifications/push/unsubscribe', { method: 'POST', headers: { Authorization: token }, body: { endpoint: subscription.endpoint }, requestKey: null }); }
    finally { await subscription.unsubscribe(); }
  }
}
export async function showBrowserNotification(payload: BrowserNotificationMessage) {
  const worker = await navigator.serviceWorker.getRegistration('/');
  worker?.active?.postMessage({ type: 'notification-show', payload });
}
