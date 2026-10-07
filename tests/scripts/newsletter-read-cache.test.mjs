import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function harness() {
  let now = 0, generation = 0;
  const values = new Map();
  const store = { get: (key) => values.get(key), set: (key, value) => values.set(key, value), remove: (key) => values.delete(key), setFunc: (key, fn) => values.set(key, fn(values.get(key))) };
  const sandbox = { module: { exports: {} }, Date: { now: () => now }, $security: { randomString: () => String(++generation) } };
  vm.runInNewContext(readFileSync('pb_hooks/lib/newsletter-read-cache.js', 'utf8'), sandbox);
  return { ...sandbox.module.exports, app: { store: () => store }, values, advance: (time) => { now += time; } };
}

test('summary cache separates identities and queries, expires, and invalidates on writes', () => {
  const h = harness(); let calls = 0;
  const load = () => ++calls;
  assert.equal(h.read(h.app, 'public-page1', load), 1);
  assert.equal(h.read(h.app, 'public-page1', load), 1);
  assert.equal(h.read(h.app, 'author-page1', load), 2);
  assert.equal(h.read(h.app, 'public-page2', load), 3);
  h.advance(5001);
  assert.equal(h.read(h.app, 'public-page1', load), 4);
  h.invalidate(h.app);
  assert.equal(h.read(h.app, 'public-page1', load), 5);
});

test('a write racing a read prevents that read from becoming a fresh cache entry', () => {
  const h = harness();
  assert.equal(h.read(h.app, 'public', () => { h.invalidate(h.app); return 'old'; }), 'old');
  assert.equal(h.read(h.app, 'public', () => 'new'), 'new');
  h.invalidate(h.app); h.invalidate(h.app);
  assert.equal(h.read(h.app, 'public', () => 'latest'), 'latest');
});

test('many query variants cannot grow the cache beyond its limit', () => {
  const h = harness();
  for (let i = 0; i < 200; i++) h.read(h.app, String(i), () => i);
  assert.equal([...h.values.keys()].filter((key) => !key.endsWith(':keys')).length, 64);
  assert.equal(h.read(h.app, '0', () => 'refetched'), 'refetched');
  assert.equal(h.read(h.app, '199', () => 'unneeded'), 199);
});
