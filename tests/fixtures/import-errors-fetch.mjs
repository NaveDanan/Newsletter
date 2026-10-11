// Loaded only into disposable import workers via NODE_OPTIONS=--import.
// The worker, scheduler hook and API are real; no external network is contacted.
globalThis.fetch = async (url, options) => {
  const hostname = new URL(url).hostname;
  const codes = {
    'dns-failure.test': 'ENOTFOUND',
    'tls-failure.test': 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'timeout.test': 'ETIMEDOUT',
  };
  if (codes[hostname]) {
    throw new TypeError('fetch failed: private-test-token', {
      cause: Object.assign(new Error('private-test-token'), { code: codes[hostname] }),
    });
  }
  if (hostname === 'redirect.test') {
    if (options.redirect !== 'manual') throw new TypeError('fetch failed');
    return new Response(null, { status: 302, headers: { Location: 'https://login.test/?token=private-test-token' } });
  }
  if (hostname === 'missing-repository.test') return new Response('private-test-token', { status: 404 });
  if (hostname === 'unauthorized.test') return new Response('private-test-token', { status: 401 });
  if (hostname === 'invalid-json.test') return new Response('<html>private-test-token</html>');
  if (hostname === 'success.test') return Response.json({ files: [] });
  throw new Error('Unexpected test hostname.');
};
