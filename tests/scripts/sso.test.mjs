import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { resolveOidcEndpoints } from '../../scripts/pocketbase/oidc-config.mjs';

const source = ts.transpileModule(readFileSync('src/lib/auth/sso.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function load(window = {}) {
  const exports = {};
  vm.runInNewContext(source, { exports, require: () => ({}), URL, URLSearchParams, AbortController, window });
  return exports;
}
const module = load();
function harness({ storage = new Map(), path = '/community/post/one?view=all#reply', enabled = true, provider = 'oidc', list, exchange } = {}) {
  let current = new URL(path, 'https://newsletter.example');
  let clock = 1700000000000;
  const assigned = [], exchanges = [], opened = [];
  let listener, timeout, frame;
  const location = {
    get href() { return current.href; }, get origin() { return current.origin; },
    get pathname() { return current.pathname; }, get search() { return current.search; }, get hash() { return current.hash; },
    assign(url) { assigned.push(url); }, replace(url) { assigned.push(url); },
  };
  const pb = { authStore: { isValid: false }, collection: () => ({
    listAuthMethods: list || (async () => ({ oauth2: { providers: [{ name: provider, state: 'saved-state', codeVerifier: 'matching-verifier', codeChallenge: 'matching-challenge', authURL: 'https://keycloak.example/realms/company/protocol/openid-connect/auth?client_id=newsletter&response_type=code&scope=openid&redirect_uri=' }] } })),
    authWithOAuth2Code: async (...args) => { exchanges.push(args); if (exchange) await exchange(...args); pb.authStore.isValid = true; return { token: 'app-token' }; },
  }) };
  const dependencies = {
    getClient: () => pb, location, now: () => clock,
    storage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) },
    history: { state: { route: 'callback' }, replaceState(_, __, value) { current = new URL(value, current.origin); } },
    config: { autoLogin: enabled, provider },
    silent: {
      open(url) { frame = { source: {}, disposed: false }; opened.push(url); return { source: frame.source, dispose() { frame.disposed = true; } }; },
      listen(callback) { listener = callback; return () => { listener = undefined; }; },
      scheduleTimeout(callback) { timeout = callback; return () => { timeout = undefined; }; },
    },
  };
  const auth = module.createSsoAuth(dependencies);
  const callback = (query = 'code=one-use-code&state=saved-state') => 'https://newsletter.example/sso-callback?' + query;
  return {
    auth, dependencies, pb, assigned, exchanges, opened, storage, location, callback,
    advance(ms) { clock += ms; }, go(url) { current = new URL(url, current.origin); },
    emit(extra = {}) { listener?.({ origin: current.origin, source: frame?.source, data: { type: 'newsletter:sso:callback', url: callback() }, ...extra }); },
    expire() { timeout?.(); }, get disposed() { return frame?.disposed; },
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('automatic SSO runs in a hidden frame, keeps the entry page, and uses PKCE', async () => {
  const h = harness();
  const pending = h.auth.tryAutomaticLogin();
  await flush();
  assert.equal(h.assigned.length, 0);
  const request = new URL(h.opened[0]);
  assert.equal(request.searchParams.get('prompt'), 'none');
  assert.equal(request.searchParams.get('redirect_uri'), 'https://newsletter.example/sso-callback');
  assert.equal(request.searchParams.get('code_challenge_method'), 'S256');
  h.emit();
  await pending;
  assert.equal(h.pb.authStore.isValid, true);
  assert.equal(h.exchanges.length, 1);
  assert.equal(h.location.pathname, '/community/post/one');
  assert.equal(h.disposed, true);
  assert.equal(h.storage.size, 0);
});

test('callback exchanges a code once across reruns and removes sensitive query values', async () => {
  const h = harness();
  await h.auth.start();
  h.go(h.callback() + '&session_state=private&iss=https://keycloak.example');
  const first = h.auth.complete();
  assert.equal(h.auth.complete(), first);
  assert.equal(h.location.search, '');
  const result = await first;
  assert.equal(result.status, 'success');
  assert.equal(result.returnTo, '/community/post/one?view=all#reply');
  assert.equal(h.exchanges.length, 1);
  assert.equal(h.exchanges[0][2], 'matching-verifier');
  assert.equal(h.storage.size, 0);
});

for (const query of ['code=one-use-code', 'code=one-use-code&state=wrong', 'state=saved-state']) {
  test('invalid callback is rejected before exchanging: ' + query, async () => {
    const h = harness();
    await h.auth.start(); h.go(h.callback(query));
    assert.equal((await h.auth.complete()).status, 'error');
    assert.equal(h.exchanges.length, 0);
    assert.equal(h.storage.size, 0);
  });
}

test('expired login and failed exchange clear the attempt and allow manual login', async () => {
  const expired = harness();
  await expired.auth.start(); expired.advance(11 * 60 * 1000); expired.go(expired.callback());
  assert.equal((await expired.auth.complete()).error, 'sessionExpired');
  assert.equal(expired.exchanges.length, 0);
  const failed = harness({ exchange: async () => { throw new Error('Provider unavailable'); } });
  await failed.auth.start(); failed.go(failed.callback());
  assert.equal((await failed.auth.complete()).status, 'error');
  assert.equal(failed.storage.size, 0);
});

test('silent login rejects foreign origins, wrong frames, and wrong callback paths', async () => {
  const h = harness(); const pending = h.auth.tryAutomaticLogin(); await flush();
  h.emit({ origin: 'https://attacker.example' });
  h.emit({ source: {} });
  h.emit({ data: { type: 'newsletter:sso:callback', url: 'https://newsletter.example/wrong?code=stolen&state=saved-state' } });
  assert.equal(h.exchanges.length, 0);
  h.emit(); await pending;
  assert.equal(h.exchanges.length, 1);
});

test('no Keycloak session or blocked iframe leaves the site and manual login available', async () => {
  const h = harness(); const pending = h.auth.tryAutomaticLogin(); await flush();
  h.emit({ data: { type: 'newsletter:sso:callback', url: h.callback('error=login_required&state=saved-state') } });
  await pending;
  assert.equal(h.assigned.length, 0); assert.equal(h.exchanges.length, 0);
  await h.auth.tryAutomaticLogin(); assert.equal(h.opened.length, 1);
  const blocked = harness(); const blockedPending = blocked.auth.tryAutomaticLogin(); await flush();
  blocked.expire(); await blockedPending;
  assert.equal(blocked.disposed, true); assert.equal(blocked.storage.size, 0);
  await blocked.auth.tryAutomaticLogin(); assert.equal(blocked.opened.length, 1);
});

test('sign-out stays local until refresh, then retries silent SSO', async () => {
  const h = harness(); const first = h.auth.tryAutomaticLogin(); await flush(); h.emit(); await first;
  h.pb.authStore.isValid = false; h.auth.signOut();
  await h.auth.tryAutomaticLogin(); assert.equal(h.opened.length, 1);
  const refreshed = module.createSsoAuth(h.dependencies);
  const next = refreshed.tryAutomaticLogin(); await flush();
  assert.equal(h.opened.length, 2); assert.equal(h.assigned.length, 0);
  h.emit(); await next;
  assert.equal(h.pb.authStore.isValid, true);
});

test('manual route, existing login, excluded routes, and disabled auto-login skip SSO', async () => {
  for (const options of [{ path: '/sign-in?manual=1' }, { path: '/reset-password/secret' }, { path: '/verify-email/secret' }, { enabled: false }]) {
    const h = harness(options); await h.auth.tryAutomaticLogin(); assert.equal(h.opened.length, 0);
  }
  const h = harness(); h.pb.authStore.isValid = true; await h.auth.tryAutomaticLogin(); assert.equal(h.opened.length, 0);
});

test('sign-out while provider settings are loading cancels automatic login', async () => {
  let resolve;
  const h = harness({ list: () => new Promise((r) => { resolve = r; }) });
  const pending = h.auth.tryAutomaticLogin();
  h.auth.signOut(); resolve({ oauth2: { providers: [] } }); await pending;
  assert.equal(h.opened.length, 0); assert.equal(h.storage.size, 0);
});

test('a login in another tab cannot overwrite this tab’s verifier', async () => {
  const a = harness({ provider: 'oidc' }), b = harness({ provider: 'oidc2' });
  await Promise.all([a.auth.start(), b.auth.start()]);
  a.go(a.callback()); b.go(b.callback());
  await Promise.all([a.auth.complete(), b.auth.complete()]);
  assert.equal(a.exchanges[0][0], 'oidc'); assert.equal(b.exchanges[0][0], 'oidc2');
});

test('only same-origin in-app return destinations are allowed', () => {
  for (const value of ['https://attacker.example', '//attacker.example', '/\\attacker.example', '/sso-callback?code=old', '/reset-password/secret', '/sign-in', '/\nattacker']) {
    assert.equal(module.safeSsoReturnTo(value, 'https://newsletter.example'), '/');
  }
  assert.equal(module.manualSignInUrl('/community/post/one', 'https://newsletter.example'), '/sign-in?manual=1&returnTo=%2Fcommunity%2Fpost%2Fone');
});

test('iframe callback bridge posts to the same-origin parent and scrubs its URL', () => {
  const calls = [];
  const window = { location: new URL('https://newsletter.example/sso-callback?code=secret&state=one'), history: { state: null, replaceState: (...args) => calls.push(args) }, parent: { postMessage: (...args) => calls.push(args) } };
  assert.equal(load(window).deliverSilentSsoCallback(), true);
  assert.equal(calls[0][2], '/sso-callback');
  assert.equal(calls[1][0].type, 'newsletter:sso:callback');
  assert.equal(calls[1][1], 'https://newsletter.example');
  window.parent = window;
  assert.equal(load(window).deliverSilentSsoCallback(), false);
});

test('OIDC discovery verifies the realm and rejects insecure endpoints', async () => {
  const issuer = 'https://keycloak.example/realms/company';
  const metadata = { issuer, authorization_endpoint: issuer + '/protocol/openid-connect/auth', token_endpoint: issuer + '/protocol/openid-connect/token', userinfo_endpoint: issuer + '/protocol/openid-connect/userinfo' };
  const env = { POCKETBASE_SSO_OIDC_ISSUER_URL: issuer };
  const endpoints = await resolveOidcEndpoints(env, async (url) => { assert.equal(url, issuer + '/.well-known/openid-configuration'); return { ok: true, json: async () => metadata }; });
  assert.equal(endpoints.tokenURL, metadata.token_endpoint);
  await assert.rejects(resolveOidcEndpoints(env, async () => ({ ok: true, json: async () => ({ ...metadata, issuer: 'https://attacker.example' }) })), /issuer/);
  await assert.rejects(resolveOidcEndpoints(env, async () => ({ ok: true, json: async () => ({ ...metadata, token_endpoint: 'http://keycloak.example/token' }) })), /HTTPS/);
});

test('container publishes only public SSO settings, with no credentials', () => {
  const script = readFileSync('docker/entrypoint.sh', 'utf8').match(/APP_CONFIG_PATH=.*node <<'EOF'\n([\s\S]*?)\nEOF/)[1];
  let configScript;
  const env = { APP_CONFIG_PATH: 'app-config.js', NEWSLETTER_SSO_AUTO_LOGIN: '0', POCKETBASE_SSO_OIDC_PROVIDER_NAME: 'oidc2', POCKETBASE_SSO_OIDC_CLIENT_SECRET: 'never-expose-this-secret' };
  vm.runInNewContext(script, { require: () => ({ writeFileSync(_, contents) { configScript = contents; } }), process: { env } });
  const window = { location: { origin: 'https://newsletter.example' } };
  vm.runInNewContext(configScript, { window });
  assert.equal(window.__APP_CONFIG__.SSO_AUTO_LOGIN, false);
  assert.equal(window.__APP_CONFIG__.SSO_PROVIDER, 'oidc2');
  assert(!configScript.includes('never-expose-this-secret'));
});
