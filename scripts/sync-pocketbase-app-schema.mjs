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

  throw new Error(`Missing required configuration. Tried: ${keys.join(', ')}`);
}

function isNotFoundError(error) {
  return Boolean(
    error
    && typeof error === 'object'
    && 'status' in error
    && error.status === 404,
  );
}

function mergeFields(existingFields = [], desiredFields = []) {
  const existingByName = new Map(existingFields.map((field) => [field.name, field]));
  const desiredNames = new Set(desiredFields.map((field) => field.name));

  const mergedFields = desiredFields.map((field) => {
    const existingField = existingByName.get(field.name);
    if (!existingField) {
      return field;
    }

    return {
      ...existingField,
      ...field,
      id: existingField.id,
    };
  });

  return [
    ...mergedFields,
    ...existingFields.filter((field) => !desiredNames.has(field.name)),
  ];
}

async function syncCollection(pb, schema) {
  let existingCollection = null;

  try {
    existingCollection = await pb.collections.getOne(schema.name);
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }

  if (!existingCollection) {
    await pb.collections.create(schema);
    console.log(`Created collection "${schema.name}".`);
    return;
  }

  await pb.collections.update(existingCollection.id, {
    ...schema,
    fields: mergeFields(existingCollection.fields, schema.fields),
    indexes: schema.indexes ?? existingCollection.indexes ?? [],
  });

  console.log(`Synced collection "${schema.name}".`);
}

async function main() {
  const env = loadProjectEnv();
  const pocketbaseUrl = resolvePocketBaseUrl(env);
  const superuserEmail = requireEnvValue(env, ['POCKETBASE_SUPERUSER_EMAIL']);
  const superuserPassword = requireEnvValue(env, ['POCKETBASE_SUPERUSER_PASSWORD']);

  const pb = new PocketBase(pocketbaseUrl);
  await pb.collection('_superusers').authWithPassword(superuserEmail, superuserPassword);

  for (const schema of APP_COLLECTION_SCHEMAS) {
    await syncCollection(pb, schema);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});