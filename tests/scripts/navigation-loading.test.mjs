import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, require) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require, URLSearchParams });
  return exports;
}
const { QueryCache } = load('src/lib/query-cache.ts', () => ({}));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function serviceHarness(file) {
  let scope = 'alice|'; const requests = [], cache = new QueryCache();
  const pb = { authStore: { record: { id: 'alice' } }, send(path, options) { const task = deferred(); requests.push({ path, options, ...task }); return task.promise; }, collection: name => ({ delete: id => pb.send('/sdk/' + name + '/' + id, { method: 'DELETE' }) }) };
  const read = { readCache: cache, readScope: () => scope, cachedRead: (key, source, options) => cache.read(scope + key, source, options), peekRead: (key, age) => cache.peek(scope + key, age), invalidateReads: () => cache.invalidate() };
  const types = load('src/types/community.ts', () => ({}));
  const api = load(file, name => {
    if (name.endsWith('read-cache')) return read;
    if (name.endsWith('/client')) return { getPocketBase: () => pb, POCKETBASE_URL: '' };
    if (name.endsWith('/article-store')) return { forgetStoredArticle: () => Promise.resolve() };
    if (name.endsWith('/event-time') || name.endsWith('/newsletter-alignment')) return {};
    if (name.endsWith('/gantt')) return { normalizeProjectGantt: value => value };
    if (name.endsWith('/newsletters')) return { normalizeEvent: () => null, normalizePoll: () => null };
    if (name.endsWith('/community')) return types;
    throw new Error('Missing mock ' + name);
  });
  return { api, requests, cache, changeScope(next) { scope = next + '|'; }, scope: () => scope };
}

test('project list reads deduplicate and all project writes invalidate before and after persistence', async () => {
  const h = serviceHarness('src/lib/pocketbase/projects.ts');
  const first = h.api.fetchProjects(), shared = h.api.fetchProjects(); await tick();
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve({ items: [{ id: 'one', title: 'Original' }] });
  assert.equal((await first)[0].title, 'Original'); await shared;
  await h.api.fetchProjects(); assert.equal(h.requests.length, 1);
  const oldRead = h.api.fetchProjects({ force: true }); await tick();
  const write = h.api.updateProject('one', { title: 'Edited' });
  h.requests[1].resolve({ items: [{ id: 'one', title: 'Original' }] }); await oldRead;
  assert.equal(h.api.getCachedProjects(), undefined, 'a pre-write GET cannot repopulate the cache');
  h.requests[2].resolve({ id: 'one', title: 'Edited' }); await write;
  const fresh = h.api.fetchProjects(); await tick();
  h.requests[3].resolve({ items: [{ id: 'one', title: 'Edited' }] }); await fresh;
  assert.equal(h.api.getCachedProjects()[0].title, 'Edited');
  const remove = h.api.deleteProject('one');
  assert.equal(h.api.getCachedProjects(), undefined);
  assert.equal(h.requests[4].path, '/sdk/projects/one', 'deletion keeps its original SDK route and permissions');
  h.requests[4].resolve(true); await remove;
  assert.equal(h.api.getCachedProjects(), undefined);
});

test('project cache separates accounts and discards denied private revalidation', async () => {
  const h = serviceHarness('src/lib/pocketbase/projects.ts');
  const alice = h.api.fetchProjects(); await tick(); h.requests[0].resolve({ items: [{ id: 'alice-private' }] }); await alice;
  h.changeScope('bob'); assert.equal(h.api.getCachedProjects(), undefined);
  const bob = h.api.fetchProjects(); await tick(); h.requests[1].resolve({ items: [{ id: 'bob-private' }] }); await bob;
  const denied = h.api.fetchProjects({ force: true }); await tick(); h.requests[2].reject({ status: 403 }); await assert.rejects(denied);
  assert.equal(h.api.getCachedProjects(), undefined);
});

test('community hover reads cannot seed an obsolete feed or thread after a write', async () => {
  const h = serviceHarness('src/lib/pocketbase/community.ts');
  h.api.prefetchCommunityFeed('for-you'); h.api.prefetchCommunityThread('post'); await tick();
  h.cache.invalidate();
  h.requests[0].resolve({ items: [{ id: 'post', body: 'Obsolete' }] });
  h.requests[1].resolve({ post: { id: 'post', body: 'Obsolete' }, replies: [] }); await tick();
  assert.equal(h.api.peekCommunityPost('post'), undefined);
  assert.equal(h.api.peekCommunityThread('post'), undefined);
  assert.equal(h.cache.peek(h.scope() + 'community:list:feed:for-you'), undefined);
});

test('a denied community thread removes its cached body before a later visit', async () => {
  const h = serviceHarness('src/lib/pocketbase/community.ts');
  const first = h.api.fetchCommunityThread('post', { tree: true }); await tick();
  h.requests[0].resolve({ post: { id: 'post', body: 'Visible before denial' }, replies: [] }); await first;
  assert.equal(h.api.peekCommunityThread('post').post.body, 'Visible before denial');
  h.cache.invalidate(h.scope() + '/api/community/');
  const denied = h.api.fetchCommunityThread('post', { tree: true }); await tick();
  h.requests[1].reject({ status: 403 }); await assert.rejects(denied);
  assert.equal(h.api.peekCommunityThread('post'), undefined);
});

