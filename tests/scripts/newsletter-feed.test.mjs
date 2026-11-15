import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, require, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require, URLSearchParams, ...globals });
  return exports;
}
const { QueryCache } = load('src/lib/query-cache.ts', () => ({}));
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  let scope = 'backend|anonymous|', now = 0;
  const cache = new QueryCache(64, () => now), storage = new Map(), requests = [];
  const api = load('src/lib/pocketbase/newsletter-feed.ts', name => {
    if (name === './newsletters') return { mapPBRecordToNewsletter: value => value };
    if (name === './client') return { getPocketBase: () => ({ send(path, options) { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); requests.push({ path, options, resolve, reject }); return promise; } }) };
    if (name === './read-cache') return { readScope: () => scope, readCache: cache, peekRead: (key, age) => cache.peek(scope + key, age), cachedRead: (key, source, options) => cache.read(scope + key, source, options) };
    throw new Error(name);
  }, { sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } });
  return { api, requests, cache, storage, scope: () => scope, changeScope(next) { scope = next; cache.invalidate(); }, expire() { now += 31_000; } };
}
const response = (start = 0, count = 10, totalItems = 24) => ({ items: Array.from({ length: count }, (_, index) => ({ id: String(start + index), content: '', contentLoaded: false, commentItems: [], presentationFiles: [], presentationPreviews: [] })), totalItems, totalPages: Math.ceil(totalItems / 10) });

test('startup and React share one compact 10-item request; subsequent pages are requested separately', async () => {
  const h = harness();
  const startup = h.api.fetchNewsletterPage(), react = h.api.fetchNewsletterPage(); await tick();
  assert.equal(h.requests.length, 1);
  const url = new URL(h.requests[0].path, 'https://example.com');
  assert.equal(url.searchParams.get('perPage'), '10'); assert.equal(url.searchParams.get('status'), 'published');
  assert.equal(url.searchParams.get('view'), 'summary'); assert.equal(url.searchParams.get('compact'), '1');
  h.requests[0].resolve(response());
  assert.equal((await startup).items.length, 10); await react; await tick();
  assert.equal(h.requests.length, 1, 'first response never triggers an archive download');
  const more = h.api.fetchNewsletterPage({}, 2); await tick();
  assert.equal(new URL(h.requests[1].path, 'https://example.com').searchParams.get('page'), '2');
  h.requests[1].resolve(response(10)); assert.equal((await more).nextPage, 3);
  const last = h.api.fetchNewsletterPage({}, 3); await tick();
  h.requests[2].resolve(response(20, 4)); assert.equal((await last).hasMore, false);
});

test('searches, tabs and identities have distinct caches; query values are encoded and expired reads revalidate', async () => {
  const h = harness(), query = { search: "O'Reilly && tag%", tab: 'bookmarks' };
  const search = h.api.fetchNewsletterPage(query), latest = h.api.fetchNewsletterPage(); await tick();
  assert.equal(h.requests.length, 2);
  const url = new URL(h.requests[0].path, 'https://example.com');
  assert.equal(url.searchParams.get('q'), query.search); assert.equal(url.searchParams.get('feed'), 'bookmarks');
  h.requests[0].resolve(response(90, 1, 1)); h.requests[1].resolve(response()); await Promise.all([search, latest]);
  await h.api.fetchNewsletterPage(query); assert.equal(h.requests.length, 2);
  h.expire(); const stale = h.api.fetchNewsletterPage(query); await tick();
  h.requests[2].resolve(response(91, 1, 1)); await stale;
  h.changeScope('backend|bob:viewer|'); const bob = h.api.fetchNewsletterPage(query); await tick();
  assert.equal(h.requests.length, 4); h.requests[3].resolve(response(92, 1, 1)); await bob;
});

test('refresh storage contains only 10 light previews; Back retains all loaded pages in memory and private feeds are never stored', () => {
  const h = harness();
  const page = { items: response(0, 24).items.map(item => ({ ...item, content: 'x'.repeat(100_000), searchText: 'y'.repeat(100_000) })), nextPage: 4, hasMore: false, totalItems: 24 };
  h.api.rememberNewsletterFeed({}, page);
  assert.equal(h.api.getCachedNewsletterFeed().items.length, 24);
  const encoded = [...h.storage.values()][0]; assert.ok(encoded.length < 5000);
  h.cache.invalidate();
  const restored = h.api.getCachedNewsletterFeed();
  assert.equal(restored.items.length, 10); assert.equal(restored.nextPage, 2); assert.equal(restored.hasMore, true);
  assert.equal(restored.items[0].content, ''); assert.equal(restored.items[0].searchText, undefined);
  const saved = encoded; h.changeScope('backend|bob:viewer|');
  assert.equal(h.api.getCachedNewsletterFeed(), undefined); h.api.rememberNewsletterFeed({ tab: 'bookmarks' }, page);
  assert.equal([...h.storage.values()][0], saved, 'authenticated and bookmark rows stay out of session storage');
});

