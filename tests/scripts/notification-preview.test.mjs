import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, mocks = {}, extra = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: name => {
    if (!(name in mocks)) throw new Error('Missing mock ' + name);
    return mocks[name];
  }, ...extra });
  return exports;
}
const { groupNotifications, notificationMessageKey, notificationTarget } = load('src/lib/notification-preview.ts');
const note = (id, patch = {}) => ({ id, kind: 'like', actorId: 'alice', actorName: 'Alice', actorHandle: 'alice', actorAvatarUrl: '/alice.png', postId: 'post-a', rootId: '', targetPath: '/community/post/post-a', preview: 'A post', isRead: false, createdAt: '2026-10-07T12:00:00.000Z', ...patch });
const plain = value => JSON.parse(JSON.stringify(value));

test('different activity on one conversation forms one group with unique participants and all unread IDs', () => {
  const notes = [note('a'), note('b', { kind: 'reply', actorId: 'bob', rootId: 'post-a', postId: 'reply-b' }), note('c', { kind: 'mention', isRead: true }), note('a')];
  const groups = groupNotifications(notes);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].notifications.length, 3);
  assert.deepEqual(plain(groups[0].unreadIds).sort(), ['a', 'b']);
  assert.equal(groups[0].actors.length, 2);
  assert.equal(groups[0].latest.id, 'c');
  assert.equal(notes.length, 4, 'grouping does not mutate the input');
});

test('the latest six groups retain later members even after the display limit is reached', () => {
  const notes = Array.from({ length: 8 }, (_, i) => note(String(i), { targetPath: '/community/post/p' + i, createdAt: `2026-10-07T12:0${i}:00.000Z` }));
  notes.push(note('old', { targetPath: '/community/post/p7', createdAt: '2026-10-07T11:00:00.000Z' }));
  const groups = groupNotifications(notes);
  assert.deepEqual(plain(groups.map(group => group.key)), ['post:p7', 'post:p6', 'post:p5', 'post:p4', 'post:p3', 'post:p2']);
  assert.equal(groups[0].notifications.length, 2);
});

test('publication, article activity, community activity and independent follows keep separate groups', () => {
  const groups = groupNotifications([
    note('published', { kind: 'newsletter', postId: 'same', targetPath: '/article/same' }),
    note('article-like', { postId: 'same', targetPath: '/article/same/title' }),
    note('article-comment', { kind: 'comment', postId: 'same:comment', targetPath: '/article/same' }),
    note('post', { postId: 'same', targetPath: '/community/post/same' }),
    note('follow1', { kind: 'follow', postId: '', targetPath: '' }),
    note('follow2', { kind: 'follow', postId: '', targetPath: '' }),
  ]);
  assert.equal(groups.length, 5);
  assert.equal(groups.find(group => group.key === 'article:same').notifications.length, 2);
});

test('notification destinations stay internal and preserve post, article and profile navigation', () => {
  assert.equal(notificationTarget(note('a')), '/community/post/post-a');
  assert.equal(notificationTarget(note('a', { targetPath: '/article/id/title#comments' })), '/article/id/title#comments');
  assert.equal(notificationTarget(note('a', { kind: 'follow', postId: '', targetPath: '' })), '/community/profile/alice');
  for (const targetPath of ['https://bad.example', '//bad.example', '/community/post/\\bad', 'javascript:alert(1)']) assert.equal(notificationTarget(note('a', { targetPath })), '/community/post/post-a');
});

test('individual notification messages still distinguish newsletter and comment likes and mentions', () => {
  assert.equal(notificationMessageKey(note('a', { targetPath: '/article/one' })), 'community.notifications.likeNewsletter');
  assert.equal(notificationMessageKey(note('a', { postId: 'one:comment' })), 'community.notifications.likeComment');
  assert.equal(notificationMessageKey(note('a', { kind: 'mention', rootId: 'root', postId: 'reply' })), 'community.notifications.mentionInComment');
});

