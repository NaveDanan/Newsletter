import PocketBase from 'pocketbase';
import { loadProjectEnv } from './pocketbase/load-env.mjs';

// ---------------------------------------------------------------------------
// Field helpers — match PocketBase 0.22+ field schema
// ---------------------------------------------------------------------------

const text = (name, max = 0) => ({ name, type: 'text', required: false, max });
const number = (name, min = 0) => ({ name, type: 'number', required: false, min, onlyInt: false });
const bool = (name) => ({ name, type: 'bool', required: false });
const json = (name) => ({ name, type: 'json', required: false, maxSize: 5000000 });
const autodate = (name, onCreate = true, onUpdate = false) => ({ name, type: 'autodate', required: false, onCreate, onUpdate });

// ---------------------------------------------------------------------------
// Collection schemas
// ---------------------------------------------------------------------------

const PROJECTS_SCHEMA = {
  name: 'projects',
  type: 'base',
  fields: [
    autodate('created', true, false),
    autodate('updated', true, true),
    text('title', 10000),
    text('description', 20000000),
    text('department'),
    text('devision'),   // ⚠️ intentional spelling — matches our app code
    text('field'),
    text('status'),
    bool('isVisibleInGantt'),
    json('gantt'),      // stores the full ProjectGantt object
  ],
  listRule:   '@request.auth.id != ""',
  viewRule:   '@request.auth.id != ""',
  createRule: '@request.auth.id != ""',
  updateRule: '@request.auth.id != ""',
  deleteRule: '@request.auth.id != ""',
};

const NEWSLETTERS_SCHEMA = {
  name: 'newsletters',
  type: 'base',
  fields: [
    autodate('created', true, false),
    autodate('updated', true, true),
    text('title', 10000),
    text('subtitle', 10000),
    text('content', 20000000),          // stores HTML content (large)
    text('excerpt', 20000000),
    text('author'),
    text('authorAvatar', 20000000),
    text('createdById'),
    text('publishedAt'),
    text('readTime'),
    text('coverImage', 20000000),
    bool('hasAudio'),
    text('audioDuration'),
    number('likes'),
    number('comments'),
    number('shares'),
    text('status'),           // 'draft' | 'published'
    json('tags'),             // string[]
    json('likedByUserIds'),   // string[]
    json('commentItems'),     // NewsletterComment[]
  ],
  // Public read — newsletters appear on the homepage without login
  listRule:   '',
  viewRule:   '',
  createRule: '@request.auth.id != ""',
  updateRule: '@request.auth.id != ""',
  deleteRule: '@request.auth.id != ""',
};

const NAVIGATION_LINKS_SCHEMA = {
  name: 'navigation_links',
  type: 'base',
  fields: [
    autodate('created', true, false),
    autodate('updated', true, true),
    text('name', 1000),
    text('description', 5000),
    text('url', 200000),
    text('iconUrl', 200000),
  ],
  listRule:   '',
  viewRule:   '',
  createRule: '@request.auth.role = "admin"',
  updateRule: '@request.auth.role = "admin"',
  deleteRule: '@request.auth.role = "admin"',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireEnvValue(env, keys) {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  throw new Error(`Missing required env variable. Tried: ${keys.join(', ')}`);
}

async function recreateCollection(pb, schema) {
  try {
    const existing = await pb.collections.getOne(schema.name);
    console.log(`  🗑️  Dropping old "${schema.name}" collection...`);
    await pb.collections.delete(existing.id);
  } catch {
    // doesn't exist yet
  }

  await pb.collections.create(schema);
  console.log(`  ✅  Collection "${schema.name}" created successfully.`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const env = loadProjectEnv();

  const pocketbaseUrl = requireEnvValue(env, ['POCKETBASE_URL', 'VITE_POCKETBASE_URL']);
  const superuserEmail = requireEnvValue(env, ['POCKETBASE_SUPERUSER_EMAIL']);
  const superuserPassword = requireEnvValue(env, ['POCKETBASE_SUPERUSER_PASSWORD']);

  console.log(`\n🔌  Connecting to PocketBase at ${pocketbaseUrl}...`);
  const pb = new PocketBase(pocketbaseUrl);

  console.log(`🔐  Authenticating as superuser (${superuserEmail})...`);
  await pb.collection('_superusers').authWithPassword(superuserEmail, superuserPassword);
  console.log('    Authenticated!\n');

  console.log('📁  Recreating "projects" collection...');
  await recreateCollection(pb, PROJECTS_SCHEMA);

  console.log('📰  Recreating "newsletters" collection...');
  await recreateCollection(pb, NEWSLETTERS_SCHEMA);

  console.log('🔗  Recreating "navigation_links" collection...');
  await recreateCollection(pb, NAVIGATION_LINKS_SCHEMA);

  console.log('\n✨  Done! All collections are ready in PocketBase.');
  console.log('    Refresh the app and sign in to start using them.\n');
}

main().catch((error) => {
  console.error('\n❌  Error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
