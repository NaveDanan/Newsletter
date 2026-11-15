// Real PocketBase + a disposable OIDC provider. All app writes and permissions
// go through production hooks. No cluster or production database is used.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import PocketBase from 'pocketbase';
import { APP_COLLECTION_SCHEMAS } from '../../scripts/pocketbase/app-schema.mjs';
import { buildUsersCollectionUpdate } from '../../scripts/pocketbase/users-schema.mjs';

process.on('uncaughtException', error => { console.error(error.stack, JSON.stringify(error.response || {})); process.exitCode = 1; });
const binary = process.env.SSO_TEST_PB_BINARY || 'pocketbase';
const codes = new Map(), tokens = new Map();
let pbServer, logs = '', providerOrigin;
const provider = createServer(async (request, response) => {
  const parts = [];
  for await (const chunk of request) parts.push(chunk);
  const form = new URLSearchParams(Buffer.concat(parts).toString());
  const send = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)); };
  if (request.url === '/token') {
    const user = codes.get(form.get('code'));
    const basic = Buffer.from((request.headers.authorization || '').replace(/^Basic /, ''), 'base64').toString();
    const authenticated = basic === 'newsletter:test-client-secret' || (form.get('client_id') === 'newsletter' && form.get('client_secret') === 'test-client-secret');
    const challenge = createHash('sha256').update(form.get('code_verifier') || '').digest('base64url');
    if (!authenticated || !user || challenge !== user.challenge || form.get('redirect_uri') !== 'http://127.0.0.1:8080/sso-callback') return send(400, { error: 'invalid_grant' });
    codes.delete(form.get('code'));
    const accessToken = randomUUID(); tokens.set(accessToken, user.profile);
    return send(200, { access_token: accessToken, token_type: 'Bearer', expires_in: 300 });
  }
  if (request.url === '/userinfo') {
    const profile = tokens.get((request.headers.authorization || '').replace(/^Bearer /, ''));
    return profile ? send(200, profile) : send(401, { error: 'invalid_token' });
  }
  return send(404, { error: 'not_found' });
});
await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
providerOrigin = `http://127.0.0.1:${provider.address().port}`;
await mkdir('.tmp', { recursive: true });
const directory = await mkdtemp(path.resolve('.tmp/sso-test-'));
const args = [`--dir=${path.join(directory, 'pb_data')}`, `--hooksDir=${path.resolve('pb_hooks')}`, `--migrationsDir=${path.join(directory, 'pb_migrations')}`];
const identity = 'sso-test@example.com', password = 'test-only-password-12345';
const init = spawnSync(binary, ['superuser', 'upsert', identity, password, ...args], { encoding: 'utf8' });
if (init.status !== 0) { provider.close(); throw new Error('Set SSO_TEST_PB_BINARY to a PocketBase 0.36.9 binary. ' + init.stderr); }
const port = Number(process.env.SSO_TEST_PORT || 17095);
const origin = `http://127.0.0.1:${port}`;
const root = new PocketBase(origin); root.autoCancellation(false);
async function stop() {
  if (!pbServer || pbServer.exitCode !== null) return;
  pbServer.kill('SIGTERM'); await once(pbServer, 'exit');
}
async function start(autoRegister) {
  pbServer = spawn(binary, ['serve', `--http=127.0.0.1:${port}`, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, APP_ROOT: process.cwd(), POCKETBASE_SSO_OIDC_PROVIDER_NAME: 'oidc', POCKETBASE_SSO_OIDC_AUTO_REGISTER: String(autoRegister) },
  });
  pbServer.stdout.on('data', chunk => { logs += chunk; });
  pbServer.stderr.on('data', chunk => { logs += chunk; });
  for (let i = 0; i < 100; i++) {
    try { await root.health.check(); await root.collection('_superusers').authWithPassword(identity, password); return; }
    catch { if (pbServer.exitCode !== null) throw new Error('Disposable PocketBase failed: ' + logs); await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  throw new Error('Disposable PocketBase did not become healthy: ' + logs);
}
async function login(profile, createData = {}) {
  const client = new PocketBase(origin); client.autoCancellation(false);
  const methods = await client.collection('users').listAuthMethods();
  const oidc = methods.oauth2.providers.find(p => p.name === 'oidc');
  const code = randomUUID();
  codes.set(code, { profile, challenge: createHash('sha256').update(oidc.codeVerifier).digest('base64url') });
  const result = await client.collection('users').authWithOAuth2Code('oidc', code, oidc.codeVerifier, 'http://127.0.0.1:8080/sso-callback', createData);
  return { client, result };
}
const profile = (id, email = `${id}@example.com`) => ({ sub: id, name: 'SSO ' + id, email, email_verified: true, preferred_username: id, roles: ['admin'] });
const send = (client, route, body) => client.send(route, { method: 'POST', body: body || {}, requestKey: null });
try {
  await start(true);
  for (const schema of APP_COLLECTION_SCHEMAS) await root.collections.create(schema);
  const users = await root.collections.getOne('users');
  await root.collections.update(users.id, {
    ...buildUsersCollectionUpdate(users.fields),
    oauth2: { enabled: true, providers: [{ name: 'oidc', clientId: 'newsletter', clientSecret: 'test-client-secret', authURL: providerOrigin + '/auth', tokenURL: providerOrigin + '/token', userInfoURL: providerOrigin + '/userinfo', pkce: true }] },
  });
  const alice = await login(profile('alice', 'alice@first-company.example'), { role: 'admin', featuredWriter: true });
  assert.equal(alice.result.record.role, 'viewer', 'provider and client role claims never grant admin');
  assert.equal(alice.result.record.featuredWriter, false);
  const bob = await login(profile('bob', 'bob@another-company.example'));
  assert.equal(bob.result.record.role, 'viewer', 'all authenticated users from the configured realm may join');
  const noEmail = await login(profile('noemail', ''));
  assert.equal(noEmail.result.record.role, 'viewer', 'a valid provider subject can join without an email claim');
  const anotherNoEmail = await login(profile('another-noemail', ''));
  assert.notEqual(anotherNoEmail.result.record.id, noEmail.result.record.id, 'subjects without email remain distinct');
  const repeated = await login(profile('alice', 'alice@first-company.example'));
  assert.equal(repeated.result.record.id, alice.result.record.id, 'repeat SSO links to the same user');
  await root.collection('users').update(alice.result.record.id, { role: 'manager', featuredWriter: true });
  const manager = await login(profile('alice', 'alice@first-company.example'), { role: 'viewer', featuredWriter: false });
  assert.equal(manager.result.record.role, 'manager', 'existing app privileges are preserved');
  assert.equal(manager.result.record.featuredWriter, true);
  const session = await bob.client.send('/api/community/me', { requestKey: null });
  assert.equal(session.canModerate, false);
  const original = await send(manager.client, '/api/community/posts', { body: 'Welcome to the community', clientId: 'sso-original' });
  const reply = await send(bob.client, '/api/community/posts', { body: 'An SSO viewer can comment', parentId: original.id });
  assert.equal(reply.kind, 'reply');
  const liked = await send(bob.client, `/api/community/posts/${original.id}/like`);
  assert.equal(liked.active, true);
  assert.equal(liked.likeCount, 1);
  const reposted = await send(bob.client, `/api/community/posts/${original.id}/repost`);
  assert.equal(reposted.active, true);
  assert.equal(reposted.repostCount, 1);
  await assert.rejects(bob.client.send('/api/community/moderation/reports', { requestKey: null }), e => e.status === 403);
  await assert.rejects(bob.client.collection('users').update(bob.result.record.id, { role: 'admin' }), e => e.status === 400 || e.status === 403 || e.status === 404);
  const unknown = new PocketBase(origin);
  await assert.rejects(unknown.collection('users').authWithOAuth2Code('oidc', 'forged-code', 'forged-verifier', 'http://127.0.0.1:8080/sso-callback'), e => e.status === 400);
  await assert.rejects(unknown.collection('users').authWithOAuth2Code('unconfigured', 'forged-code', 'forged-verifier', 'http://127.0.0.1:8080/sso-callback'), e => e.status === 400);
  const manual = await unknown.collection('users').create({ email: 'manual@example.com', password, passwordConfirm: password });
  assert.equal(manual.role, 'viewer');
  await unknown.collection('users').authWithPassword('manual@example.com', password);
  assert.equal(unknown.authStore.isValid, true, 'manual login remains available');
  console.log('PASS: new SSO users default to viewer; existing roles persist; viewers reply, like and repost; manual login works; forged codes and privilege escalation fail.');
  await stop(); await start(false);
  await assert.rejects(login(profile('new-when-disabled')), e => e.status === 403);
  assert.equal((await login(profile('alice', 'alice@first-company.example'))).result.record.role, 'manager');
  console.log('PASS: production auto-registration can be disabled while existing SSO users continue to sign in.');
} finally {
  await stop(); provider.close();
  await rm(directory, { recursive: true, force: true });
}
