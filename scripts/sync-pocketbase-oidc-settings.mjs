import PocketBase from 'pocketbase';
import { loadProjectEnv, resolvePocketBaseUrl } from './pocketbase/load-env.mjs';

function requireEnvValue(env, keys) {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      return value;
    }
  }

  throw new Error(`Missing required configuration. Tried: ${keys.join(', ')}`);
}

function readOptionalValue(env, key) {
  const value = env[key];
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function readOptionalBoolean(env, key) {
  const value = readOptionalValue(env, key);
  if (!value) {
    return undefined;
  }

  switch (value.toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
      return true;
    case '0':
    case 'false':
    case 'no':
    case 'off':
      return false;
    default:
      throw new Error(`Invalid boolean value for ${key}: ${value}`);
  }
}

function requireOidcValue(env, key) {
  const value = readOptionalValue(env, key);
  if (!value) {
    throw new Error(`POCKETBASE_SSO_OIDC_ENABLED is enabled but ${key} is missing.`);
  }

  return value;
}

async function main() {
  const env = loadProjectEnv();
  const oidcEnabled = readOptionalBoolean(env, 'POCKETBASE_SSO_OIDC_ENABLED');

  if (oidcEnabled !== true) {
    console.log('Skipping PocketBase OIDC settings sync because POCKETBASE_SSO_OIDC_ENABLED is not enabled.');
    return;
  }

  const pocketbaseUrl = resolvePocketBaseUrl(env);
  const superuserEmail = requireEnvValue(env, ['POCKETBASE_SUPERUSER_EMAIL']);
  const superuserPassword = requireEnvValue(env, ['POCKETBASE_SUPERUSER_PASSWORD']);

  const providerName = readOptionalValue(env, 'POCKETBASE_SSO_OIDC_PROVIDER_NAME') || 'oidc';
  const displayName = readOptionalValue(env, 'POCKETBASE_SSO_OIDC_DISPLAY_NAME') || 'Single Sign-On';
  const clientId = requireOidcValue(env, 'POCKETBASE_SSO_OIDC_CLIENT_ID');
  const clientSecret = requireOidcValue(env, 'POCKETBASE_SSO_OIDC_CLIENT_SECRET');
  const authURL = requireOidcValue(env, 'POCKETBASE_SSO_OIDC_AUTH_URL');
  const tokenURL = requireOidcValue(env, 'POCKETBASE_SSO_OIDC_TOKEN_URL');
  const userInfoURL = requireOidcValue(env, 'POCKETBASE_SSO_OIDC_USER_INFO_URL');
  const pkce = readOptionalBoolean(env, 'POCKETBASE_SSO_OIDC_PKCE') ?? true;

  const pb = new PocketBase(pocketbaseUrl);
  await pb.collection('_superusers').authWithPassword(superuserEmail, superuserPassword);

  const usersCollection = await pb.collections.getOne('users');
  const currentOauth2 = usersCollection.oauth2 || {};
  const currentProviders = Array.isArray(currentOauth2.providers) ? currentOauth2.providers : [];
  const nextProvider = {
    name: providerName,
    displayName,
    clientId,
    clientSecret,
    authURL,
    tokenURL,
    userInfoURL,
    pkce,
    extra: {},
  };
  const nextProviders = [
    ...currentProviders.filter((provider) => provider.name !== providerName),
    nextProvider,
  ];

  await pb.collections.update(usersCollection.id, {
    oauth2: {
      ...currentOauth2,
      enabled: true,
      providers: nextProviders,
      mappedFields: {
        id: '',
        name: 'name',
        username: '',
        avatarURL: 'avatar',
        ...(currentOauth2.mappedFields || {}),
      },
    },
  });

  console.log(`Synced PocketBase OIDC provider "${providerName}".`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