test('invalidated pending requests do not restore pages from before a mutation', async () => {
  const h = harness(), old = h.api.fetchNewsletterPage(); await tick(); h.cache.invalidate();
  h.requests[0].resolve(response()); await old;
  const fresh = h.api.fetchNewsletterPage(); await tick(); assert.equal(h.requests.length, 2);
  h.requests[1].resolve(response(10)); await fresh;
});

function feedComponent(props = {}, mobile = false, supported = true) {
  const observations = [], effects = [], container = {}, changes = [];
  let loads = 0, retries = 0;
  const node = { closest: () => container };
  class Observer {
    constructor(callback, options) { this.callback = callback; this.options = options; observations.push(this); }
    observe(target) { this.node = target; }
    disconnect() { this.disconnected = true; }
  }
  const jsx = (type, props) => ({ type, props });
  const api = load('src/sections/LatestArticles.tsx', name => {
    if (name === 'react') return { memo: fn => fn, useRef: () => ({ current: node }), useEffect: effect => effects.push(effect) };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name.endsWith('LocaleContext')) return { useLocale: () => ({ t: key => key, formatDate: String, formatNumber: String, isRTL: false }) };
    if (name.endsWith('ThemeContext')) return { useTheme: () => ({ deviceMode: mobile ? 'mobile' : 'desktop' }) };
    return new Proxy({}, { get: (_, key) => String(key) });
  }, { IntersectionObserver: supported ? Observer : undefined, window: { getComputedStyle: () => ({ overflowY: mobile ? 'auto' : 'visible' }) } });
  const tree = api.LatestArticles({ newsletters: [], activeTab: 'latest', onTabChange: tab => changes.push(tab), isLoading: false, isLoadingMore: false, hasMore: true, error: null, onLoadMore: () => loads++, onRetry: () => retries++, ...props });
  const cleanups = effects.map(effect => effect());
  const find = (node, predicate) => Array.isArray(node) ? node.map(child => find(child, predicate)).find(Boolean) : node && typeof node === 'object' ? predicate(node) ? node : find(node.props?.children, predicate) : undefined;
  return { tree, container, node, observations, changes, find: predicate => find(tree, predicate), loads: () => loads, retries: () => retries, unmount: () => cleanups.forEach(cleanup => cleanup?.()) };
}

test('feed scroll loads near the end in desktop and mobile containers and disconnects on cleanup', () => {
  for (const mobile of [false, true]) {
    const h = feedComponent({}, mobile);
    const observer = h.observations[0];
    assert.equal(observer.options.root, mobile ? h.container : null);
    assert.equal(observer.options.rootMargin, '0px 0px 600px 0px'); assert.equal(observer.node, h.node);
    observer.callback([{ isIntersecting: false }]); assert.equal(h.loads(), 0);
    observer.callback([{ isIntersecting: true }]); assert.equal(h.loads(), 1);
    h.unmount(); assert.equal(observer.disconnected, true);
  }
});

test('loading and failures pause the observer; empty, skeleton, retry and tab states stay usable', () => {
  for (const props of [{ isLoading: true }, { isLoadingMore: true }, { error: 'Offline' }, { hasMore: false }]) assert.equal(feedComponent(props).observations.length, 0);
  const loading = feedComponent({ isLoading: true });
  assert.ok(loading.find(node => node.props?.role === 'status'));
  assert.equal(loading.find(node => node.props?.children === 'latest.empty'), undefined, 'pending data must not display an empty-archive message');
  const failed = feedComponent({ error: 'Offline' });
  failed.find(node => node.type === 'button' && node.props.children === 'latest.retry').props.onClick(); assert.equal(failed.retries(), 1);
  failed.find(node => node.type === 'button' && node.props.children === 'latest.tab.top').props.onClick(); assert.equal(failed.changes[0], 'top');
  const unsupported = feedComponent({}, false, false);
  unsupported.find(node => node.type === 'button' && node.props.children === 'latest.loadMore').props.onClick(); assert.equal(unsupported.loads(), 1, 'load more remains available without IntersectionObserver');
});
