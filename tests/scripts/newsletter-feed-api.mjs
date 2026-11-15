// Exercise the real production hooks against a disposable local database.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import PocketBase from 'pocketbase';
import { APP_COLLECTION_SCHEMAS } from '../../scripts/pocketbase/app-schema.mjs';
import { buildUsersCollectionUpdate } from '../../scripts/pocketbase/users-schema.mjs';

const binary = process.env.NEWSLETTER_TEST_PB_BINARY || 'pocketbase';
await mkdir('.tmp', { recursive: true });
const directory = await mkdtemp(path.resolve('.tmp/newsletter-feed-test-'));
const args = [`--dir=${path.join(directory, 'pb_data')}`, `--hooksDir=${path.resolve('pb_hooks')}`, `--migrationsDir=${path.join(directory, 'pb_migrations')}`];
const email = 'feed-test@example.com', password = 'test-only-password-12345';
const port = Number(process.env.NEWSLETTER_TEST_PORT || 17115);
const origin = `http://127.0.0.1:${port}`;
const root = new PocketBase(origin); root.autoCancellation(false);
let server, logs = '';
async function stop() {
  if (server && server.exitCode === null) { server.kill('SIGTERM'); await once(server, 'exit'); }
}
async function start() {
  server = spawn(binary, ['serve', `--http=127.0.0.1:${port}`, ...args], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, APP_ROOT: process.cwd() } });
  server.stdout.on('data', chunk => { logs += chunk; });
  server.stderr.on('data', chunk => { logs += chunk; });
  for (let i = 0; i < 100; i++) {
    try { await root.health.check(); await root.collection('_superusers').authWithPassword(email, password); return; }
    catch { if (server.exitCode !== null) throw new Error(logs); await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  throw new Error('Disposable PocketBase did not become healthy: ' + logs);
}
const get = (client, params = {}) => client.send('/api/newsletters?' + new URLSearchParams({ view: 'summary', compact: '1', status: 'published', feed: 'latest', perPage: '10', ...params }), { requestKey: null });
try {
  const init = spawnSync(binary, ['superuser', 'upsert', email, password, ...args], { encoding: 'utf8' });
  if (init.status !== 0) throw new Error('Set NEWSLETTER_TEST_PB_BINARY to a PocketBase 0.36.9 binary. ' + init.stderr);
  await start();
  for (const schema of APP_COLLECTION_SCHEMAS) await root.collections.create(schema);
  const users = await root.collections.getOne('users');
  await root.collections.update(users.id, buildUsersCollectionUpdate(users.fields));
  const account = await root.collection('users').create({ email: 'feed-viewer@example.com', password, passwordConfirm: password, name: 'Reader', role: 'viewer', verified: true });
  const author = await root.collection('users').create({ email: 'feed-author@example.com', password, passwordConfirm: password, name: 'Author', role: 'author', verified: true });
  const records = [];
  for (let i = 1; i <= 24; i++) {
    records.push(await root.collection('newsletters').create({
      title: i === 1 ? "O'Reilly 100% && ||" : `Newsletter ${i}`,
      subtitle: 'Preview', author: 'Writer', status: 'published', publishedAt: `2026-10-${String(i).padStart(2, '0')}`,
      content: '<p>' + 'Article word '.repeat(3000) + (i === 1 ? ' archivedbodykeyword' : '') + '</p><img src="data:image/png;base64,' + 'A'.repeat(100_000) + '">',
      coverImage: 'data:image/png;base64,AP+A', likes: i === 1 ? 80 : i === 2 ? 20 : i, comments: i === 2 ? 100 : i, shares: i === 2 ? 100 : 0,
      bookmarkedByUserIds: i <= 2 ? [account.id] : [], tags: ['AI'], createdById: author.id,
    }));
  }
  await root.collection('newsletters').create({ title: 'Private draft', content: '<p>archivedbodykeyword</p>', status: 'draft', createdById: author.id, publishedAt: '2026-11-11' });
  // Startup installs the feed ordering index on the now-populated collection.
  await stop(); await start();
  const collection = await root.collections.getOne('newsletters');
  assert.ok(collection.indexes.some(index => index.includes('idx_newsletters_feed_latest')));
  const anonymous = new PocketBase(origin); anonymous.autoCancellation(false);
  const viewer = new PocketBase(origin); viewer.autoCancellation(false);
  await viewer.collection('users').authWithPassword('feed-viewer@example.com', password);
  const writer = new PocketBase(origin); writer.autoCancellation(false);
  await writer.collection('users').authWithPassword('feed-author@example.com', password);
  const first = await get(anonymous);
  assert.equal(first.items.length, 10); assert.equal(first.totalItems, 24); assert.equal(first.totalPages, 3);
  assert.deepEqual(first.items.map(item => item.id), records.slice(-10).reverse().map(item => item.id));
  for (const item of first.items) for (const field of ['content', 'searchText', 'commentItems', 'poll', 'event', 'likedByUserIds', 'bookmarkedByUserIds']) assert.equal(item[field], undefined);
  const bytes = Buffer.byteLength(JSON.stringify(first));
  assert.ok(bytes < 20_000, 'first batch contains only small previews');
  const second = await get(anonymous, { page: '2' }), third = await get(anonymous, { page: '3' });
  assert.equal(second.items.length, 10); assert.equal(third.items.length, 4);
  assert.equal(new Set([...first.items, ...second.items, ...third.items].map(item => item.id)).size, 24);
  assert.equal((await get(anonymous, { page: '4' })).items.length, 0);
  assert.equal((await get(writer)).totalItems, 24, 'even authors see only published articles in the home feed');
  const search = await get(anonymous, { q: 'ARCHIVEDBODYKEYWORD' });
  assert.equal(search.totalItems, 1); assert.equal(search.items[0].id, records[0].id, 'body search finds an article beyond the initial page');
  assert.equal((await get(anonymous, { q: "O'Reilly 100% && ||" })).totalItems, 1, 'quotes, SQL wildcards and filter syntax are literal search text');
  assert.equal((await get(anonymous, { q: "' OR 1=1 --" })).totalItems, 0);
  assert.equal((await get(anonymous, { q: 'archivedbodykeyword Writer' })).totalItems, 1, 'all terms match across body and author');
  assert.equal((await get(viewer, { feed: 'bookmarks' })).totalItems, 2);
  assert.equal((await get(writer, { feed: 'bookmarks' })).totalItems, 0);
  assert.equal((await get(anonymous, { feed: 'bookmarks' })).totalItems, 0);
  const expectedTop = [...records].sort((a, b) => (b.likes + b.comments + b.shares) - (a.likes + a.comments + a.shares));
  assert.equal((await get(anonymous, { feed: 'top' })).items[0].id, expectedTop[0].id);
  assert.equal((await get(anonymous, { feed: 'discussions' })).items[0].id, records[1].id);
  await assert.rejects(get(anonymous, { feed: 'invalid' }), error => error.status === 400);
  const latest = await root.collection('newsletters').create({ title: 'Just published', content: '<p>Fresh</p>', status: 'published', publishedAt: '2026-11-11' });
  const refreshed = await get(anonymous);
  assert.equal(refreshed.totalItems, 25); assert.equal(refreshed.items[0].id, latest.id, 'writes invalidate the cached page and count');
  console.log(`PASS: real PocketBase returns 10/10/4 previews (${bytes} bytes initially), stable ordering, archived body search, isolated bookmarks, global rankings, published-only visibility, and fresh counts after writes.`);
} catch (error) {
  console.error(error, error.response || '', logs.slice(-4000));
  process.exitCode = 1;
} finally {
  await stop(); await rm(directory, { recursive: true, force: true });
}
