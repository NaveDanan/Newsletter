import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function hookHarness(file, exportName, mocks, initialProps) {
  const slots = [], effects = [];
  let cursor = 0, dirty = true, props = initialProps, value;
  const same = (a, b) => a && b && a.length === b.length && a.every((item, i) => Object.is(item, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (next) => { const resolved = typeof next === 'function' ? next(slots[i]) : next; if (!Object.is(slots[i], resolved)) { slots[i] = resolved; dirty = true; } }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useCallback(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { deps, fn }; return slots[i].fn; },
    useMemo(fn, deps) { return react.useCallback(fn, deps)(); },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; });
    },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, } }).outputText, {
    exports, console: { ...console, error() {} }, require(name) {
      if (name === 'react') return react;
      if (name === 'sonner') return { toast: { error() {} } };
      if (name.endsWith('bootLogger')) return { bootLogger: { once: (_, fn) => fn(), step() {}, success() {}, error() {}, warn() {} } };
      if (mocks[name]) return mocks[name];
      if (mocks['*']) return mocks['*'](name);
      throw new Error('Missing mock: ' + name);
    },
  });
  function settle() {
    for (let i = 0; dirty || effects.length; i++) {
      assert.ok(i < 30, 'hook renders settle');
      if (dirty) { dirty = false; cursor = 0; value = exports[exportName](...props); }
      effects.splice(0).forEach((effect) => effect());
    }
    return value;
  }
  return { get value() { return settle(); }, change(next) { props = next; dirty = true; return settle(); }, async flush() { await new Promise((resolve) => setImmediate(resolve)); return settle(); }, unmount() { slots.forEach((slot) => slot?.cleanup?.()); } };
}
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const article = (id, contentLoaded = true) => ({ id, status: 'published', content: contentLoaded ? '<p>Complete article</p>' : '', contentLoaded, updatedAt: '1', commentItems: [], presentationFiles: [], presentationPreviews: [] });

function projectsHarness(initial) {
  let scope = 'alice', cached = initial;
  const reads = [], writes = [];
  const h = hookHarness('src/hooks/useProjects.ts', 'useProjects', {
    '../lib/pocketbase/projects': {
      getCachedProjects: () => cached, rememberProjects: items => { cached = items; },
      fetchProjects: opts => { const task = deferred(); reads.push({ opts, ...task }); return task.promise; },
      updateProjectStatusOnly: () => { const task = deferred(); writes.push(task); return task.promise; },
    },
    '@/lib/pocketbase/read-cache': { readScope: () => scope },
    '../lib/gantt': { normalizeProjectGantt: value => value },
  }, []);
  return { h, reads, writes, changeScope(next) { scope = next; cached = undefined; h.change([]); } };
}

test('project screens render cached rows immediately and revalidate in the background', async () => {
  const a = projectsHarness([{ id: 'one', title: 'Project', status: 'pending' }]);
  assert.equal(a.h.value.projects[0].title, 'Project');
  assert.equal(a.h.value.isLoading, false);
  assert.equal(a.reads[0].opts.force, true);
  a.reads[0].resolve([{ id: 'one', title: 'Updated project' }]); await a.h.flush();
  assert.equal(a.h.value.projects[0].title, 'Updated project');
  a.h.unmount();
});

test('a project refresh cannot undo an optimistic write or populate another account', async () => {
  const a = projectsHarness([{ id: 'one', status: 'pending' }]);
  a.h.value;
  const save = a.h.value.updateProjectStatus('one', 'completed');
  assert.equal(a.h.value.projects[0].status, 'completed');
  a.reads[0].resolve([{ id: 'one', status: 'pending' }]); await a.h.flush();
  assert.equal(a.h.value.projects[0].status, 'completed');
  a.changeScope('bob');
  a.writes[0].resolve({ id: 'one', status: 'completed' }); await save; await a.h.flush();
  assert.equal(a.h.value.projects.length, 0);
  a.reads[1].resolve([{ id: 'bobs', title: 'Bob’s project' }]); await a.h.flush();
  assert.equal(a.h.value.projects[0].id, 'bobs');
  a.h.unmount();
});

test('a denied project revalidation removes cached private rows', async () => {
  const a = projectsHarness([{ id: 'private' }]); a.h.value;
  a.reads[0].reject({ status: 403 }); await a.h.flush();
  assert.equal(a.h.value.projects.length, 0);
  assert.equal(a.h.value.isLoading, false);
  a.h.unmount();
});

