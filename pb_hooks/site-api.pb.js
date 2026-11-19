function authenticateNewsletterToken(e) {
  e.response.header().set('Cache-Control', 'private, no-store');
  return require(__hooks + '/lib/access-tokens.js').authenticateSiteRequest(e);
}

routerAdd('GET', '/api/v1/newsletters', function (e) {
  return require(__hooks + '/lib/newsletter-api.js').list(e);
}, authenticateNewsletterToken, $apis.requireAuth('users'), $apis.skipSuccessActivityLog());

routerAdd('GET', '/api/v1/newsletters/{id}', function (e) {
  return require(__hooks + '/lib/newsletter-api.js').get(e);
}, authenticateNewsletterToken, $apis.requireAuth('users'), $apis.skipSuccessActivityLog());

routerAdd('GET', '/api/v1/newsletters/{id}/page', function (e) {
  return require(__hooks + '/lib/newsletter-api.js').page(e);
}, authenticateNewsletterToken, $apis.requireAuth('users'), $apis.skipSuccessActivityLog());
