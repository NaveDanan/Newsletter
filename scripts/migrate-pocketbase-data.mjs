import PocketBase from 'pocketbase';
import { APP_COLLECTION_SCHEMAS } from './pocketbase/app-schema.mjs';
import { loadProjectEnv, resolvePocketBaseUrl } from './pocketbase/load-env.mjs';

const USER_ROLES = ['viewer', 'author', 'manager', 'general_manager', 'admin'];
const USER_LOCALES = ['he', 'en'];
const DEFAULT_USER_LOCALE = 'he';
const SCHEDULED_DIGEST_JOB_KEY = 'newsletter_publication_digest';

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

function escapeFilterValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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

function upsertSelectField(fields, fieldName, values) {
  const desiredField = {
    name: fieldName,
    type: 'select',
    required: false,
    hidden: false,
    maxSelect: 1,
    values,
  };
  const existingIndex = fields.findIndex((field) => field.name === fieldName);

  if (existingIndex === -1) {
    return [...fields, desiredField];
  }

  const nextFields = [...fields];
  nextFields[existingIndex] = {
    ...fields[existingIndex],
    ...desiredField,
    id: fields[existingIndex].id,
  };

  return nextFields;
}

async function syncCollection(pb, schema, dryRun) {
  let existingCollection = null;

  try {
    existingCollection = await pb.collections.getOne(schema.name);
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }

  if (!existingCollection) {
    if (!dryRun) {
      await pb.collections.create(schema);
    }
    console.log(`${dryRun ? '[dry-run] Would create' : 'Created'} collection "${schema.name}".`);
    return;
  }

  const payload = {
    ...schema,
    fields: mergeFields(existingCollection.fields, schema.fields),
    indexes: schema.indexes ?? existingCollection.indexes ?? [],
  };

  if (!dryRun) {
    await pb.collections.update(existingCollection.id, payload);
  }
  console.log(`${dryRun ? '[dry-run] Would sync' : 'Synced'} collection "${schema.name}".`);
}

async function syncAppSchema(pb, dryRun) {
  for (const schema of APP_COLLECTION_SCHEMAS) {
    await syncCollection(pb, schema, dryRun);
  }
}

async function syncUsersSchema(pb, dryRun) {
  const usersCollection = await pb.collections.getOne('users');
  const nextFields = upsertSelectField(
    upsertSelectField(usersCollection.fields, 'role', USER_ROLES),
    'locale',
    USER_LOCALES,
  );
  const payload = {
    fields: nextFields,
    createRule: '@request.body.role:isset = false || @request.body.role = "viewer"',
    listRule: 'id = @request.auth.id || @request.auth.role = "admin"',
    viewRule: 'id = @request.auth.id || @request.auth.role = "admin"',
    updateRule: '(@request.auth.id = id && @request.body.role:changed = false) || @request.auth.role = "admin"',
    deleteRule: 'id = @request.auth.id || @request.auth.role = "admin"',
    manageRule: '@request.auth.role = "admin"',
  };

  if (!dryRun) {
    await pb.collections.update('users', payload);
  }

  console.log(`${dryRun ? '[dry-run] Would sync' : 'Synced'} users collection schema.`);
}

async function backfillUserLocales(pb, dryRun) {
  const users = await pb.collection('users').getFullList({ sort: 'created' });
  let updated = 0;

  for (const user of users) {
    if (USER_LOCALES.includes(user.locale)) {
      continue;
    }

    updated += 1;
    if (!dryRun) {
      await pb.collection('users').update(user.id, { locale: DEFAULT_USER_LOCALE });
    }
  }

  console.log(`${dryRun ? '[dry-run] Would backfill' : 'Backfilled'} locale for ${updated} user(s).`);
}

async function ensureConfiguredAdminRole(pb, env, dryRun) {
  const adminEmail = (env.POCKETBASE_ADMIN_EMAIL?.trim() || env.VITE_ADMIN_EMAIL?.trim() || '').toLowerCase();
  if (!adminEmail) {
    console.log('No configured admin email found; skipped admin role backfill.');
    return;
  }

  try {
    const user = await pb.collection('users').getFirstListItem(`email = "${escapeFilterValue(adminEmail)}"`);
    if (user.role === 'admin') {
      console.log(`Admin role already assigned to ${adminEmail}.`);
      return;
    }

    if (!dryRun) {
      await pb.collection('users').update(user.id, { role: 'admin' });
    }
    console.log(`${dryRun ? '[dry-run] Would assign' : 'Assigned'} admin role to ${adminEmail}.`);
  } catch (error) {
    if (isNotFoundError(error)) {
      console.log(`Configured admin user ${adminEmail} does not exist yet; skipped role backfill.`);
      return;
    }
    throw error;
  }
}

async function ensureScheduledDigestJob(pb, dryRun) {
  try {
    await pb.collection('scheduled_jobs').getFirstListItem(`key = "${SCHEDULED_DIGEST_JOB_KEY}"`);
    console.log('Scheduled newsletter digest job already exists.');
    return;
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }

  const payload = {
    key: SCHEDULED_DIGEST_JOB_KEY,
    enabled: false,
    intervalMinutes: 10080,
    maxNewsletters: 4,
    lastRunAt: '',
    lastSuccessAt: '',
    lastError: '',
    lastResult: {},
    updatedBy: '',
  };

  if (!dryRun) {
    await pb.collection('scheduled_jobs').create(payload);
  }
  console.log(`${dryRun ? '[dry-run] Would create' : 'Created'} scheduled newsletter digest job.`);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const env = loadProjectEnv();
  const pocketbaseUrl = resolvePocketBaseUrl(env);
  const superuserEmail = requireEnvValue(env, ['POCKETBASE_SUPERUSER_EMAIL']);
  const superuserPassword = requireEnvValue(env, ['POCKETBASE_SUPERUSER_PASSWORD']);

  const pb = new PocketBase(pocketbaseUrl);
  await pb.collection('_superusers').authWithPassword(superuserEmail, superuserPassword);

  console.log(`${dryRun ? 'Dry-running' : 'Running'} PocketBase data migration at ${pocketbaseUrl}.`);
  await syncAppSchema(pb, dryRun);
  await syncUsersSchema(pb, dryRun);
  await backfillUserLocales(pb, dryRun);
  await ensureConfiguredAdminRole(pb, env, dryRun);
  await ensureScheduledDigestJob(pb, dryRun);
  console.log('PocketBase data migration completed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