test('manager stats include published newsletters without requesting the newsletter feed', async () => {
  const pending = deferred();
  const h = hookHarness('src/hooks/useSubscriberCount.ts', 'useSubscriberCount', {
    '@/lib/pocketbase/read-cache': { readScope: () => 'alice' },
    '@/lib/pocketbase/subscribers': { getCachedNewsletterStats: () => ({ activeSubscribers: 4, publishedNewsletters: 55 }), fetchNewsletterStats: () => pending.promise },
  }, []);
  assert.equal(h.value.subscriberCount, 4); assert.equal(h.value.publishedNewsletterCount, 55);
  pending.resolve({ activeSubscribers: 5, publishedNewsletters: 56 }); await h.flush();
  assert.equal(h.value.publishedNewsletterCount, 56); h.unmount();
});

function newslettersHarness(options = {}) {
  let scope = 'anonymous', list = options.list;
  const reads = [], mutations = [];
  const api = {
    getCachedNewsletters: () => list,
    getCachedNewsletter: () => undefined,
    getStoredNewsletter: async () => options.stored,
    rememberNewsletters: (items) => { list = items; },
    fetchNewsletters: (opts) => { const task = deferred(); reads.push({ kind: 'list', opts, ...task }); return task.promise; },
    fetchNewsletter: (id) => { const task = deferred(); reads.push({ kind: 'article', id, ...task }); return task.promise; },
    patchNewsletter: () => { const task = deferred(); mutations.push(task); return task.promise; },
  };
  const props = { currentUser: { id: 'alice' }, currentUserRole: 'admin', enabled: true, ...options.props };
  const h = hookHarness('src/hooks/useNewsletters.ts', 'useNewsletters', {
    '@/lib/pocketbase/newsletters': api,
    '@/lib/pocketbase/read-cache': { readScope: () => scope },
    '@/lib/auth/permissions': { canEditNewsletter: () => true, canDeleteNewsletter: () => true, canCreateNewsletter: () => true },
    '@/lib/comment-formatting': { stripCommentFormatting: (body) => body },
  }, [props]);
  return { h, reads, mutations, props, changeScope(next) { scope = next; list = undefined; h.change([{ ...props, currentUser: { id: next } }]); } };
}

test('direct article loads start only its own request and reuse public content while validating it', async () => {
  const a = newslettersHarness({ stored: article('one'), props: { articleId: 'one' } });
  assert.equal(a.h.value.isLoaded, false);
  assert.deepEqual(a.reads.map((read) => [read.kind, read.id]), [['article', 'one']]);
  await a.h.flush();
  assert.equal(a.h.value.newsletters[0].content, '<p>Complete article</p>');
  assert.equal(a.h.value.isLoaded, false, 'cached content does not imply that access was validated');
  a.reads[0].reject({ status: 403 }); await a.h.flush();
  assert.equal(a.h.value.newsletters.length, 0, 'denied cached content is removed');
  assert.equal(a.h.value.isLoaded, true);
});

test('leaving newsletter routes preserves the feed; Back renders it while revalidating', async () => {
  const a = newslettersHarness({ list: [article('one', false)] });
  assert.equal(a.h.value.newsletters.length, 1);
  a.reads[0].resolve([article('one', false)]); await a.h.flush();
  a.h.change([{ ...a.props, enabled: false }]);
  assert.equal(a.h.value.newsletters.length, 1);
  assert.equal(a.reads.length, 1, 'unrelated routes request no newsletter data');
  a.h.change([a.props]);
  assert.equal(a.h.value.newsletters.length, 1);
  assert.equal(a.reads.length, 2);
  a.h.unmount();
});

test('late reads, refreshes and mutations cannot populate another account', async () => {
  const a = newslettersHarness({ list: [article('private')] });
  a.h.value;
  const refresh = a.h.value.refreshNewsletters();
  const edit = a.h.value.updateNewsletter('private', { title: 'Edited' });
  a.changeScope('bob');
  assert.equal(a.h.value.newsletters.length, 0);
  a.reads[0].resolve([article('private')]); a.reads[1].resolve([article('private')]);
  a.mutations[0].resolve(article('private')); await Promise.all([refresh, edit]); await a.h.flush();
  assert.equal(a.h.value.newsletters.length, 0);
  a.h.unmount();
});

