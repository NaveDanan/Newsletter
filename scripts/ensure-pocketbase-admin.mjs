import PocketBase from 'pocketbase';
import { loadProjectEnv } from './pocketbase/load-env.mjs';

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

async function main() {
  const env = loadProjectEnv();
  const pocketbaseUrl = requireEnvValue(env, ['POCKETBASE_URL', 'VITE_POCKETBASE_URL']);
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
    name: 'Admin',
    role: 'admin',
    verified: true,
  };

  try {
    const existingUser = await users.getFirstListItem(`email = "${escapeFilterValue(adminEmail)}"`);
    await users.update(existingUser.id, payload);
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

  await users.create(payload);
  console.log(`Created app admin user ${adminEmail}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});