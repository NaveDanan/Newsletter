routerAdd('GET', '/api/access-tokens', function (e) {
  return require(__hooks + '/lib/access-tokens.js').list(e);
}, $apis.requireAuth('users'), $apis.skipSuccessActivityLog());
routerAdd('POST', '/api/access-tokens', function (e) {
  return require(__hooks + '/lib/access-tokens.js').create(e);
}, $apis.bodyLimit(16384), $apis.requireAuth('users'), $apis.skipSuccessActivityLog());
routerAdd('DELETE', '/api/access-tokens/{tokenId}', function (e) {
  return require(__hooks + '/lib/access-tokens.js').revoke(e);
}, $apis.requireAuth('users'), $apis.skipSuccessActivityLog());