test('switching community feeds ignores an older page and restores the correct cached feed', async () => {
  let scope = 'alice'; const pending = [], cached = new Map();
  const source = () => { const task = deferred(); pending.push(task); return task.promise; };
  const h = hookHarness('src/hooks/useCommunityPosts.ts', 'useCommunityPosts', {
    '@/lib/pocketbase/community': { getPocketBaseErrorMessage: (_, fallback) => fallback },
    '@/lib/pocketbase/read-cache': { readScope: () => scope, peekRead: (key) => cached.get(scope + key), readCache: { set: (key, value) => cached.set(key, value) } },
  }, [source, { cacheKey: 'for-you' }]);
  h.value; h.change([source, { cacheKey: 'following' }]);
  pending[0].resolve({ items: [{ id: 'wrong-feed' }], cursor: '', hasMore: false }); await h.flush();
  assert.equal(h.value.posts.length, 0);
  pending[1].resolve({ items: [{ id: 'following-post' }], cursor: '', hasMore: false }); await h.flush();
  assert.equal(h.value.posts[0].id, 'following-post');
  scope = 'bob'; h.change([source, { cacheKey: 'following' }]);
  assert.equal(h.value.posts.length, 0, 'another account cannot use Alice’s feed');
  h.unmount();
});

test('community session changes with identity and discards the previous account’s pending response', async () => {
  let scope = 'alice', user = { id: 'alice' }; const pending = [];
  const h = hookHarness('src/hooks/useCommunitySession.ts', 'useCommunitySession', {
    '@/contexts/AuthContext': { useAuth: () => ({ user }) },
    '@/lib/pocketbase/read-cache': { readScope: () => scope },
    '@/lib/pocketbase/community': { fetchCommunitySession: () => { const task = deferred(); pending.push(task); return task.promise; }, getPocketBaseErrorMessage: (_, fallback) => fallback },
  }, [true]);
  h.value; scope = 'bob'; user = { id: 'bob' }; h.change([true]);
  assert.equal(pending.length, 2);
  pending[0].resolve({ profile: { userId: 'alice', handle: 'alice' } }); await h.flush();
  assert.equal(h.value.profile.userId, 'bob');
  pending[1].resolve({ profile: { userId: 'bob', handle: 'bob' } }); await h.flush();
  assert.equal(h.value.session.profile.userId, 'bob');
  h.unmount();
});

test('a pending community feed cannot remove a new post or undo an engagement update', async () => {
  let scope = 'alice'; const pending = [];
  const source = () => { const task = deferred(); pending.push(task); return task.promise; };
  const h = hookHarness('src/hooks/useCommunityPosts.ts', 'useCommunityPosts', {
    '@/lib/pocketbase/community': { getPocketBaseErrorMessage: (_, fallback) => fallback },
    '@/lib/pocketbase/read-cache': { readScope: () => scope, peekRead: () => ({ items: [{ id: 'one', likeCount: 0, quotedPost: null }], cursor: '', hasMore: false }), readCache: { set() {} } },
  }, [source, { cacheKey: 'for-you' }]);
  h.value.prependPost({ id: 'new', quotedPost: null });
  h.value.patchPost('one', { likeCount: 1 });
  pending[0].resolve({ items: [{ id: 'one', likeCount: 0, quotedPost: null }, { id: 'arrived', quotedPost: null }], cursor: 'next-page', hasMore: true }); await h.flush();
  assert.equal(h.value.posts[0].id, 'new');
  assert.equal(h.value.posts[1].likeCount, 1);
  assert.equal(h.value.posts[2].id, 'arrived', 'preserve the remaining fetched page while applying local changes');
  assert.equal(h.value.hasMore, true);
  assert.equal(h.value.isLoading, false);
  const oldAction = h.value.prependPost;
  scope = 'bob'; h.change([source, { cacheKey: 'for-you' }]);
  oldAction({ id: 'alice-private' });
  assert.equal(h.value.posts.some(item => item.id === 'alice-private'), false);
  h.unmount();
});

