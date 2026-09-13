// This worker handles notification delivery only. It never caches app requests.
const OWNER_CACHE = 'notification-owner-v1';
const OWNER_PATH = '/__notification_owner__';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
async function owner() {
  const response = await (await caches.open(OWNER_CACHE)).match(OWNER_PATH);
  return response ? response.json() : {};
}
async function show(payload, background) {
  const state = await owner();
  if (!payload || !payload.id || state.userId !== payload.userId || !state.enabled || (background && !state.background)) return;
  const tag = 'notification-' + payload.id;
  if ((await self.registration.getNotifications({ tag })).length) return;
  const url = new URL(payload.path || '/community/notifications', self.location.origin);
  if (url.origin !== self.location.origin) return;
  await self.registration.showNotification(payload.title || 'AI-BREAK', {
    body: payload.body || '', tag, renotify: false, icon: '/logo.gif',
    dir: payload.dir === 'rtl' ? 'rtl' : 'ltr', data: { id: payload.id, path: url.href, userId: payload.userId },
  });
}
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'notification-owner') {
    event.waitUntil((async () => {
      await (await caches.open(OWNER_CACHE)).put(OWNER_PATH, new Response(JSON.stringify(data.state)));
      for (const notification of await self.registration.getNotifications()) {
        if (!data.state.enabled || notification.data?.userId !== data.state.userId) notification.close();
      }
      event.ports[0]?.postMessage({ ok: true });
    })());
  } else if (data.type === 'notification-show') event.waitUntil(show(data.payload, false));
});
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    try { await show(event.data?.json(), true); } catch { /* Malformed pushes never open a destination. */ }
  })());
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const state = await owner();
    if (state.userId !== event.notification.data?.userId) return;
    const url = new URL(event.notification.data?.path || '/community/notifications', self.location.origin);
    if (url.origin !== self.location.origin) return;
    url.searchParams.set('notification', event.notification.data.id);
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === url.origin);
    if (existing) { await existing.navigate(url.href); await existing.focus(); }
    else await self.clients.openWindow(url.href);
  })());
});
