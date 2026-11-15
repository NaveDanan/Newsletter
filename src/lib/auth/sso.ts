import type PocketBase from 'pocketbase';
import { getPocketBase } from '@/lib/pocketbase/client';
import { getSsoConfig, type SsoConfig } from '@/lib/runtime-config';

const ATTEMPT_KEY = 'newsletter:sso:attempt';
const ATTEMPT_LIFETIME_MS = 10 * 60 * 1000;
const AUTH_ROUTES = ['/sso-callback', '/reset-password', '/verify-email', '/unsubscribe', '/migrate'];

interface SsoAttempt {
  version: 1;
  provider: string;
  state: string;
  codeVerifier: string;
  redirectURL: string;
  returnTo: string;
  createdAt: number;
  automatic: boolean;
}

export type SsoError = 'invalidResponse' | 'securityFailed' | 'sessionExpired' | 'errorFallback';
export type SsoCompletion =
  | { status: 'success'; returnTo: string }
  | { status: 'manual'; returnTo: string }
  | { status: 'error'; error: SsoError; returnTo: string };

interface SsoDependencies {
  getClient: () => Pick<PocketBase, 'collection' | 'authStore'>;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  location: Pick<Location, 'href' | 'origin' | 'pathname' | 'search' | 'hash' | 'assign' | 'replace'>;
  history: Pick<History, 'state' | 'replaceState'>;
  config: SsoConfig;
  now?: () => number;
  silent?: {
    open: (url: string) => { source: Window | null; dispose: () => void };
    listen: (callback: (event: MessageEvent) => void) => () => void;
    scheduleTimeout: (callback: () => void) => () => void;
  };
}

// Only in-app destinations can survive login. Auth routes never become return
// destinations, so callbacks and password-reset links cannot create loops.
export function safeSsoReturnTo(value: string, origin: string): string {
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || Array.from(value).some((char) => char.charCodeAt(0) < 32)) return '/';
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || AUTH_ROUTES.some((route) => url.pathname === route || url.pathname.startsWith(route + '/')) || url.pathname === '/sign-in') return '/';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/';
  }
}

export function manualSignInUrl(returnTo = '/', origin = window.location.origin): string {
  const url = new URL('/sign-in', origin);
  url.searchParams.set('manual', '1');
  const destination = safeSsoReturnTo(returnTo, origin);
  if (destination !== '/') url.searchParams.set('returnTo', destination);
  return url.pathname + url.search;
}