function hookHarness(cached) {
  let scope = 'alice', dirty = true, index = 0, value;
  const slots = [], effects = [], reads = [], writes = [];
  const events = new EventTarget();
  const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
  const same = (a, b) => a && b && a.length === b.length && a.every((item, i) => Object.is(item, b[i]));
  const react = {
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; dirty = true; }]; },
    useRef(initial) { return slots[index++] ??= { current: initial }; },
    useCallback(fn, deps) { const i = index++; if (!same(slots[i]?.deps, deps)) slots[i] = { deps, fn }; return slots[i].fn; },
    useEffect(fn, deps) { const i = index++; if (!same(slots[i]?.deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  const api = load('src/hooks/useNotificationPreview.ts', {
    react,
    '@/lib/pocketbase/notification-preview': { peekNotificationPreview: () => cached, fetchNotificationPreview: () => { const pending = deferred(); reads.push(pending); return pending.promise; } },
    '@/lib/pocketbase/community': { markCommunityNotificationsRead: ids => { const pending = deferred(); writes.push({ ids, ...pending }); return pending.promise; } },
    '@/lib/pocketbase/read-cache': { readScope: () => scope },
    '@/lib/pocketbase/notifications': { notificationsChanged: () => events.dispatchEvent(new Event('notifications:changed')) },
    '@/lib/notification-preview': { groupNotifications },
  }, { window: events, document: { hidden: false } });
  function settle() {
    for (let attempt = 0; dirty || effects.length; attempt++) {
      assert.ok(attempt < 20);
      if (dirty) { dirty = false; index = 0; value = api.useNotificationPreview(); }
      effects.splice(0).forEach(effect => effect());
    }
    return value;
  }
  return { reads, writes, get value() { return settle(); }, changeScope(next) { scope = next; dirty = true; return settle(); }, refresh: () => events.dispatchEvent(new Event('notifications:changed')), async flush() { await new Promise(resolve => setImmediate(resolve)); return settle(); }, unmount() { slots.forEach(slot => slot?.cleanup?.()); } };
}
const page = items => ({ items, hasMore: false, cursor: '', unreadCount: items.filter(item => !item.isRead).length });

test('notification triggers retain the first open and reopen without following the original page link', () => {
  const state = [];
  let index = 0, navigations = 0, preloads = 0;
  const jsx = (type, props) => ({ type, props });
  const { NotificationDropdown } = load('src/components/notifications/NotificationDropdown.tsx', {
    'react/jsx-runtime': { jsx },
    react: {
      cloneElement: (element, props) => ({ ...element, props: { ...element.props, ...props } }),
      useState(initial) { const slot = index++; state[slot] ??= initial; return [state[slot], next => { state[slot] = next; }]; },
    },
    '@/lib/lazy-component': { lazyComponent: () => Object.assign(() => {}, { preload: () => { preloads++; } }) },
    '@/lib/pocketbase/read-cache': { readScope: () => 'alice' },
  });
  const trigger = jsx('button', { onClick: () => { navigations++; } });
  const render = () => { index = 0; return NotificationDropdown({ trigger }); };
  function activate(node) {
    if (node.type === 'button') node.props.onClick();
    else {
      // A loaded PopoverTrigger composes the child's handler with toggling open.
      node.props.trigger.props.onClick?.();
      node.props.onOpenChange(!node.props.open);
    }
  }
  const initial = render();
  initial.props.onFocus({});
  assert.equal(preloads, 1);
  assert.equal(navigations, 0);
  activate(initial);
  let popover = render();
  assert.equal(popover.props.open, true, 'the click survives the deferred import');
  popover.props.onOpenChange(false);
  activate(render());
  popover = render();
  assert.equal(popover.props.open, true);
  assert.equal(navigations, 0, 'reopening stays on the current page');
});

test('See more dismisses the preview before an unsaved-editor guard and defers the route until approval', () => {
  const steps = [], window = { history: { pushState: (_, __, path) => steps.push(path) }, dispatchEvent: () => {} };
  let approved;
  const jsx = (type, props) => ({ type, props });
  const { NotificationPreviewList } = load('src/components/notifications/NotificationPreviewList.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/components/ui/dropdown-menu': { DropdownMenuItem: () => {} },
    '@/contexts/LocaleContext': { useLocale: () => ({ t: key => key }) },
    '@/hooks/useNotificationPreview': { useNotificationPreview: () => ({ groups: [], loading: false, error: false }) },
    '@/lib/notification-preview': { notificationMessageKey, notificationTarget },
    '@/lib/preload-route': { preloadRoute: () => {} },
    '@/lib/utils': { cn: () => '' },
    './NotificationVisual': { NotificationVisual: () => {} },
  }, { window, Event });
  function find(node) {
    if (Array.isArray(node)) return node.map(find).find(Boolean);
    if (!node || typeof node !== 'object') return undefined;
    return node.type === 'button' && node.props.children === 'notifications.preview.seeMore' ? node : find(node.props?.children);
  }
  const more = find(NotificationPreviewList({ onClose: () => steps.push('closed'), onNavigate: action => { steps.push('guard'); approved = action; } }));
  more.props.onClick();
  assert.deepEqual(steps, ['closed', 'guard']);
  approved();
  assert.deepEqual(steps, ['closed', 'guard', '/community/notifications']);
});

test('denied revalidation removes cached private notification details', async () => {
  const h = hookHarness(page([note('private')]));
  assert.equal(h.value.groups.length, 1);
  h.reads[0].reject({ status: 403 }); await h.flush();
  assert.equal(h.value.groups.length, 0);
  assert.equal(h.value.error, true);
  h.unmount();
});

test('cached notifications display immediately and stale refreshes cannot undo a group read', async () => {
  const h = hookHarness(page([note('a'), note('b')]));
  assert.equal(h.value.loading, false);
  assert.equal(h.value.groups.length, 1);
  const mark = h.value.markRead(h.value.groups[0]);
  assert.deepEqual(plain(h.writes[0].ids).sort(), ['a', 'b']);
  h.reads[0].resolve(page([note('a'), note('b')])); await h.flush();
  assert.equal(h.value.groups[0].unreadIds.length, 0);
  h.writes[0].resolve(2); await mark; await h.flush();
  h.unmount();
});

test('account changes hide old groups and discard in-flight reads and writes', async () => {
  const h = hookHarness(page([note('a')]));
  const mark = h.value.markRead(h.value.groups[0]);
  assert.equal(h.changeScope('bob').groups.length, 0);
  h.reads[0].resolve(page([note('a')])); h.writes[0].resolve(1); await mark; await h.flush();
  assert.equal(h.value.groups.length, 0);
  h.reads[1].resolve(page([note('bob-note', { actorId: 'carol' })])); await h.flush();
  assert.equal(h.value.groups[0].latest.id, 'bob-note');
  h.unmount();
});

test('failed group updates restore unread status from the server and expose retry feedback', async () => {
  const h = hookHarness(page([note('a')]));
  const mark = h.value.markRead(h.value.groups[0]);
  h.writes[0].reject(new Error('offline')); await h.flush();
  h.reads[1].resolve(page([note('a')])); await mark; await h.flush();
  assert.equal(h.value.error, true);
  assert.deepEqual(plain(h.value.groups[0].unreadIds), ['a']);
  h.unmount();
});
