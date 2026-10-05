import PocketBase from 'pocketbase';
import { loadProjectEnv, resolvePocketBaseUrl } from './pocketbase/load-env.mjs';
import { buildUsersCollectionUpdate } from './pocketbase/users-schema.mjs';

function escapeFilterValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function requireEnvValue(env, keys) {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      return value;
    }
  }

  throw new Error(`Missing required configuration. Tried: ${keys.join(', ')}`);
}

async function syncRoleByEmail(pb, email, role) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return;
  }

  try {
    const user = await pb.collection('users').getFirstListItem(
      `email = "${escapeFilterValue(normalizedEmail)}"`,
    );

    if (user.role !== role) {
      await pb.collection('users').update(user.id, { role });
      console.log(`Assigned role "${role}" to ${normalizedEmail}`);
      return;
    }

    console.log(`Role "${role}" already assigned to ${normalizedEmail}`);
  } catch (error) {
    console.warn(`Skipped role sync for ${normalizedEmail}: ${error.message}`);
  }
}

async function main() {
  const env = loadProjectEnv();
  const pocketbaseUrl = resolvePocketBaseUrl(env);
  const superuserEmail = requireEnvValue(env, ['POCKETBASE_SUPERUSER_EMAIL']);
  const superuserPassword = requireEnvValue(env, ['POCKETBASE_SUPERUSER_PASSWORD']);

  const pb = new PocketBase(pocketbaseUrl);
  await pb.collection('_superusers').authWithPassword(superuserEmail, superuserPassword);

  const usersCollection = await pb.collections.getOne('users');
  await pb.collections.update('users', buildUsersCollectionUpdate(usersCollection.fields));

  console.log('Synced users collection schema.');

  const adminEmails = new Set();
  const configuredAdminEmail = env.POCKETBASE_ADMIN_EMAIL?.trim() || env.VITE_ADMIN_EMAIL?.trim();
  if (configuredAdminEmail) {
    adminEmails.add(configuredAdminEmail);
  }

  for (const email of adminEmails) {
    await syncRoleByEmail(pb, email, 'admin');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
