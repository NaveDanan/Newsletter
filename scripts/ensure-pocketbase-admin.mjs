import PocketBase from 'pocketbase';
import { loadProjectEnv, resolvePocketBaseUrl } from './pocketbase/load-env.mjs';

function requireEnvValue(env, keys, { optional = false } = {}) {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      return value;
    }
  }

  if (optional) {
    return '';
  }

  throw new Error(`Missing required configuration. Tried: ${keys.join(', ')}`);
}

function escapeFilterValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function passwordMatches(pocketbaseUrl, email, password) {
  try {
    await new PocketBase(pocketbaseUrl).collection('users').authWithPassword(email, password);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const env = loadProjectEnv();
  const pocketbaseUrl = resolvePocketBaseUrl(env);
  const superuserEmail = requireEnvValue(env, ['POCKETBASE_SUPERUSER_EMAIL']);
  const superuserPassword = requireEnvValue(env, ['POCKETBASE_SUPERUSER_PASSWORD']);
  const adminEmail = requireEnvValue(env, ['POCKETBASE_ADMIN_EMAIL', 'VITE_ADMIN_EMAIL'], { optional: true }).toLowerCase();
  const adminPassword = requireEnvValue(env, ['POCKETBASE_ADMIN_PASSWORD', 'VITE_ADMIN_PASSWORD'], { optional: true });

  if (!adminEmail || !adminPassword) {
    console.log('Skipping app admin bootstrap because POCKETBASE_ADMIN_* or VITE_ADMIN_* credentials are not configured.');
    return;
  }

  const pb = new PocketBase(pocketbaseUrl);
  await pb.collection('_superusers').authWithPassword(superuserEmail, superuserPassword);

  const users = pb.collection('users');
  const payload = {
    email: adminEmail,
    password: adminPassword,
    passwordConfirm: adminPassword,
    role: 'admin',
    verified: true,
  };

  try {
    const existingUser = await users.getFirstListItem(`email = "${escapeFilterValue(adminEmail)}"`);
    // This runs on every container start. Keep the admin's chosen display name,
    // and only reset a password that no longer matches: setting it rotates the
    // token key, which signs the admin out of every browser.
    const update = { ...payload };
    if (await passwordMatches(pocketbaseUrl, adminEmail, adminPassword)) {
      delete update.password;
      delete update.passwordConfirm;
    }
    await users.update(existingUser.id, update);
    console.log(`Updated app admin user ${adminEmail}`);
    return;
  } catch (error) {
    const status = typeof error === 'object' && error !== null && 'status' in error
      ? Number(error.status)
      : undefined;
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (
      status !== 404
      && !message.includes('no rows')
      && !message.includes('not found')
      && !message.includes("wasn't found")
    ) {
      throw error;
    }
  }

  await users.create({ ...payload, name: 'Admin' });
  console.log(`Created app admin user ${adminEmail}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});