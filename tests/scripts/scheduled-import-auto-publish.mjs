// Starts a disposable, SMTP-free PocketBase instance. No preview or production data is used.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PocketBase from 'pocketbase';
import { NEWSLETTERS_SCHEMA, NEWSLETTER_IMPORT_JOBS_SCHEMA, NEWSLETTER_IMPORTS_SCHEMA } from '../../scripts/pocketbase/app-schema.mjs';

assert.ok(NEWSLETTER_IMPORT_JOBS_SCHEMA.fields.some((field) => field.name === 'autoPublish' && field.type === 'bool'), 'The schedule schema must expose the saved auto-publish switch');

const binary = process.env.IMPORT_TEST_PB_BINARY;
if (!binary) throw new Error('Set IMPORT_TEST_PB_BINARY to a local PocketBase executable.');
const appRoot = fileURLToPath(new URL('../../', import.meta.url));
const directory = await mkdtemp(path.join(tmpdir(), 'newsletter-auto-publish-'));
const data = path.join(directory, 'data');
const hooks = path.join(directory, 'hooks');
const migrations = path.join(directory, 'migrations');
const password = 'test-only-password-12345';
let server;
let output = '';

try {
  await mkdir(path.join(hooks, 'lib'), { recursive: true });
  await mkdir(migrations);
  await copyFile(path.join(appRoot, 'pb_hooks/scheduled-import.pb.js'), path.join(hooks, 'scheduled-import.pb.js'));
  await copyFile(path.join(appRoot, 'pb_hooks/lib/scheduled-import.js'), path.join(hooks, 'lib/scheduled-import.js'));
  // Reject the second article in one file to verify the first save rolls back too.
  await writeFile(path.join(hooks, 'reject-test.pb.js'), `onRecordCreate(function (e) {
    if (e.record.getString('title') === 'Reject this article') throw new BadRequestError('Test save failure.');
    return e.next();
  }, 'newsletters');`);
  execFileSync(binary, ['superuser', 'upsert', 'import-test@example.com', password, `--dir=${data}`], { stdio: 'pipe' });
  const reservation = createServer();
  await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const url = `http://127.0.0.1:${port}`;
  server = spawn(binary, ['serve', `--http=127.0.0.1:${port}`, `--dir=${data}`, `--hooksDir=${hooks}`, `--migrationsDir=${migrations}`, '--dev=false', '--hooksWatch=false', '--automigrate=false'], {
    env: { ...process.env, APP_ROOT: path.join(appRoot, 'tests/fixtures/auto-publish-worker'), IMPORT_TEST_APP_ROOT: appRoot },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => { output += chunk; });
  server.stderr.on('data', (chunk) => { output += chunk; });
  const root = new PocketBase(url);
  for (let attempt = 0; ; attempt++) {
    try { await root.collection('_superusers').authWithPassword('import-test@example.com', password); break; }
    catch (error) { if (attempt >= 50 || server.exitCode !== null) throw error; await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  await root.collections.create(NEWSLETTERS_SCHEMA);
  await root.collections.create(NEWSLETTER_IMPORTS_SCHEMA);
  // Simulate schema synchronization on a deployment that already has a saved job.
  const oldSchema = { ...NEWSLETTER_IMPORT_JOBS_SCHEMA, fields: NEWSLETTER_IMPORT_JOBS_SCHEMA.fields.filter((field) => field.name !== 'autoPublish') };
  const collection = await root.collections.create(oldSchema);
  const legacyJob = await root.collection('newsletter_import_jobs').create({ key: 'artifactory_newsletter_import', enabled: false, intervalMinutes: 1440, lastResult: {} });
  await root.collections.update(collection.id, { fields: [...collection.fields, NEWSLETTER_IMPORT_JOBS_SCHEMA.fields.find((field) => field.name === 'autoPublish')] });
  assert.equal((await root.collection('newsletter_import_jobs').getOne(legacyJob.id)).autoPublish, false, 'Existing jobs must stay draft-only');
  const users = await root.collections.getOne('users');
  await root.collections.update(users.id, { fields: [...users.fields, { name: 'role', type: 'text' }] });
  for (const role of ['admin', 'viewer']) await root.collection('users').create({ email: `${role}@example.com`, password, passwordConfirm: password, role, verified: true });
  const admin = new PocketBase(url), viewer = new PocketBase(url);
  await admin.collection('users').authWithPassword('admin@example.com', password);
  await viewer.collection('users').authWithPassword('viewer@example.com', password);
  const endpoint = '/api/scheduled/newsletter-import';
  for (const client of [viewer, new PocketBase(url)]) await assert.rejects(client.send(endpoint, { method: 'PATCH', body: { autoPublish: true } }), (error) => [401, 403].includes(error.status));
  assert.equal((await admin.send(endpoint, { method: 'GET' })).autoPublish, false);
  for (const autoPublish of ['true', 1, null]) await assert.rejects(admin.send(endpoint, { method: 'PATCH', body: { autoPublish } }), (error) => error.status === 400);
  await admin.send(endpoint, { method: 'PATCH', body: { repositoryUrl: 'https://host/artifactory/repo', username: 'reader', token: 'test-token' } });

  async function run(expectedCreated) {
    const result = await admin.send(endpoint + '/run', { method: 'POST', body: {} });
    assert.equal(result.enabled, false, 'Manual fetching is independent of recurring scheduling');
    assert.equal(result.lastResult.status, expectedCreated ? 'partial' : 'error');
    assert.equal(result.lastResult.articleCount, expectedCreated);
    assert.equal(result.lastResult.errors.length, 3, 'Parse, empty-document and save failures must be isolated');
    assert.equal(result.isRunning, false);
    const articles = await root.collection('newsletters').getFullList();
    assert.ok(articles.every((article) => ['First article', 'Second article'].includes(article.title)), 'No placeholder or partially saved file may survive');
    assert.equal((await root.collection('newsletter_imports').getFullList()).length, 1, 'Only the successfully saved file is tracked');
    return articles;
  }
  const drafts = await run(2);
  assert.ok(drafts.every((article) => article.status === 'draft' && article.content.includes('body')));
  let setting = await admin.send(endpoint, { method: 'PATCH', body: { autoPublish: true } });
  assert.equal(setting.autoPublish, true);
  setting = await admin.send(endpoint, { method: 'PATCH', body: { intervalMinutes: 120 } });
  assert.equal(setting.autoPublish, true, 'Unrelated settings patches must preserve auto publish');
  assert.equal((await admin.send(endpoint, { method: 'GET' })).autoPublish, true);
  assert.equal((await run(0)).length, 2, 'Turning on auto publish must not publish old drafts');

  async function forgetVersion() {
    const files = await admin.send(endpoint + '/files', { method: 'GET' });
    await admin.send(endpoint + '/files/' + files.items[0].id, { method: 'DELETE' });
  }
  await forgetVersion();
  const afterPublish = await run(2);
  const published = afterPublish.filter((article) => article.status === 'published');
  assert.equal(published.length, 2, 'Both newly saved articles must publish when enabled');
  for (const draft of drafts) assert.equal((await root.collection('newsletters').getOne(draft.id)).status, 'draft');
  await admin.send(endpoint, { method: 'PATCH', body: { autoPublish: false } });
  await forgetVersion();
  const afterDisable = await run(2);
  assert.equal(afterDisable.filter((article) => article.status === 'draft').length, 4);
  for (const article of published) assert.equal((await root.collection('newsletters').getOne(article.id)).status, 'published', 'Disabling auto publish must preserve existing published articles');
  await root.collection('newsletter_import_jobs').update(legacyJob.id, { lockedUntil: new Date(Date.now() + 60000).toISOString() });
  await assert.rejects(admin.send(endpoint, { method: 'PATCH', body: { autoPublish: true } }), (error) => error.status === 400);
  console.log('Passed: existing-schema default, admin authorization, boolean validation, persistence, draft-only default, published imports, repeat-import safety, prior article preservation, per-file rollback, empty/invalid documents, disabled manual schedule and running-job lock.');
} catch (error) {
  console.error(output.slice(-5000));
  throw error;
} finally {
  if (server && server.exitCode === null) {
    const stopped = new Promise((resolve) => server.once('exit', resolve));
    server.kill('SIGTERM');
    await stopped;
  }
  await rm(directory, { recursive: true, force: true });
}
