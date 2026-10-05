import PocketBase from 'pocketbase';
import { loadProjectEnv, resolvePocketBaseUrl } from './pocketbase/load-env.mjs';

const USER_ROLES = ['viewer', 'author', 'manager', 'general_manager', 'admin'];
const USER_LOCALES = ['he', 'en'];
const THEME_PREFERENCES = ['system', 'dark', 'light'];
const ACCENT_PRESETS = ['red', 'yellow', 'lime', 'cyan', 'purple', 'pink', 'orange', 'custom'];

// App-managed fields on the built-in users collection. Each sync merges these
// over whatever is stored, keeping the field id so PocketBase updates the
// column in place instead of dropping and re-adding it.
const USER_FIELDS = [
  { name: 'role', type: 'select', required: false, hidden: false, maxSelect: 1, values: USER_ROLES },
  { name: 'locale', type: 'select', required: false, hidden: false, maxSelect: 1, values: USER_LOCALES },
  { name: 'themePreference', type: 'select', required: false, hidden: false, maxSelect: 1, values: THEME_PREFERENCES },
  { name: 'accentPreset', type: 'select', required: false, hidden: false, maxSelect: 1, values: ACCENT_PRESETS },
  { name: 'accentCustomHex', type: 'text', required: false, hidden: false, max: 7, pattern: '^#[0-9a-fA-F]{6}$' },
  // Membership in the homepage "Our Writers" row. Admin-curated only: holding a
  // writing role never sets it, and the rules below stop users setting it.
  { name: 'featuredWriter', type: 'bool', required: false, hidden: false },
];

// Self-service writes may not touch privilege-bearing fields; only an admin can.
const OWNER_LOCKED_FIELDS = ['role', 'featuredWriter'];

const USERS_RULES = {
  createRule: '(@request.body.role:isset = false || @request.body.role = "viewer")'
    + ' && (@request.body.featuredWriter:isset = false || @request.body.featuredWriter = false)',
  listRule: 'id = @request.auth.id || @request.auth.role = "admin"',
  viewRule: 'id = @request.auth.id || @request.auth.role = "admin"',
  updateRule: `(@request.auth.id = id && ${OWNER_LOCKED_FIELDS.map((name) => `@request.body.${name}:changed = false`).join(' && ')})`
    + ' || @request.auth.role = "admin"',
  deleteRule: 'id = @request.auth.id || @request.auth.role = "admin"',
  manageRule: '@request.auth.role = "admin"',
};

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

function upsertField(fields, definition) {
  const existingIndex = fields.findIndex((field) => field.name === definition.name);
  if (existingIndex === -1) {
    return [...fields, definition];
  }

  const existingField = fields[existingIndex];
  const nextFields = [...fields];
  nextFields[existingIndex] = {
    ...existingField,
    ...definition,
    id: existingField.id,
  };

  return nextFields;
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
  const nextFields = USER_FIELDS.reduce(upsertField, usersCollection.fields);

  await pb.collections.update('users', {
    fields: nextFields,
    ...USERS_RULES,
  });

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
