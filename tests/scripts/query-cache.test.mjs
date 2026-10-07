import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../src/lib/query-cache.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports });
const { QueryCache } = exports;

test('concurrent initial reads and forced refreshes share one request', async () => {
  const cache = new QueryCache(); let calls = 0, finish;
  const load = () => { calls++; return new Promise((resolve) => { finish = resolve; }); };
  const first = cache.read('public:list', load);
  const second = cache.read('public:list', load, { force: true });
  await Promise.resolve(); assert.equal(calls, 1);
  finish(['article']); assert.deepEqual(await first, await second);
  assert.deepEqual(await cache.read('public:list', load), ['article']);
  assert.equal(calls, 1);
});

test('invalidated or replaced pending reads cannot restore obsolete data', async () => {
  for (const mutation of ['invalidate', 'set']) {
    const cache = new QueryCache(); let finish;
    const pending = cache.read('user:list', () => new Promise((resolve) => { finish = resolve; }));
    await Promise.resolve();
    if (mutation === 'set') cache.set('user:list', 'edited'); else cache.invalidate('user:');
    finish('old'); await pending;
    assert.equal(cache.peek('user:list'), mutation === 'set' ? 'edited' : undefined);
  }
});

test('different accounts and URLs remain separate; expiration and retry recover normally', async () => {
  let now = 0; const cache = new QueryCache(64, () => now);
  cache.set('backendA|alice|list', 'private draft');
  assert.equal(cache.peek('backendA|bob|list'), undefined);
  assert.equal(cache.peek('backendB|alice|list'), undefined);
  now = 31_000; assert.equal(cache.peek('backendA|alice|list'), undefined);
  await assert.rejects(cache.read('retry', async () => { throw new Error('offline'); }), /offline/);
  assert.equal(await cache.read('retry', async () => 'online'), 'online');
});

test('recent reads survive bounded eviction and background refresh can expose the prior value', async () => {
  const cache = new QueryCache(2);
  cache.set('a', 1); cache.set('b', 2); cache.peek('a'); cache.set('c', 3);
  assert.equal(cache.peek('b'), undefined);
  let finish; const pending = cache.read('a', () => new Promise((resolve) => { finish = resolve; }), { force: true });
  assert.equal(cache.peek('a'), 1);
  await Promise.resolve(); finish(4); await pending;
  assert.equal(cache.peek('a'), 4);
});

test('hydrating stored content preserves the shared in-flight validation request', async () => {
  const cache = new QueryCache(); let calls = 0, finish;
  const load = () => { calls++; return new Promise((resolve) => { finish = resolve; }); };
  const initial = cache.read('public:list', load);
  cache.prime('public:list', 'stored');
  assert.equal(cache.peek('public:list'), 'stored');
  const hook = cache.read('public:list', load, { force: true });
  await Promise.resolve(); assert.equal(calls, 1);
  finish('fresh'); await Promise.all([initial, hook]);
  assert.equal(cache.peek('public:list'), 'fresh');
});
