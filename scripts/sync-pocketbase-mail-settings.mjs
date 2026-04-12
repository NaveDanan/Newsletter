import PocketBase from 'pocketbase';
import { loadProjectEnv } from './pocketbase/load-env.mjs';

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
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : undefined;
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

function readOptionalInteger(env, key) {
  const value = readOptionalValue(env, key);
  if (!value) {
    return undefined;
  }

  const parsedValue = Number.parseInt(value, 10);
  if (Number.isNaN(parsedValue)) {
    throw new Error(`Invalid integer value for ${key}: ${value}`);
  }

  return parsedValue;
}

async function main() {
  const env = loadProjectEnv();
  const pocketbaseUrl = requireEnvValue(env, ['POCKETBASE_URL', 'VITE_POCKETBASE_URL']);
  const superuserEmail = requireEnvValue(env, ['POCKETBASE_SUPERUSER_EMAIL']);
  const superuserPassword = requireEnvValue(env, ['POCKETBASE_SUPERUSER_PASSWORD']);

  const pb = new PocketBase(pocketbaseUrl);
  await pb.collection('_superusers').authWithPassword(superuserEmail, superuserPassword);

  const currentSettings = await pb.settings.getAll();
  const nextPayload = {};

  const metaUpdate = {};
  const appName = readOptionalValue(env, 'POCKETBASE_APP_NAME');
  const pocketbasePublicUrl = readOptionalValue(env, 'POCKETBASE_PUBLIC_URL');
  const senderName = readOptionalValue(env, 'POCKETBASE_MAIL_SENDER_NAME');
  const senderAddress = readOptionalValue(env, 'POCKETBASE_MAIL_SENDER_ADDRESS');

  if (appName) {
    metaUpdate.appName = appName;
  }
  if (pocketbasePublicUrl) {
    metaUpdate.appURL = pocketbasePublicUrl;
  }
  if (senderName) {
    metaUpdate.senderName = senderName;
  }
  if (senderAddress) {
    metaUpdate.senderAddress = senderAddress;
  }

  if (Object.keys(metaUpdate).length > 0) {
    nextPayload.meta = {
      ...(currentSettings.meta || {}),
      ...metaUpdate,
    };
  }

  const smtpUpdate = {};
  const smtpEnabled = readOptionalBoolean(env, 'POCKETBASE_SMTP_ENABLED');
  const smtpHost = readOptionalValue(env, 'POCKETBASE_SMTP_HOST');
  const smtpPort = readOptionalInteger(env, 'POCKETBASE_SMTP_PORT');
  const smtpUsername = readOptionalValue(env, 'POCKETBASE_SMTP_USERNAME');
  const smtpPassword = readOptionalValue(env, 'POCKETBASE_SMTP_PASSWORD');
  const smtpAuthMethod = readOptionalValue(env, 'POCKETBASE_SMTP_AUTH_METHOD');
  const smtpTls = readOptionalBoolean(env, 'POCKETBASE_SMTP_TLS');
  const smtpLocalName = readOptionalValue(env, 'POCKETBASE_SMTP_LOCAL_NAME');

  if (typeof smtpEnabled === 'boolean') {
    smtpUpdate.enabled = smtpEnabled;
  }
  if (smtpHost) {
    smtpUpdate.host = smtpHost;
  }
  if (typeof smtpPort === 'number') {
    smtpUpdate.port = smtpPort;
  }
  if (smtpUsername) {
    smtpUpdate.username = smtpUsername;
  }
  if (smtpPassword) {
    smtpUpdate.password = smtpPassword;
  }
  if (smtpAuthMethod) {
    smtpUpdate.authMethod = smtpAuthMethod;
  }
  if (typeof smtpTls === 'boolean') {
    smtpUpdate.tls = smtpTls;
  }
  if (smtpLocalName) {
    smtpUpdate.localName = smtpLocalName;
  }

  if (Object.keys(smtpUpdate).length > 0) {
    const effectiveSmtpSettings = {
      ...(currentSettings.smtp || {}),
      ...smtpUpdate,
    };

    if (effectiveSmtpSettings.enabled && (!effectiveSmtpSettings.host || !effectiveSmtpSettings.port)) {
      throw new Error('SMTP is enabled but host or port is missing. Set POCKETBASE_SMTP_HOST and POCKETBASE_SMTP_PORT.');
    }

    nextPayload.smtp = effectiveSmtpSettings;
  }

  if (Object.keys(nextPayload).length === 0) {
    console.log('Skipping PocketBase mail settings sync because no mail overrides were provided.');
    return;
  }

  await pb.settings.update(nextPayload);
  console.log('Synced PocketBase mail settings.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});