test('a thread refresh retains immediate likes and new replies while loading the rest of the conversation', async () => {
  const pending = deferred(); let actions;
  const t = key => key;
  const post = { id: 'one', likeCount: 0, replyCount: 0, quotedPost: null };
  const jsx = (type, props) => ({ type, props });
  const h = hookHarness('src/sections/community/CommunityThreadScreen.tsx', 'CommunityThreadScreen', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/contexts/LocaleContext': { useLocale: () => ({ t }) },
    './CommunityContext': { useCommunity: () => ({ isAuthenticated: true, navigate() {}, requireAuth() {} }) },
    '@/lib/pocketbase/read-cache': { readScope: () => 'alice' },
    '@/lib/pocketbase/community': { peekCommunityThread: () => ({ post, ancestors: [], replies: [], hasMore: false, cursor: '' }), fetchCommunityThread: () => pending.promise },
    '@/hooks/useCommunityEngagement': { useCommunityEngagement: options => { actions = options; return options; } },
    '@/lib/lazy-component': { lazyComponent: () => 'CommunityComposer' },
    '@/lib/community-comments': { buildCommentTree: replies => replies.map(comment => ({ comment, children: [] })) },
    '*': () => new Proxy({}, { get: (_, key) => String(key) }),
  }, [{ postId: 'one' }]);
  function find(node, predicate) {
    if (Array.isArray(node)) return node.map(item => find(item, predicate)).find(Boolean);
    if (!node || typeof node !== 'object') return undefined;
    return predicate(node) ? node : find(node.props?.children, predicate);
  }
  h.value;
  actions.patchPost('one', { likeCount: 1 });
  find(h.value, node => node.type === 'CommunityComposer').props.onPosted({ id: 'new-reply', parentId: 'one', quotedPost: null });
  pending.resolve({ post: { ...post, replyCount: 1 }, ancestors: [{ id: 'ancestor' }], replies: [{ id: 'fetched-reply', parentId: 'one' }], hasMore: false, cursor: '' }); await h.flush();
  const card = find(h.value, node => node.props?.variant === 'detail');
  assert.equal(card.props.post.likeCount, 1);
  assert.equal(card.props.post.replyCount, 2);
  assert.ok(find(h.value, node => node.props?.post?.id === 'ancestor'));
  assert.ok(find(h.value, node => node.props?.node?.comment.id === 'fetched-reply'));
  assert.ok(find(h.value, node => node.props?.node?.comment.id === 'new-reply'));
  h.unmount();
});

test('disabled or inaccessible IndexedDB never breaks article loading', async () => {
  for (const indexedDB of [undefined, { open() { throw new Error('Storage denied'); } }]) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/article-store.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, } }).outputText, { exports, indexedDB });
    assert.equal(await exports.readStoredArticle('public'), undefined);
    await exports.storePublicArticle('public', { ...article('one'), coverImage: '' });
    await exports.forgetStoredArticle('public');
  }
});

test('stored feed summaries omit heavy bodies and preserve covers that cannot use the binary endpoint', () => {
  const exports = {}, storage = new Map();
  let memory;
  vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/pocketbase/newsletters.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, } }).outputText, {
    exports, sessionStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    require: (name) => name === './read-cache' ? {
      readScope: () => 'backend|anonymous|', peekRead: () => memory,
      readCache: { set: (_, value) => { memory = value; }, prime: (_, value) => { memory ??= value; } },
    } : {},
  });
  const covers = ['data:image/png;base64,AP+A', 'data:image/svg+xml;base64,PHN2Zz4=', 'https://example.com/cover.jpg'];
  const items = covers.map((coverImage, index) => ({ ...article(String(index)), coverImage, content: '<p>Searchable text</p><img src="data:image/png;base64,' + 'x'.repeat(100_000) + '">', commentItems: [{ body: 'Reply' }], presentationFiles: ['deck.pptx'] }));
  exports.rememberNewsletters(items);
  const serialized = [...storage.values()][0];
  assert.ok(serialized.length < 2_000);
  memory = undefined;
  const cached = exports.getCachedNewsletters();
  assert.equal(cached[0].content, ''); assert.equal(cached[0].contentLoaded, false);
  assert.equal(cached[0].searchText, 'Searchable text'); assert.equal(cached[0].commentItems.length, 0);
  assert.equal(cached[0].coverImage, '/api/newsletters/0/cover?v=1');
  assert.equal(cached[1].coverImage, covers[1]); assert.equal(cached[2].coverImage, covers[2]);
});
