// PocketBase invokes this after it exchanges the authorization code and reads
// the configured provider's user info. Browser/JWT role claims never grant app
// privileges. Existing linked accounts retain their app-assigned roles.
onRecordAuthWithOAuth2Request(function (e) {
  var provider = $os.getenv('POCKETBASE_SSO_OIDC_PROVIDER_NAME') || 'oidc';
  if (!e.isNewRecord || e.providerName !== provider) return e.next();
  var enabled = ($os.getenv('POCKETBASE_SSO_OIDC_AUTO_REGISTER') || 'true').toLowerCase();
  if (['0', 'false', 'no', 'off'].indexOf(enabled) !== -1) {
    throw new ForbiddenError('New SSO accounts are not enabled. Contact an administrator.');
  }
  e.createData = Object.assign({}, e.createData || {}, { role: 'viewer', featuredWriter: false });
  return e.next();
}, 'users');

// New manual accounts without an explicit role get the same minimum access.
// Collection rules still prevent self-registration or updates granting roles.
onRecordCreate(function (e) {
  if (!e.record.getString('role')) e.record.set('role', 'viewer');
  return e.next();
}, 'users');
