import PocketBase from 'pocketbase';
import { loadProjectEnv, resolvePocketBaseUrl } from './pocketbase/load-env.mjs';

const DEFAULT_DROPDOWNS = [
  { key: 'ai-workflows', label: 'AI Workflows', dotColor: '#171717', order: 0 },
  { key: 'case-studies', label: 'Case Studies', dotColor: '#D93A3A', order: 1 },
  { key: 'resources', label: 'Resources', dotColor: '#A3A3A3', order: 2 },
];

function requireEnvValue(env, keys) {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      return value;
    }
  }

  throw new Error(`Missing required configuration. Tried: ${keys.join(', ')}`);
}

function normalizeLabel(value) {
  return String(value ?? '').trim().toLowerCase();
}

async function ensureDefaultDropdowns(pb) {
  const dropdownsCollection = pb.collection('nav_dropdowns');
  const existingDropdowns = await dropdownsCollection.getFullList({ sort: 'order' });
  const dropdownsByLabel = new Map(existingDropdowns.map((dropdown) => [normalizeLabel(dropdown.label), dropdown]));
  const dropdownsByKey = new Map();

  for (const dropdown of DEFAULT_DROPDOWNS) {
    const existing = dropdownsByLabel.get(normalizeLabel(dropdown.label));
    if (existing) {
      dropdownsByKey.set(dropdown.key, existing);
      continue;
    }

    const created = await dropdownsCollection.create({
      label: dropdown.label,
      dotColor: dropdown.dotColor,
      hidden: false,
      order: dropdown.order,
    });
    dropdownsByKey.set(dropdown.key, created);
    console.log(`Created shared dropdown: ${dropdown.label}`);
  }

  for (const dropdown of DEFAULT_DROPDOWNS) {
    if (!dropdownsByKey.has(dropdown.key)) {
      dropdownsByKey.set(dropdown.key, dropdownsByLabel.get(normalizeLabel(dropdown.label)));
    }
  }

  return dropdownsByKey;
}

async function repairOrphanedLinks(pb, dropdownsByKey) {
  const linksCollection = pb.collection('navigation_links');
  const dropdownsCollection = pb.collection('nav_dropdowns');
  const existingDropdowns = await dropdownsCollection.getFullList({ sort: 'order' });
  const existingDropdownIds = new Set(existingDropdowns.map((dropdown) => dropdown.id));
  const dropdownIdByLegacyKey = new Map(
    DEFAULT_DROPDOWNS.map((dropdown) => [dropdown.key, dropdownsByKey.get(dropdown.key)?.id]).filter((entry) => entry[1]),
  );
  const resourcesDropdownId = dropdownIdByLegacyKey.get('resources');

  if (!resourcesDropdownId) {
    throw new Error('Resources dropdown was not created or found.');
  }

  const links = await linksCollection.getFullList({ sort: 'created' });
  let updatedCount = 0;

  for (const link of links) {
    if (existingDropdownIds.has(link.dropdownId)) {
      continue;
    }

    const repairedDropdownId = dropdownIdByLegacyKey.get(link.dropdownId) ?? resourcesDropdownId;
    await linksCollection.update(link.id, { dropdownId: repairedDropdownId });
    updatedCount += 1;
    console.log(`Reassigned link "${link.name}" to shared dropdown ${repairedDropdownId}`);
  }

  if (updatedCount === 0) {
    console.log('No orphaned navigation links needed repair.');
    return;
  }

  console.log(`Repaired ${updatedCount} orphaned navigation link(s).`);
}

async function main() {
  const env = loadProjectEnv();
  const pocketbaseUrl = resolvePocketBaseUrl(env);
  const superuserEmail = requireEnvValue(env, ['POCKETBASE_SUPERUSER_EMAIL']);
  const superuserPassword = requireEnvValue(env, ['POCKETBASE_SUPERUSER_PASSWORD']);

  const pb = new PocketBase(pocketbaseUrl);
  await pb.collection('_superusers').authWithPassword(superuserEmail, superuserPassword);

  const dropdownsByKey = await ensureDefaultDropdowns(pb);
  await repairOrphanedLinks(pb, dropdownsByKey);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});