export function createSsoAuth({ getClient, storage, location, history, config, now = Date.now, silent }: SsoDependencies) {
  let startPromise: Promise<'started' | 'unavailable'> | undefined;
  let completion: Promise<SsoCompletion> | undefined;
  let automaticStarted = false;
  let automaticSuppressed = false;
  let revision = 0;
  let cancelSilent: (() => void) | undefined;
  let exchangeAbort: AbortController | undefined;

  function clearAttempt() {
    storage.removeItem(ATTEMPT_KEY);
  }

  function suppressAutomaticLogin() {
    automaticSuppressed = true;
    revision += 1;
    cancelSilent?.();
    exchangeAbort?.abort();
    clearAttempt();
  }

  function currentReturnTo() {
    const query = new URLSearchParams(location.search);
    return safeSsoReturnTo(query.get('returnTo') || location.pathname + location.search + location.hash, location.origin);
  }

  function readAttempt(): SsoAttempt | null {
    try {
      const value = JSON.parse(storage.getItem(ATTEMPT_KEY) || 'null');
      if (!value || value.version !== 1 || typeof value.provider !== 'string' || !value.provider
        || typeof value.state !== 'string' || !value.state || typeof value.codeVerifier !== 'string' || !value.codeVerifier
        || typeof value.createdAt !== 'number' || value.createdAt > now() || now() - value.createdAt > ATTEMPT_LIFETIME_MS
        || value.redirectURL !== location.origin + '/sso-callback' || typeof value.returnTo !== 'string'
        || typeof value.automatic !== 'boolean') return null;
      return value;
    } catch {
      return null;
    }
  }

  async function begin(automatic: boolean) {
    clearAttempt();
    completion = undefined;
    const startedRevision = revision;
    try {
      const methods = await getClient().collection('users').listAuthMethods({ requestKey: null });
      if (revision !== startedRevision) return 'unavailable' as const;
      const provider = methods.oauth2?.providers.find((entry) => entry.name === config.provider);
      if (!provider) return 'unavailable' as const;
      const redirectURL = location.origin + '/sso-callback';
      const url = new URL(provider.authURL);
      if (!['https:', 'http:'].includes(url.protocol) || !provider.state || !provider.codeVerifier || !provider.codeChallenge) return 'unavailable' as const;
      url.searchParams.set('redirect_uri', redirectURL);
      url.searchParams.set('state', provider.state);
      url.searchParams.set('code_challenge', provider.codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
      if (automatic) url.searchParams.set('prompt', 'none');
      const attempt: SsoAttempt = {
        version: 1, provider: provider.name, state: provider.state,
        codeVerifier: provider.codeVerifier, redirectURL, returnTo: currentReturnTo(), createdAt: now(), automatic,
      };
      storage.setItem(ATTEMPT_KEY, JSON.stringify(attempt));
      automaticSuppressed = false;
      if (automatic) await runSilentLogin(url.href);
      else location.assign(url.href);
      return 'started' as const;
    } catch (error) {
      clearAttempt();
      throw error;
    }
  }

  function start(automatic = false) {
    if (!startPromise) {
      startPromise = begin(automatic).finally(() => { startPromise = undefined; });
    }
    return startPromise;
  }

  async function tryAutomaticLogin() {
    if (automaticStarted || !config.autoLogin || getClient().authStore.isValid
      || AUTH_ROUTES.some((route) => location.pathname === route || location.pathname.startsWith(route + '/'))) return;
    if (new URLSearchParams(location.search).get('manual') === '1') suppressAutomaticLogin();
    if (automaticSuppressed) return;
    automaticStarted = true;
    try {
      const result = await start(true);
      if (result === 'unavailable') suppressAutomaticLogin();
    } catch {
      // Manual login and public content remain available when the provider or
      // network is unavailable. No retry on rerender or automatic redirect loop.
      suppressAutomaticLogin();
    }
  }

  function complete(callbackHref = location.href): Promise<SsoCompletion> {
    // A shared promise survives effect reruns and React StrictMode remounts.
    if (completion) return completion;
    const callback = new URL(callbackHref);
    const attempt = readAttempt();
    clearAttempt();
    const code = callback.searchParams.get('code');
    const state = callback.searchParams.get('state');
    const providerError = callback.searchParams.get('error');
    for (const key of ['code', 'state', 'session_state', 'iss', 'error', 'error_description']) callback.searchParams.delete(key);
    if (location.pathname === '/sso-callback') history.replaceState(history.state, '', callback.pathname + callback.search + callback.hash);
    completion = (async (): Promise<SsoCompletion> => {
      const fail = (error: SsoError): SsoCompletion => {
        suppressAutomaticLogin();
        return { status: 'error', error, returnTo: attempt ? safeSsoReturnTo(attempt.returnTo, location.origin) : '/' };
      };
      if (callback.origin !== location.origin || callback.pathname !== '/sso-callback') return fail('invalidResponse');
      if (!attempt) return fail('sessionExpired');
      if (!state || state !== attempt.state) return fail('securityFailed');
      if (providerError) {
        suppressAutomaticLogin();
        if (attempt.automatic && ['login_required', 'interaction_required', 'consent_required', 'account_selection_required', 'access_denied'].includes(providerError)) {
          return { status: 'manual', returnTo: attempt.returnTo };
        }
        return fail('errorFallback');
      }
      if (!code) return fail('invalidResponse');
      try {
        exchangeAbort = new AbortController();
        await getClient().collection('users').authWithOAuth2Code(
          attempt.provider, code, attempt.codeVerifier, attempt.redirectURL, {}, { requestKey: null, signal: exchangeAbort.signal },
        );
        return { status: 'success', returnTo: safeSsoReturnTo(attempt.returnTo, location.origin) };
      } catch {
        return fail('errorFallback');
      } finally {
        exchangeAbort = undefined;
      }
    })();
    return completion;
  }

  function runSilentLogin(url: string): Promise<void> {
    if (!silent) { suppressAutomaticLogin(); return Promise.resolve(); }
    return new Promise((resolve) => {
      let frame: ReturnType<typeof silent.open> | undefined;
      let stopListening = () => {};
      let stopTimeout = () => {};
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        stopListening();
        stopTimeout();
        frame?.dispose();
        frame = undefined;
        cancelSilent = undefined;
        resolve();
      };
      cancelSilent = finish;
      stopListening = silent.listen((event) => {
        if (!frame || event.source !== frame.source || event.origin !== location.origin
          || !event.data || event.data.type !== 'newsletter:sso:callback' || typeof event.data.url !== 'string') return;
        let callback: URL;
        try { callback = new URL(event.data.url); } catch { return; }
        if (callback.origin !== location.origin || callback.pathname !== '/sso-callback') return;
        void complete(callback.href).finally(finish);
      });
      stopTimeout = silent.scheduleTimeout(() => { suppressAutomaticLogin(); finish(); });
      try { frame = silent.open(url); } catch (error) { finish(); throw error; }
    });
  }

  // Suppression lasts for this page only. A refresh runs background SSO again
  // using the user's existing Keycloak session, as requested for production.
  function signOut() {
    suppressAutomaticLogin();
  }

  return { start, complete, tryAutomaticLogin, suppressAutomaticLogin, signOut };
}

// One browser login controller owns pending work across React mounts. Its
// client getter always uses the current PocketBase client after local sign-out.
let browserSso: ReturnType<typeof createSsoAuth> | undefined;
export function getSsoAuth() {
  if (!browserSso) {
    for (const key of ['sso_provider', 'sso_state', 'sso_code_verifier']) localStorage.removeItem(key);
    browserSso = createSsoAuth({
      getClient: getPocketBase, storage: sessionStorage, location: window.location,
      history: window.history, config: getSsoConfig(),
      silent: {
        open(url) {
          const frame = document.createElement('iframe');
          frame.hidden = true;
          frame.title = 'Company sign-in';
          frame.src = url;
          document.body.appendChild(frame);
          return { source: frame.contentWindow, dispose: () => frame.remove() };
        },
        listen(callback) {
          window.addEventListener('message', callback);
          return () => window.removeEventListener('message', callback);
        },
        scheduleTimeout(callback) {
          const timer = window.setTimeout(callback, 15000);
          return () => window.clearTimeout(timer);
        },
      },
    });
  }
  return browserSso;
}

// The hidden iframe sends only the callback to its same-origin parent. The
// parent verifies the frame, origin and saved state before exchanging the code.
export function deliverSilentSsoCallback(): boolean {
  if (window.location.pathname !== '/sso-callback' || window.parent === window) return false;
  const url = window.location.href;
  window.history.replaceState(window.history.state, '', '/sso-callback');
  window.parent.postMessage({ type: 'newsletter:sso:callback', url }, window.location.origin);
  return true;
}
