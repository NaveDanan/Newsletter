import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import PocketBase from 'pocketbase';

const rootDirectory = fileURLToPath(new URL('../../', import.meta.url));
const fixtures = path.join(rootDirectory, 'tests/fixtures/import-worker');
const name = `newsletter-import-management-${Date.now()}`;
const image = process.env.NEWSLETTER_DOCKER_IMAGE;
if (!image) throw new Error('Set NEWSLETTER_DOCKER_IMAGE to the image to test.');
const docker = (args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const password = 'local-test-password-12345';
try {
  docker(['run', '-d', '--name', name, '--entrypoint', 'sh', '-p', '127.0.0.1::8090', '-p', '127.0.0.1::8080', '-v', `${name}:/pb_data`, '-v', `${fixtures}:/test-worker:ro`, '-v', `${fixtures}/import-test.pb.js:/opt/pocketbase/pb_hooks/import-test.pb.js:ro`,
    '-e', 'APP_ROOT=/test-runtime', '-e', 'POCKETBASE_SUPERUSER_EMAIL=root@example.com', '-e', `POCKETBASE_SUPERUSER_PASSWORD=${password}`, '-e', 'POCKETBASE_ADMIN_EMAIL=admin@example.com', '-e', `POCKETBASE_ADMIN_PASSWORD=${password}`, '-e', 'POCKETBASE_SMTP_ENABLED=0', image,
    '-c', 'mkdir /test-runtime && cp -a /app/scripts /test-runtime/ && ln -s /app/node_modules /test-runtime/node_modules && cp /test-worker/scripts/pocketbase/artifactory-import.mjs /test-runtime/scripts/pocketbase/artifactory-import.mjs && exec /app/docker/entrypoint.sh']);
  const port = docker(['port', name, '8090/tcp']).split(':').at(-1);
  const url = `http://127.0.0.1:${port}`;
  const root = new PocketBase(url), admin = new PocketBase(url), viewer = new PocketBase(url);
  for (let attempt = 0; ; attempt++) {
    try { await root.collection('_superusers').authWithPassword('root@example.com', password); await admin.collection('users').authWithPassword('admin@example.com', password); break; }
    catch (error) { if (attempt >= 45) throw error; await new Promise((resolve) => setTimeout(resolve, 500)); }
  }
  await root.collection('users').create({ email: 'viewer@example.com', password, passwordConfirm: password, role: 'viewer' });
  await viewer.collection('users').authWithPassword('viewer@example.com', password);
  const endpoint = '/api/scheduled/newsletter-import';
  for (const client of [viewer, new PocketBase(url)]) for (const [method, suffix] of [['GET', '/files'], ['PATCH', '/files/invalid'], ['DELETE', '/files/invalid']]) {
    await assert.rejects(client.send(endpoint + suffix, { method, body: method === 'GET' ? undefined : {} }), (error) => [401, 403].includes(error.status));
  }
  await admin.send(endpoint, { method: 'PATCH', body: { repositoryUrl: 'https://host/artifactory/repo', username: 'reader', token: 'test-token', enabled: false } });
  let result = await admin.send(endpoint + '/run', { method: 'POST', body: {} });
  assert.ok(result.lastResult, `Missing run result: ${JSON.stringify(result)}`);
  assert.equal(result.lastResult.importedFiles, 7, JSON.stringify(result));
  assert.equal(result.lastResult.articleCount, 7);
  assert.equal(result.lastResult.deferred, 0);
  assert.equal(result.lastResult.errors.length, 1);
  assert.equal(result.isRunning, false);
  let files = await admin.send(endpoint + '/files', { method: 'GET' });
  assert.equal(files.items.length, 7);
  assert.doesNotMatch(JSON.stringify(files), /test-token/);
  const first = files.items[0], second = files.items[1];
  await assert.rejects(admin.send(endpoint + '/files/' + first.id, { method: 'PATCH', body: { sourceUrl: second.sourceUrl, checksum: second.checksum } }), (error) => error.status === 400);
  await assert.rejects(admin.send(endpoint + '/files/' + first.id, { method: 'PATCH', body: { sourceUrl: first.sourceUrl, checksum: 'invalid' } }), (error) => error.status === 400);
  const changed = await admin.send(endpoint + '/files/' + first.id, { method: 'PATCH', body: { sourceUrl: first.sourceUrl.replace('.docx', '-renamed.docx'), checksum: first.checksum } });
  assert.match(changed.sourceUrl, /-renamed\.docx$/);
  await admin.send(endpoint + '/files/' + first.id, { method: 'PATCH', body: { sourceUrl: first.sourceUrl, checksum: first.checksum } });
  await admin.send(endpoint + '/files/' + first.id, { method: 'DELETE' });
  assert.equal((await root.collection('newsletters').getList()).totalItems, 7, 'Removing tracking must preserve articles');
  result = await admin.send(endpoint + '/run', { method: 'POST', body: {} });
  assert.equal(result.lastResult.importedFiles, 1);
  assert.equal(result.lastResult.skipped, 6);
  assert.equal((await root.collection('newsletters').getList()).totalItems, 8);

  // A queued manual run must resume through cron even with a disabled schedule.
  files = await admin.send(endpoint + '/files', { method: 'GET' });
  const pending = files.items[0];
  await admin.send(endpoint + '/files/' + pending.id, { method: 'DELETE' });
  const visited = files.items.slice(1).map((file) => '/' + new URL(file.sourceUrl).pathname.split('/').at(-1)).concat('/broken.docx');
  const job = await root.collection('newsletter_import_jobs').getFirstListItem('key != ""');
  await root.collection('newsletter_import_jobs').update(job.id, { lastRunAt: new Date().toISOString(), enabled: false, lastResult: { status: 'running', importedFiles: 0, articleCount: 0, skipped: 0, deferred: 1, errors: [], visited } });
  await assert.rejects(admin.send(endpoint + '/files/' + second.id, { method: 'DELETE' }), (error) => error.status === 400);
  await assert.rejects(admin.send(endpoint, { method: 'PATCH', body: { intervalMinutes: 60 } }), (error) => error.status === 400);
  result = await admin.send('/api/test/import-tick', { method: 'POST', body: {} });
  assert.equal(result.lastResult.status, 'ok');
  assert.equal(result.lastResult.importedFiles, 1);
  assert.equal(result.isRunning, false);
  assert.equal((await root.collection('newsletters').getList()).totalItems, 9);

  for (let i = 0; i < 45; i++) await root.collection('newsletter_imports').create({ sourceKey: createHash('sha256').update(`page-${i}`).digest('hex'), sourceUrl: `https://host/page-${i}.docx`, checksum: 'a'.repeat(40), newsletterIds: [] });
  const page1 = await admin.send(endpoint + '/files', { method: 'GET' });
  const page2 = await admin.send(endpoint + '/files', { method: 'GET', query: { page: 2 } });
  assert.equal(page1.items.length, 50); assert.equal(page1.hasMore, true);
  assert.equal(page2.items.length, 2); assert.equal(page2.hasMore, false);
  const body = '<p dir="rtl" style="text-align:left">כותרת משנה</p><p dir="rtl" style="text-align:left">מאת: כותב</p><p>Existing body</p>';
  const imported = await root.collection('newsletters').create({ title: 'כותרת לבדיקה', content: body, subtitle: '', textAlignment: 'left', status: 'published' });
  const manual = await root.collection('newsletters').create({ title: 'כותרת ידנית', content: body, subtitle: '', textAlignment: 'left', status: 'draft' });
  await root.collection('newsletter_imports').create({ sourceKey: 'f'.repeat(64), sourceUrl: 'https://host/repair.docx', checksum: 'f'.repeat(40), newsletterIds: [imported.id] });
  docker(['exec', name, 'node', '/app/scripts/repair-imported-newsletter-dates.mjs']);
  const repaired = await root.collection('newsletters').getOne(imported.id);
  assert.equal(repaired.subtitle, 'כותרת משנה'); assert.equal(repaired.textAlignment, 'right'); assert.equal(repaired.status, 'published');
  assert.equal(repaired.content, '<p dir="rtl" style="text-align:right">מאת: כותב</p><p>Existing body</p>');
  assert.equal((await root.collection('newsletters').getOne(manual.id)).content, body);
  assert.match(docker(['exec', name, 'node', '/app/scripts/repair-imported-newsletter-dates.mjs']), /RTL alignment or subtitles on 0 imported/);
  console.log('Passed: all pending files in one fetch, failed-file isolation, tracking pagination/edit/delete, re-fetch without deleting articles, admin authorization, and disabled-schedule cron continuation.');
  console.log('Passed: existing imported layout repair, preservation of manual articles and workflow state, and idempotent reruns.');
  if (process.env.IMPORT_TEST_KEEP === '1') writeFileSync(path.join(rootDirectory, '.tmp/import-management-ui.json'), JSON.stringify({ name, url, webUrl: `http://127.0.0.1:${docker(['port', name, '8080/tcp']).split(':').at(-1)}` }));
} catch (error) {
  console.error(docker(['logs', '--tail', '35', name]));
  console.error(error.message, error.response || '');
  process.exitCode = 1;
} finally {
  if (process.env.IMPORT_TEST_KEEP !== '1' || process.exitCode === 1) {
    try { docker(['rm', '-f', name]); } finally { docker(['volume', 'rm', name]); }
  }
}
