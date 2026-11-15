// A Keycloak realm issuer can supply all provider endpoints. Existing explicit
// endpoint configuration remains supported for other OIDC providers.
function providerUrl(value, name) {
  const url = new URL(value);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error(`${name} must use HTTPS (HTTP is allowed only on localhost).`);
  }
  if (url.username || url.password || url.hash) throw new Error(`${name} is not a valid provider URL.`);
  return url.href;
}

export async function resolveOidcEndpoints(env, request = fetch) {
  const issuer = (env.POCKETBASE_SSO_OIDC_ISSUER_URL || '').trim().replace(/\/$/, '');
  if (!issuer) {
    const keys = ['POCKETBASE_SSO_OIDC_AUTH_URL', 'POCKETBASE_SSO_OIDC_TOKEN_URL', 'POCKETBASE_SSO_OIDC_USER_INFO_URL'];
    const values = keys.map((key) => {
      const value = (env[key] || '').trim();
      if (!value) throw new Error(`OIDC is enabled but ${key} is missing. Set an issuer URL or all three endpoints.`);
      return providerUrl(value, key);
    });
    return { authURL: values[0], tokenURL: values[1], userInfoURL: values[2] };
  }
  providerUrl(issuer, 'OIDC issuer');
  const response = await request(issuer + '/.well-known/openid-configuration', { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`OIDC discovery failed (${response.status}).`);
  const metadata = await response.json();
  if (metadata.issuer !== issuer) throw new Error('OIDC discovery issuer does not match the configured realm.');
  return {
    authURL: providerUrl(metadata.authorization_endpoint, 'OIDC authorization endpoint'),
    tokenURL: providerUrl(metadata.token_endpoint, 'OIDC token endpoint'),
    userInfoURL: providerUrl(metadata.userinfo_endpoint, 'OIDC user info endpoint'),
  };
}
