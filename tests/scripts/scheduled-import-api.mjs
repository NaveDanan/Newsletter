// Run against a disposable PocketBase instance with the app schema and import worker.
// The worker's Artifactory endpoint must contain the three sample DOCX collections.
import assert from 'node:assert/strict';
import PocketBase from 'pocketbase';
import { APP_COLLECTION_SCHEMAS } from '../../scripts/pocketbase/app-schema.mjs';

const url = process.env.IMPORT_TEST_PB_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Set IMPORT_TEST_PB_URL to a disposable local PocketBase instance.');
const root = new PocketBase(url);
await root.collection('_superusers').authWithPassword('import-test@example.com', 'test-only-password-12345');
for (const schema of APP_COLLECTION_SCHEMAS) {
  try { await root.collections.getOne(schema.name); } catch { await root.collections.create(schema); }
}
const users = await root.collections.getOne('users');
if (!users.fields.some((f) => f.name === 'role')) await root.collections.update(users.id, { fields: [...users.fields, { name: 'role', type: 'text' }] });
for (const role of ['admin', 'viewer']) {
  try { await root.collection('users').getFirstListItem(`email = "${role}@example.com"`); }
  catch { await root.collection('users').create({ email: `${role}@example.com`, password: 'test-only-password-12345', passwordConfirm: 'test-only-password-12345', role, verified: true }); }
}
const admin = new PocketBase(url), viewer = new PocketBase(url), anonymous = new PocketBase(url);
await admin.collection('users').authWithPassword('admin@example.com', 'test-only-password-12345');
await viewer.collection('users').authWithPassword('viewer@example.com', 'test-only-password-12345');
const endpoint = '/api/scheduled/newsletter-import';
for (const client of [viewer, anonymous]) {
  for (const [method, suffix] of [['GET', ''], ['PATCH', ''], ['POST', '/run']]) {
    await assert.rejects(client.send(endpoint + suffix, { method, body: method === 'GET' ? undefined : {} }), (e) => [401, 403].includes(e.status));
  }
}
let schedule = await admin.send(endpoint, { method: 'PATCH', body: { enabled: false, clearToken: true, repositoryUrl: '', username: '' } });
assert.equal(schedule.enabled, false);
await assert.rejects(admin.send(endpoint, { method: 'PATCH', body: { enabled: true } }), (e) => e.status === 400);
for (const intervalMinutes of [0, 59, 60.5, 999999]) await assert.rejects(admin.send(endpoint, { method: 'PATCH', body: { intervalMinutes } }), (e) => e.status === 400);
schedule = await admin.send(endpoint, { method: 'PATCH', body: { repositoryUrl: 'https://host/artifactory/generic-local/newsletters', username: 'reader', token: 'test-token', intervalMinutes: 60 } });
assert.equal(schedule.hasToken, true);
assert.equal('token' in schedule, false);
assert.doesNotMatch(JSON.stringify(schedule), /test-token/);
await assert.rejects(admin.collection('newsletter_import_jobs').getList(1, 10), (e) => e.status === 403);
schedule = await admin.send(endpoint, { method: 'PATCH', body: { token: '', intervalMinutes: 120 } });
assert.equal(schedule.hasToken, true);
schedule = await admin.send(endpoint + '/run', { method: 'POST', body: {} });
assert.equal(schedule.lastResult.status, 'ok', JSON.stringify(schedule.lastResult));
assert.equal(schedule.lastResult.importedFiles + schedule.lastResult.skipped, 3);
assert.ok([0, 12].includes(schedule.lastResult.articleCount));
const articles = await root.collection('newsletters').getFullList();
assert.equal(articles.length, 12);
for (const article of articles) {
  assert.equal(article.status, 'draft');
  assert.equal(article.textAlignment, 'right');
  assert.match(article.coverImage, /^data:image/);
  assert.match(article.content, /dir="rtl"/);
  assert.doesNotMatch(article.content, /כתבות AI אחרונות מגיקטיים|תאריך ריצה:/);
  assert.equal(article.notificationSentAt || '', '');
}
schedule = await admin.send(endpoint + '/run', { method: 'POST', body: {} });
assert.equal(schedule.lastResult.articleCount, 0);
assert.equal(schedule.lastResult.skipped, 3);
assert.equal((await root.collection('newsletters').getList()).totalItems, 12);
const job = await root.collection('newsletter_import_jobs').getFirstListItem('key != ""');
await root.collection('newsletter_import_jobs').update(job.id, { lockedUntil: new Date(Date.now() + 60000).toISOString() });
assert.equal((await admin.send(endpoint + '/run', { method: 'POST', body: {} })).isRunning, true);
await assert.rejects(admin.send(endpoint, { method: 'PATCH', body: { intervalMinutes: 240 } }), (e) => e.status === 400);
await root.collection('newsletter_import_jobs').update(job.id, { lockedUntil: '' });
schedule = await admin.send(endpoint, { method: 'PATCH', body: { token: 'invalid-test-token' } });
schedule = await admin.send(endpoint + '/run', { method: 'POST', body: {} });
assert.equal(schedule.lastResult.status, 'error');
assert.match(schedule.lastError, /HTTP 401/);
assert.doesNotMatch(JSON.stringify(schedule), /invalid-test-token/);
await admin.send(endpoint, { method: 'PATCH', body: { token: 'test-token' } });
const digest = await admin.send('/api/scheduled/newsletter-digest', { method: 'GET' });
assert.equal(digest.pendingNewsletterCount, 0);
console.log('Passed: admin authorization, settings validation, hidden credentials, 12 real-sample drafts, repeat imports, concurrent run lock, authentication failure and unchanged publishing queue.');
