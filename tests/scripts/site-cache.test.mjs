import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const WRITERS_KEY = 'site:writers';
const GENERATION_KEY = WRITERS_KEY + ':generation';

function record(id, fields) {
  return {
    id,
    getString: (name) => String(fields[name] ?? ''),
    getBool: (name) => Boolean(fields[name]),
  };
}

function fixture() {
  const stored = new Map();
  let now = 100_000, queries = 0, token = 0;
  let featured = true, suspended = false;
  const interleaving = { get: null, set: null, query: null };
  const store = {
    get(key) {
      const value = stored.get(key);
      interleaving.get?.(key, value);
      return value;
    },
    set(key, value) {
      interleaving.set?.(key, value);
      stored.set(key, value);
    },
  };
  const core = {
    asText: (value) => String(value ?? ''),
    uniqueStrings: (values) => [...new Set(values)],
    buildInFilter: (_field, ids) => ({ filter: '', params: { ids } }),
    profileAvatarUrl: () => '',
    fileUrl: () => '',
    clampPageSize: (value, fallback, max) => Math.max(1, Math.min(Number(value) || fallback, max)),
    truncate: (value, limit) => value.slice(0, limit),
    trimBody: (value) => value.trim(),
  };
  const app = {
    store: () => store,
    findRecordsByFilter(collection, filter) {
      queries++;
      interleaving.query?.(collection, filter);
      if (collection === 'users') {
        if (filter === 'featuredWriter = true' && !featured) return [];
        return [record('writer', { name: 'Writer', created: '2026-09-01 10:00:00Z' })];
      }
      if (collection === 'community_profiles') {
        return [record('profile', { userId: 'writer', displayName: 'Writer', handle: 'writer', isSuspended: suspended })];
      }
      return [];
    },
  };
  const sandbox = {
    module: { exports: {} },
    __hooks: '/hooks',
    require: () => core,
    Date: class extends Date { static now() { return now; } },
    $security: { randomString: () => `generation-${++token}` },
  };
  vm.runInNewContext(readFileSync(new URL('../../pb_hooks/lib/site.js', import.meta.url), 'utf8'), sandbox);
  const site = sandbox.module.exports;
  return {
    app, core, site, store, stored, interleaving,
    writers: () => site.listFeaturedWriters(app),
    activity: (limit) => site.listRecentActivity({ app, requestInfo: () => ({ query: { limit } }) }),
    advance: (milliseconds) => { now += milliseconds; },
    unfeature: () => { featured = false; },
    suspend: () => { suspended = true; },
    queries: () => queries,
  };
}

test('a writer invalidated between the final generation check and cache write is absent on the next request', () => {
  for (const change of ['unfeature', 'suspend']) {
    const f = fixture();
    f.interleaving.set = (key, entry) => {
      if (key !== WRITERS_KEY || !entry.expiresAt) return;
      f.interleaving.set = null;
      f[change]();
      f.site.invalidateWriters(f.app);
    };
    assert.equal(f.writers().items.length, 1, 'the already-running request can finish with its earlier rows');
    assert.equal(f.writers().items.length, 0, `${change} must invalidate a write that raced the update`);
  }
});

test('a refresh claim racing invalidation does not promote old writer rows into the new generation', () => {
  const f = fixture();
  f.writers();
  f.advance(60_001);
  let concurrentResult;
  f.interleaving.set = (key, entry) => {
    if (key !== WRITERS_KEY || !entry.refreshingUntil) return;
    f.interleaving.set = null;
    f.unfeature();
    f.site.invalidateWriters(f.app);
  };
  f.interleaving.query = () => {
    f.interleaving.query = null;
    concurrentResult = f.writers();
  };
  assert.equal(f.writers().items.length, 0);
  assert.equal(concurrentResult.items.length, 0, 'a new request cannot use the old refresh claim after invalidation');
});

test('fresh hits avoid queries and expired values are served while their same-generation refresh runs', () => {
  const f = fixture();
  assert.equal(f.writers().items.length, 1);
  const initialQueries = f.queries();
  f.advance(59_999);
  assert.equal(f.writers().items.length, 1);
  assert.equal(f.queries(), initialQueries);
  f.advance(2);
  let concurrentResult;
  f.interleaving.query = () => {
    f.interleaving.query = null;
    const before = f.queries();
    concurrentResult = f.writers();
    assert.equal(f.queries(), before, 'same-generation stale requests do not start another refresh');
  };
  assert.equal(f.writers().items.length, 1);
  assert.equal(concurrentResult.items.length, 1);
  assert.ok(f.queries() > initialQueries);
});

test('overlapping invalidations receive distinct generations', () => {
  const f = fixture();
  f.writers();
  let nestedGeneration;
  f.interleaving.set = (key) => {
    if (key !== GENERATION_KEY) return;
    f.interleaving.set = null;
    f.site.invalidateWriters(f.app);
    nestedGeneration = f.stored.get(GENERATION_KEY);
  };
  f.site.invalidateWriters(f.app);
  assert.notEqual(f.stored.get(GENERATION_KEY), nestedGeneration, 'two updates must not reuse a generation after racing get/set');
});

test('a failed refresh releases its claim after five seconds so a later request can retry', () => {
  const f = fixture();
  f.writers();
  f.advance(60_001);
  const buildInFilter = f.core.buildInFilter;
  f.core.buildInFilter = () => { throw new Error('temporary identity lookup failure'); };
  assert.throws(f.writers, /temporary identity lookup failure/);
  f.core.buildInFilter = buildInFilter;
  const before = f.queries();
  assert.equal(f.writers().items.length, 1, 'the same-generation stale value remains available during the claim');
  assert.equal(f.queries(), before);
  f.advance(5_001);
  assert.equal(f.writers().items.length, 1);
  assert.ok(f.queries() > before, 'an abandoned refresh claim cannot stop later retries');
});

test('startup empty results cache normally, and activity limits keep separate entries and TTLs', () => {
  const f = fixture();
  f.unfeature();
  assert.equal(f.writers().items.length, 0);
  const afterWriters = f.queries();
  f.writers();
  assert.equal(f.queries(), afterWriters);
  assert.equal(f.activity(5).items.length, 1);
  const afterFive = f.queries();
  f.activity(5);
  assert.equal(f.queries(), afterFive);
  f.activity(10);
  assert.ok(f.queries() > afterFive, 'different page limits use separate cache entries');
  const afterTen = f.queries();
  f.advance(10_001);
  f.activity(5);
  assert.ok(f.queries() > afterTen);
  const afterRefresh = f.queries();
  f.writers();
  assert.equal(f.queries(), afterRefresh, 'activity expiry does not shorten the writers TTL');
});
