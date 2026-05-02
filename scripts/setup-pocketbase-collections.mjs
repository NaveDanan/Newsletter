import PocketBase from 'pocketbase';
import { APP_COLLECTION_SCHEMAS } from './pocketbase/app-schema.mjs';
import { loadProjectEnv, resolvePocketBaseUrl } from './pocketbase/load-env.mjs';

function requireEnvValue(env, keys) {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      return value;
    }
  }

  throw new Error(`Missing required env variable. Tried: ${keys.join(', ')}`);
}

async function recreateCollection(pb, schema) {
  try {
    const existingCollection = await pb.collections.getOne(schema.name);
    console.log(`  🗑️  Dropping old "${schema.name}" collection...`);
    await pb.collections.delete(existingCollection.id);
  } catch {
    // collection doesn't exist yet
  }

  await pb.collections.create(schema);
  console.log(`  ✅  Collection "${schema.name}" created successfully.`);
}

async function main() {
  const env = loadProjectEnv();
  const pocketbaseUrl = resolvePocketBaseUrl(env);
  const superuserEmail = requireEnvValue(env, ['POCKETBASE_SUPERUSER_EMAIL']);
  const superuserPassword = requireEnvValue(env, ['POCKETBASE_SUPERUSER_PASSWORD']);

  console.log(`\n🔌  Connecting to PocketBase at ${pocketbaseUrl}...`);
  const pb = new PocketBase(pocketbaseUrl);

  console.log(`🔐  Authenticating as superuser (${superuserEmail})...`);
  await pb.collection('_superusers').authWithPassword(superuserEmail, superuserPassword);
  console.log('    Authenticated!\n');

  for (const schema of APP_COLLECTION_SCHEMAS) {
    console.log(`📦  Recreating "${schema.name}" collection...`);
    await recreateCollection(pb, schema);
  }

  console.log('\n✨  Done! All collections are ready in PocketBase.');
  console.log('    Refresh the app and sign in to start using them.\n');
}

main().catch((error) => {
  console.error('\n❌  Error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
