// Exercise the real production hooks against a disposable local database.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import nodePath from 'node:path';
import PocketBase from 'pocketbase';
import { APP_COLLECTION_SCHEMAS } from '../../scripts/pocketbase/app-schema.mjs';
import { buildUsersCollectionUpdate } from '../../scripts/pocketbase/users-schema.mjs';

const binary = process.env.ACCESS_TOKEN_TEST_PB_BINARY || 'pocketbase';
await mkdir('.tmp', { recursive: true });
const directory = await mkdtemp(nodePath.resolve('.tmp/access-token-test-'));
const args = [`--dir=${nodePath.join(directory, 'pb_data')}`, `--hooksDir=${nodePath.resolve('pb_hooks')}`, `--migrationsDir=${nodePath.join(directory, 'pb_migrations')}`];
const email = 'access-token-test@example.com', password = 'test-only-password-12345';
const port = Number(process.env.ACCESS_TOKEN_TEST_PORT || 17125);
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
const send = (client, path, method = 'GET', body) => client.send(path, { method, body, requestKey: null });
const tokenClient = secret => {
  const client = new PocketBase(origin); client.autoCancellation(false);
  client.beforeSend = (url, options) => ({ url, options: { ...options, headers: { ...options.headers, Authorization: 'Bearer ' + secret } } });
  return client;
};
const denied = status => error => error.status === status;
try {
  const init = spawnSync(binary, ['superuser', 'upsert', email, password, ...args], { encoding: 'utf8' });
  if (init.status !== 0) throw new Error('Set ACCESS_TOKEN_TEST_PB_BINARY to a PocketBase 0.36.9 binary.');
  await start();
  for (const schema of APP_COLLECTION_SCHEMAS) await root.collections.create(schema);
  const users = await root.collections.getOne('users');
  await root.collections.update(users.id, buildUsersCollectionUpdate(users.fields));
  const clients = {}, accounts = {};
  for (const [name, role] of [['manager','manager'],['other','manager'],['general','general_manager'],['admin','admin'],['author','author'],['viewer','viewer']]) {
    accounts[name] = await root.collection('users').create({ email: name + '@tokens.example.com', password, passwordConfirm: password, name, role, verified: true });
    const client = new PocketBase(origin); client.autoCancellation(false);
    await client.collection('users').authWithPassword(name + '@tokens.example.com', password); clients[name] = client;
  }
  for (const name of ['author', 'viewer']) {
    await assert.rejects(send(clients[name], '/api/access-tokens', 'POST', { name: 'denied' }), denied(403));
    await assert.rejects(send(clients[name], '/api/access-tokens'), denied(403));
  }
  await assert.rejects(send(new PocketBase(origin), '/api/access-tokens'), denied(401));
  const created = await send(clients.manager, '/api/access-tokens', 'POST', { name: 'Gantt integration', access: 'write', expiresInDays: 90, ownerId: accounts.admin.id });
  assert.match(created.token, /^nlpat_[A-Za-z0-9]{48}$/);
  assert.equal(created.item.access, 'write'); assert.equal(created.item.name, 'Gantt integration');
  const raw = await root.collection('access_tokens').getOne(created.item.id);
  assert.equal(raw.ownerId, accounts.manager.id, 'client-supplied owner ids are ignored');
  const database = new DatabaseSync(nodePath.join(directory, 'pb_data', 'data.db'), { readOnly: true });
  assert.equal(database.prepare('SELECT tokenHash FROM access_tokens WHERE id = ?').get(created.item.id).tokenHash, createHash('sha256').update(created.token).digest('hex'));
  database.close();
  assert.equal(JSON.stringify(raw).includes(created.token), false, 'plain token is never stored');
  const list = await send(clients.manager, '/api/access-tokens');
  assert.equal(list.items.length, 1); assert.equal(list.items[0].token, undefined); assert.equal(list.items[0].tokenHash, undefined);
  assert.equal((await send(clients.other, '/api/access-tokens')).items.length, 0);
  await assert.rejects(send(clients.other, '/api/access-tokens/' + created.item.id, 'DELETE'), denied(404));
  await assert.rejects(clients.manager.collection('access_tokens').getFullList(), denied(403));
  const token = tokenClient(created.token);
  await assert.rejects(send(token, '/api/access-tokens', 'POST', { name: 'no delegation' }), denied(401));
  await assert.rejects(send(token, '/api/newsletters', 'POST', { title: 'no newsletter access' }), denied(401));
  await assert.rejects(send(token, '/api/projects', 'POST', { title: 'no project creation' }), denied(403));
  const tasks = [
    { id: 'first', name: 'First', startDate: '2026-11-15', durationDays: 2, status: 'pending', progress: 0 },
    { id: 'done', name: 'Done', startDate: '2026-11-15', durationDays: 1, status: 'completed', progress: 100 },
  ];
  const project = async (title, owner, allowed = []) => root.collection('projects').create({ title, status: 'pending', createdBy: owner.id, allowedUserIds: allowed, gantt: { tasks, resources: [{ id: 'resource', name: 'Engineer', capacityPercent: 100 }], roles: [], zoom: 'week' } });
  const own = await project('Owned', accounts.manager), shared = await project('Shared', accounts.other, [accounts.manager.id]), privateProject = await project('Private', accounts.other);
  const all = await send(token, '/api/projects/tasks');
  assert.equal(all.projectCount, 2); assert.equal(all.items.length, 4);
  assert.deepEqual(new Set(all.items.map(t => t.projectId)), new Set([own.id, shared.id]));
  await assert.rejects(send(token, `/api/projects/${privateProject.id}/tasks`), denied(403));
  await assert.rejects(send(token, `/api/projects/${own.id}`, 'PATCH', { allowedUserIds: [accounts.other.id] }), denied(403));
  await assert.rejects(send(token, '/api/projects/missingproject1/progress'), denied(404));
  const path = `/api/projects/${own.id}`;
  const task = await send(token, path + '/tasks', 'POST', { id: 'external', name: 'External task', startDate: '2026-11-15', durationDays: 2 });
  assert.equal(task.id, 'external');
  await assert.rejects(send(token, path + '/tasks', 'POST', { id: 'external', name: 'duplicate' }), denied(400));
  const updated = await send(token, path + '/tasks/external', 'PATCH', { status: 'in-progress', progress: 70 });
  assert.equal(updated.progress, 70);
  assert.equal((await send(token, path + '/progress')).progress, 48);
  const progress = await send(token, path + '/progress', 'PATCH', { status: 'in-progress', tasks: [{ id: 'first', status: 'in-progress', progress: 20 }] });
  assert.equal(progress.progress, 56); assert.equal(progress.status, 'in-progress');
  await assert.rejects(send(token, path + '/progress', 'PATCH', { tasks: [{ id: 'first', progress: 100 }, { id: 'missing', progress: 100 }] }), denied(404));
  assert.equal((await send(token, path + '/tasks')).items.find(t => t.id === 'first').progress, 20, 'a failed bulk update is rolled back');
  const percentageOnly = await send(token, path + '/progress', 'PATCH', { tasks: [{ id: 'first', progress: 40 }] });
  assert.equal((await send(token, path + '/tasks')).items.find(t => t.id === 'first').status, 'in-progress');
  assert.equal(percentageOnly.progress, 64);
  await assert.rejects(send(token, path + '/progress', 'PATCH', { progress: 75 }), denied(400));
  await assert.rejects(send(token, path + '/progress', 'PATCH', { tasks: [{ id: 'first', progress: 101 }] }), denied(400));
  const child = await send(token, path + '/tasks/external/subtasks', 'POST', { id: 'child', name: 'Child', startDate: '2026-11-15', durationDays: 1 });
  assert.equal(child.indentLevel, 1);
  assert.equal((await send(token, path + '/tasks/external/subtasks')).items[0].id, 'child');
  const dependent = await send(token, path + '/tasks', 'POST', { id: 'dependent', name: 'Dependent', startDate: '2026-11-15', durationDays: 1, predecessorIds: ['external'] });
  assert.ok(dependent.startDate >= task.startDate);
  const deleted = await send(token, path + '/tasks/external', 'DELETE');
  assert.deepEqual(new Set(deleted.deletedTaskIds), new Set(['external','child']));
  assert.deepEqual((await send(token, path + '/tasks')).items.find(t => t.id === 'dependent').predecessorIds, []);
  const milestone = await send(token, path + '/milestones', 'POST', { name: 'Release', startDate: '2026-11-15' });
  assert.equal(milestone.milestone, true);
  const parallelIds = Array.from({ length: 8 }, (_, i) => 'parallel-' + i);
  await Promise.all(parallelIds.map(id => send(token, path + '/tasks', 'POST', { id, name: id, startDate: '2026-11-15', durationDays: 1 })));
  const saved = (await send(token, path + '/tasks')).items;
  assert.equal(saved.filter(t => parallelIds.includes(t.id)).length, parallelIds.length, 'concurrent edits do not lose tasks');
  assert.equal((await root.collection('projects').getOne(own.id)).gantt.resources[0].name, 'Engineer');
  const readToken = await send(clients.manager, '/api/access-tokens', 'POST', { name: 'Read-only', access: 'read', expiresInDays: 30 });
  const reader = tokenClient(readToken.token);
  assert.equal((await send(reader, path + '/tasks')).items.length, saved.length);
  for (const [route, method, body] of [[path + '/tasks','POST',{name:'denied'}],[path + '/tasks/first','DELETE'],[path + '/status','PATCH',{status:'completed'}]]) await assert.rejects(send(reader, route, method, body), denied(403));
  let generalToken;
  for (const role of ['general', 'admin']) {
    const t = await send(clients[role], '/api/access-tokens', 'POST', { name: role });
    assert.equal((await send(tokenClient(t.token), '/api/projects/tasks')).projectCount, 3);
    if (role === 'general') generalToken = t.token;
  }
  await root.collection('users').update(accounts.manager.id, { role: 'viewer' });
  await assert.rejects(send(token, path + '/tasks'), denied(403));
  await root.collection('users').update(accounts.manager.id, { role: 'manager' });
  assert.ok((await send(token, path + '/tasks')).items.length);
  await root.collection('access_tokens').update(readToken.item.id, { expiresAt: new Date(Date.now() - 1000).toISOString() });
  await assert.rejects(send(reader, path + '/tasks'), denied(401));
  await send(clients.manager, '/api/access-tokens/' + created.item.id, 'DELETE');
  await assert.rejects(send(token, path + '/tasks'), denied(401));
  await root.collection('users').delete(accounts.general.id);
  await assert.rejects(send(tokenClient(generalToken), path + '/tasks'), denied(401));
  await assert.rejects(send(tokenClient('nlpat_' + 'A'.repeat(48)), path + '/tasks'), denied(401));
  for (const body of [{name:''},{name:'bad',access:'admin'},{name:'bad',expiresInDays:0},{name:'bad',expiresInDays:366}]) await assert.rejects(send(clients.other, '/api/access-tokens','POST',body), denied(400));
  for(let i=0;i<20;i++) await send(clients.other,'/api/access-tokens','POST',{name:'token '+i});
  await assert.rejects(send(clients.other,'/api/access-tokens','POST',{name:'over limit'}), denied(400));
  console.log('PASS: role-gated token creation, hashed storage, owner isolation, scoped project access, Gantt CRUD, atomic progress updates, concurrent writes, read-only tokens, expiry, revocation, and immediate role changes.');
} catch (error) {
  console.error('Access-token integration failed:', error.status, error.stack || error.message, JSON.stringify(error.response || {}), logs.slice(-3000));
  process.exitCode = 1;
} finally { await stop(); await rm(directory, { recursive: true, force: true }); }
