import PocketBase from 'pocketbase';
import { loadProjectEnv, resolvePocketBaseUrl } from './pocketbase/load-env.mjs';

const USER_ROLES = new Set(['viewer', 'author', 'manager', 'general_manager', 'admin']);

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

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const role = process.argv[3]?.trim().toLowerCase();

  if (!email || !role) {
    throw new Error('Usage: node scripts/set-pocketbase-user-role.mjs <email> <viewer|author|manager|general_manager|admin>');
  }

  if (!USER_ROLES.has(role)) {
    throw new Error(`Invalid role "${role}". Expected one of: ${Array.from(USER_ROLES).join(', ')}`);
  }

  const env = loadProjectEnv();
  const pocketbaseUrl = resolvePocketBaseUrl(env);
  const superuserEmail = requireEnvValue(env, ['POCKETBASE_SUPERUSER_EMAIL']);
  const superuserPassword = requireEnvValue(env, ['POCKETBASE_SUPERUSER_PASSWORD']);

  const pb = new PocketBase(pocketbaseUrl);
  await pb.collection('_superusers').authWithPassword(superuserEmail, superuserPassword);

  const user = await pb.collection('users').getFirstListItem(
    `email = "${escapeFilterValue(email)}"`,
  );

  await pb.collection('users').update(user.id, { role });
  console.log(`Assigned role "${role}" to ${email}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
