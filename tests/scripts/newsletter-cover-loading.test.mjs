import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function harness(newsletter) {
  let image, scope = 'alice', intersect, cleanup, revoked = 0;
  const requests = [], effects = [];
  const exports = {};
  const react = { useRef: () => ({ current: {} }), useState: () => [image, (next) => { image = next; }], useEffect: (fn) => effects.push(fn) };
  const mocks = {
    react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    '@/lib/pocketbase/client': { getPocketBase: () => ({ baseURL: 'https://backend.test', authStore: { token: 'test-only-token' } }) },
    '@/lib/pocketbase/read-cache': { readScope: () => scope, cachedRead: (_, load) => load() },
  };
  vm.runInNewContext(ts.transpileModule(readFileSync('src/components/newsletter/NewsletterCoverImage.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, require: (name) => mocks[name], fetch: (url, options) => new Promise((resolve) => requests.push({ url, options, resolve })),
    URL: { createObjectURL: () => 'blob:draft', revokeObjectURL: () => revoked++ },
    IntersectionObserver: class { constructor(callback) { intersect = () => callback([{ isIntersecting: true }]); } observe() {} disconnect() {} },
  });
  const render = () => exports.NewsletterCoverImage({ newsletter });
  const initial = render(); cleanup = effects.pop()();
  return { initial, render, intersect: () => intersect(), requests, changeScope: () => { scope = 'bob'; }, cleanup: () => cleanup?.(), revoked: () => revoked };
}

test('draft thumbnails stay lazy and send authorization only to the newsletter cover endpoint', async () => {
  const h = harness({ id: 'draft', title: 'Draft', status: 'draft', coverImage: '/api/newsletters/draft/cover?v=1' });
  assert.equal(h.initial.props.src, undefined); assert.equal(h.requests.length, 0);
  h.intersect(); assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].url, 'https://backend.test/api/newsletters/draft/cover?v=1');
  assert.equal(h.requests[0].options.headers.Authorization, 'test-only-token');
  h.requests[0].resolve({ ok: true, blob: async () => ({}) }); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.render().props.src, 'blob:draft');
  h.cleanup(); assert.equal(h.revoked(), 1);
});

test('a late private thumbnail cannot appear after account changes', async () => {
  const h = harness({ id: 'draft', status: 'draft', coverImage: '/api/newsletters/draft/cover' });
  h.intersect(); h.changeScope(); h.requests[0].resolve({ ok: true, blob: async () => ({}) }); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.render().props.src, undefined);
  assert.equal(h.revoked(), 0);
});

test('published images and unrelated remote covers use normal lazy images without sending credentials', () => {
  for (const newsletter of [{ id: 'public', status: 'published', coverImage: '/api/newsletters/public/cover?v=1' }, { id: 'draft', status: 'draft', coverImage: 'https://elsewhere.test/api/newsletters/draft/cover?v=1' }]) {
    const h = harness(newsletter);
    assert.equal(h.initial.props.src, newsletter.coverImage);
    assert.equal(h.requests.length, 0);
  }
});
