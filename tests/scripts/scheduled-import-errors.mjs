// Exercises the real worker CLI, PocketBase scheduler hook and admin API locally.
// Only fetch is replaced; no external Artifactory or production data is used.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import PocketBase from 'pocketbase';
import { NEWSLETTERS_SCHEMA, NEWSLETTER_IMPORT_JOBS_SCHEMA, NEWSLETTER_IMPORTS_SCHEMA } from '../../scripts/pocketbase/app-schema.mjs';

const binary = process.env.IMPORT_TEST_PB_BINARY;
if (!binary) throw new Error('Set IMPORT_TEST_PB_BINARY to a local PocketBase executable.');
const appRoot = fileURLToPath(new URL('../../', import.meta.url));
const directory = await mkdtemp(path.join(tmpdir(), 'newsletter-import-errors-'));
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
  execFileSync(binary, ['superuser', 'upsert', 'import-test@example.com', password, '--dir=' + data], { stdio: 'pipe' });
  const reservation = createServer();
  await new Promise((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', resolve);
  });
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const url = 'http://127.0.0.1:' + port;
  const preload = pathToFileURL(path.join(appRoot, 'tests/fixtures/import-errors-fetch.mjs')).href;
  server = spawn(binary, [
    'serve', '--http=127.0.0.1:' + port, '--dir=' + data, '--hooksDir=' + hooks,
    '--migrationsDir=' + migrations, '--dev=false', '--hooksWatch=false', '--automigrate=false',
  ], {
    env: { ...process.env, APP_ROOT: appRoot, NODE_OPTIONS: '--import=' + preload },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => { output += chunk; });
  server.stderr.on('data', (chunk) => { output += chunk; });
  const root = new PocketBase(url);
  for (let attempt = 0; ; attempt++) {
    try {
      await root.collection('_superusers').authWithPassword('import-test@example.com', password);
      break;
    } catch (error) {
      if (attempt >= 50 || server.exitCode !== null) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  for (const schema of [NEWSLETTERS_SCHEMA, NEWSLETTER_IMPORTS_SCHEMA, NEWSLETTER_IMPORT_JOBS_SCHEMA]) {
    await root.collections.create(schema);
  }
  const users = await root.collections.getOne('users');
  await root.collections.update(users.id, { fields: [...users.fields, { name: 'role', type: 'text' }] });
  await root.collection('users').create({
    email: 'admin@example.com', password, passwordConfirm: password, role: 'admin', verified: true,
  });
  const admin = new PocketBase(url);
  await admin.collection('users').authWithPassword('admin@example.com', password);
  const endpoint = '/api/scheduled/newsletter-import';
  const messages = [];
  for (const [hostname, expected] of [
    ['dns-failure.test', /ENOTFOUND/],
    ['tls-failure.test', /UNABLE_TO_VERIFY_LEAF_SIGNATURE/],
    ['timeout.test', /ETIMEDOUT/],
    ['redirect.test', /redirect.*HTTP 302/],
    ['missing-repository.test', /HTTP 404.*repository.*not found/i],
    ['unauthorized.test', /HTTP 401.*credentials/i],
    ['invalid-json.test', /invalid JSON/i],
  ]) {
    await admin.send(endpoint, {
      method: 'PATCH',
      body: { repositoryUrl: 'https://' + hostname + '/artifactory/repo', username: 'reader', token: 'private-test-token', enabled: false },
    });
    const result = await admin.send(endpoint + '/run', { method: 'POST', body: {} });
    assert.equal(result.lastResult.status, 'error');
    assert.equal(result.lastResult.errors.length, 1);
    assert.match(result.lastError, expected, hostname);
    assert.equal(result.lastResult.errors[0].message, result.lastError);
    assert.doesNotMatch(JSON.stringify(result), /private-test-token|login\.test/);
    const saved = await admin.send(endpoint, { method: 'GET' });
    assert.equal(saved.lastError, result.lastError, 'Polling must preserve the current error details');
    messages.push(result.lastError);
  }
  assert.equal(new Set(messages).size, messages.length, 'Each run must replace the previous failure with its own cause');
  await assert.rejects(admin.send(endpoint, {
    method: 'PATCH', body: { repositoryUrl: 'not a URL' },
  }), (error) => error.status === 400 && /valid Artifactory repository URL/.test(error.message));
  await admin.send(endpoint, { method: 'PATCH', body: { repositoryUrl: 'https://success.test/artifactory/repo' } });
  const success = await admin.send(endpoint + '/run', { method: 'POST', body: {} });
  assert.equal(success.lastResult.status, 'ok');
  assert.equal(success.lastError, '', 'A successful run must clear the previous failure');
  assert.deepEqual(success.lastResult.errors, []);
  console.log('Passed: real scheduler API preserves distinct DNS/TLS/timeout/redirect/HTTP/JSON errors, polling retains details, URL validation is specific, success clears errors, and credentials stay hidden.');
} catch (error) {
  console.error(output.slice(-3000).replaceAll(password, '<REDACTED>').replaceAll('private-test-token', '<REDACTED>'));
  throw error;
} finally {
  if (server && server.exitCode === null) {
    const stopped = new Promise((resolve) => server.once('exit', resolve));
    server.kill('SIGTERM');
    await stopped;
  }
  await rm(directory, { recursive: true, force: true });
}
