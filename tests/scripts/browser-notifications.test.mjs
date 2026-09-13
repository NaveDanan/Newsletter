import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import webpush from 'web-push';
import { createECDH, randomBytes } from 'node:crypto';
import { deliverPushBatch, validPushEndpoint } from '../../scripts/pocketbase/web-push.mjs';
import { eventDateTimeInput, eventWithUtcDates } from '../../src/lib/event-time.ts';

test('Web Push accepts only known HTTPS push providers', () => {
  for (const url of ['https://fcm.googleapis.com/fcm/send/token', 'https://updates.push.services.mozilla.com/wpush/v2/token', 'https://web.push.apple.com/Qtoken', 'https://db5.notify.windows.com/w/?token=x']) assert.equal(validPushEndpoint(url), true);
  for (const url of ['https://127.0.0.1/private', 'http://fcm.googleapis.com/token', 'https://fcm.googleapis.com.evil.example/token', 'https://user@fcm.googleapis.com/token', 'https://fcm.googleapis.com:8443/token', 'file:///etc/passwd']) assert.equal(validPushEndpoint(url), false);
});

test('Web Push encrypts payloads and uses bounded transport timeouts', async () => {
  const keys = webpush.generateVAPIDKeys(), recipient = createECDH('prime256v1'); recipient.generateKeys();
  const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: { p256dh: recipient.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
  const result = await deliverPushBatch({ publicKey: keys.publicKey, privateKey: keys.privateKey, subject: 'mailto:test@example.com', items: [{ id: 'one', subscription, payload: { title: 'Private message' } }] }, async (sub, payload, options) => {
    assert.equal(options.timeout, 10000);
    const request = webpush.generateRequestDetails(sub, payload, options);
    assert.equal(request.headers['Content-Encoding'], 'aes128gcm');
    assert.equal(request.body.includes(Buffer.from('Private message')), false);
  });
  assert.deepEqual(result, [{ id: 'one', status: 201 }]);
});

test('Web Push failures return only status and job id', async () => {
  const result = await deliverPushBatch({ items: [{ id: 'one', subscription: { endpoint: 'https://fcm.googleapis.com/test' }, payload: {} }] }, async () => { throw Object.assign(new Error('private endpoint token'), { statusCode: 410 }); });
  assert.deepEqual(result, [{ id: 'one', status: 410 }]);
});

function worker() {
  const handlers = {}, stored = new Map(), shown = [], navigation = [];
  const self = { location: { origin: 'https://newsletter.example' }, addEventListener: (name, handler) => { handlers[name] = handler; }, skipWaiting() {},
    registration: { getNotifications: async ({ tag } = {}) => shown.filter((note) => !tag || note.tag === tag), showNotification: async (title, options) => { shown.push({ title, ...options, close() {} }); } },
    clients: { claim() {}, matchAll: async () => [], openWindow: async (url) => navigation.push(url) },
  };
  vm.runInNewContext(readFileSync('public/notification-worker.js', 'utf8'), { self, URL, Response, caches: { open: async () => ({ match: async (key) => stored.get(key)?.clone(), put: async (key, value) => stored.set(key, value) }) } });
  const emit = async (name, value) => { let promise; handlers[name]({ ...value, waitUntil: (p) => { promise = p; } }); await promise; };
  return { emit, shown, navigation };
}
test('service worker shows background alerts once, obeys modes and refuses another account', async () => {
  const w = worker();
  const payload = { id: 'note1', userId: 'alice', title: 'Mention', body: 'Hello', path: '/community/post/one' };
  await w.emit('message', { data: { type: 'notification-owner', state: { userId: 'alice', enabled: true, background: true } }, ports: [] });
  await w.emit('push', { data: { json: () => payload } });
  await w.emit('push', { data: { json: () => payload } });
  assert.equal(w.shown.length, 1);
  await w.emit('notificationclick', { notification: w.shown[0] });
  assert.match(w.navigation[0], /^https:\/\/newsletter.example\/community\/post\/one/);
  await w.emit('message', { data: { type: 'notification-owner', state: { userId: 'alice', enabled: true, background: false } }, ports: [] });
  await w.emit('push', { data: { json: () => ({ ...payload, id: 'note2' }) } });
  assert.equal(w.shown.length, 1);
  await w.emit('message', { data: { type: 'notification-show', payload: { ...payload, id: 'note2' } } });
  assert.equal(w.shown.length, 2, 'open-site mode still shows browser pop-ups');
  await w.emit('message', { data: { type: 'notification-owner', state: { userId: 'bob', enabled: true, background: true } }, ports: [] });
  await w.emit('push', { data: { json: () => ({ ...payload, id: 'note3' }) } });
  await w.emit('notificationclick', { notification: w.shown[0] });
  assert.equal(w.shown.length, 2); assert.equal(w.navigation.length, 1);
});
test('service worker ignores malformed or external notification destinations', async () => {
  const w = worker();
  await w.emit('message', { data: { type: 'notification-owner', state: { userId: 'alice', enabled: true, background: true } }, ports: [] });
  await w.emit('push', { data: { json: () => ({ id: 'one', userId: 'alice', path: 'https://attacker.example' }) } });
  await w.emit('push', { data: { json: () => { throw new Error('invalid'); } } });
  assert.equal(w.shown.length, 0);
});
test('event instants keep their offset and round-trip through a local datetime input', () => {
  const event = { id: 'one', title: 'Meeting', startDate: '2026-09-20T14:00:00+03:00', attendees: [] };
  const utc = eventWithUtcDates(event);
  assert.equal(utc.startDate, '2026-09-20T11:00:00.000Z');
  assert.equal(new Date(eventDateTimeInput(utc.startDate)).getTime(), new Date(utc.startDate).getTime());
});

test('an enabled open-site browser acquires a subscription when background mode changes elsewhere', async () => {
  const keys = webpush.generateVAPIDKeys(), storage = new Map(), requests = [];
  let subscription = null, permissions = 0;
  const worker = { pushManager: { getSubscription: async () => subscription, subscribe: async () => {
    subscription = { toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/test', keys: { p256dh: keys.publicKey, auth: 'test' } }) };
    return subscription;
  } } };
  const source = ts.transpileModule(readFileSync('src/lib/browser-notifications.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exported = {};
  vm.runInNewContext(source, {
    exports: exported,
    require: () => ({ getPocketBase: () => ({ send: async (route) => { requests.push(route); return { publicKey: keys.publicKey }; } }) }),
    window: { isSecureContext: true, Notification: {}, PushManager: {}, setTimeout, clearTimeout },
    Notification: { permission: 'granted', requestPermission: async () => { permissions++; return 'granted'; } },
    navigator: { serviceWorker: { register: async () => worker, ready: Promise.resolve(worker) } },
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    Uint8Array, atob,
  });
  await exported.enableBrowserNotifications('alice', 'en', false);
  assert.equal(subscription, null, 'open-site-only mode does not need a push subscription');
  assert.equal(await exported.ensureBackgroundNotifications('alice', 'en'), true);
  assert.ok(subscription);
  assert.equal(permissions, 1, 'synchronizing the mode does not request permission again');
  assert.ok(requests.includes('/api/notifications/push/subscribe'));
  assert.equal(await exported.ensureBackgroundNotifications('bob', 'en'), false, 'a different account cannot reuse device opt-in');
});