test('a denied newsletter revalidation removes its body from memory', async () => {
  const h = serviceHarness('src/lib/pocketbase/newsletters.ts');
  h.cache.set(h.scope() + 'newsletter:private', { id: 'private', content: 'Previously accessible body' });
  assert.ok(h.api.getCachedNewsletter('private'));
  const denied = h.api.fetchNewsletter('private', true); await tick();
  h.requests[0].reject({ status: 403 }); await assert.rejects(denied);
  assert.equal(h.api.getCachedNewsletter('private'), undefined);
});

test('newsletter stats reads deduplicate and subscription changes discard an older count', async () => {
  const h = serviceHarness('src/lib/pocketbase/subscribers.ts');
  const first = h.api.fetchNewsletterStats(), shared = h.api.fetchActiveSubscriberCount(); await tick();
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve({ activeSubscribers: 4, publishedNewsletters: 55 });
  assert.equal((await first).publishedNewsletters, 55); assert.equal(await shared, 4);
  const older = h.api.fetchNewsletterStats({ force: true }); await tick();
  const subscription = h.api.subscribeToNewsletter({ email: 'fixture@example.com', locale: 'en' });
  h.requests[1].resolve({ activeSubscribers: 4, publishedNewsletters: 55 }); await older;
  assert.equal(h.api.getCachedNewsletterStats(), undefined);
  h.requests[2].resolve({ status: 'subscribed' }); await subscription;
  const fresh = h.api.fetchNewsletterStats(); await tick();
  h.requests[3].resolve({ activeSubscribers: 5, publishedNewsletters: 55 }); await fresh;
  assert.equal(h.api.getCachedNewsletterStats().activeSubscribers, 5);
});

test('navigation intent prepares the same route component and starts its specific data in parallel', () => {
  const calls = [];
  const components = new Proxy({}, { get: (_, name) => ({ preload: () => calls.push(String(name)) }) });
  const types = load('src/types/community.ts', () => ({}));
  const routes = load('src/lib/community-routes.ts', () => types);
  const { preloadRoute } = load('src/lib/preload-route.ts', name => {
    if (name.endsWith('/client')) return { getPocketBase: () => ({ authStore: { isValid: false } }) };
    if (name.endsWith('route-components')) return components;
    if (name.endsWith('community-routes')) return routes;
    if (name.endsWith('screen-loaders')) return components;
    return { prefetchNewsletter: id => calls.push('article:' + id), prefetchCommunityFeed: tab => calls.push('feed:' + tab), prefetchCommunityThread: id => calls.push('post:' + id), fetchCommunityProfile: handle => { calls.push('profile:' + handle); return Promise.resolve(); }, fetchCommunityProfilePosts: (handle, options) => { calls.push('posts:' + handle + ':' + options.tab); return Promise.resolve(); } };
  });
  preloadRoute('/article/one%20two/title?foo=bar');
  assert.deepEqual(calls.splice(0), ['NewsletterViewer', 'article:one two']);
  preloadRoute('/community/post/p123');
  assert.deepEqual(calls.splice(0), ['CommunityPage', 'CommunityThreadScreen', 'post:p123']);
  preloadRoute('/community/following');
  assert.deepEqual(calls.splice(0), ['CommunityPage', 'feed:following']);
  preloadRoute('/community/u/Alice/replies');
  assert.deepEqual(calls.splice(0), ['CommunityPage', 'profile:alice', 'posts:alice:replies']);
  preloadRoute('/manager/projects'); preloadRoute('/gantt-editor/project-one');
  assert.deepEqual(calls.splice(0), ['ManagerDashboard', 'GanttEditorPage']);
  preloadRoute('/'); assert.equal(calls.length, 0);
});

test('home warming waits until rendering settles, cancels on navigation and respects data saver', () => {
  for (const idleSupported of [true, false]) {
    const exports = {}, calls = [], tasks = [];
    const window = { setTimeout: action => { tasks.push(action); return 1; }, clearTimeout() {} };
    if (idleSupported) { window.requestIdleCallback = action => { tasks.push(action); return 2; }; window.cancelIdleCallback = () => {}; }
    vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/navigation-warmup.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, navigator: {}, window, require: () => ({ preloadRoute: path => calls.push(path) }) });
    const cancel = exports.warmHomeNavigation('featured');
    assert.equal(calls.length, 0, 'home rendering does not start extra requests');
    tasks.shift()(); cancel(); tasks.splice(0).forEach(action => action());
    assert.deepEqual(calls, idleSupported ? [] : ['/article/featured', '/community']);
    calls.length = 0;
    exports.warmHomeNavigation('next'); while (tasks.length) tasks.shift()();
    assert.deepEqual(calls, ['/article/next', '/community']);
  }
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/navigation-warmup.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, navigator: { connection: { saveData: true } }, window: { setTimeout() { assert.fail('data saver must not schedule requests'); } }, require: () => ({}) });
  exports.warmHomeNavigation('featured')();
});
