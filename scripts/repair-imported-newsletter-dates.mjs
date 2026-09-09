import PocketBase from 'pocketbase';
import { loadProjectEnv, resolvePocketBaseUrl } from './pocketbase/load-env.mjs';
import { repairImportedPublicationDate } from './pocketbase/import-publication-date.mjs';

async function main() {
  const env = loadProjectEnv();
  const pb = new PocketBase(resolvePocketBaseUrl(env));
  await pb.collection('_superusers').authWithPassword(env.POCKETBASE_SUPERUSER_EMAIL, env.POCKETBASE_SUPERUSER_PASSWORD);
  const imports = await pb.collection('newsletter_imports').getFullList();
  const ids = new Set(imports.flatMap((item) => Array.isArray(item.newsletterIds) ? item.newsletterIds : []));
  let repaired = 0;
  for (const id of ids) {
    let article;
    try { article = await pb.collection('newsletters').getOne(id); }
    catch (error) { if (error.status === 404) continue; throw error; }
    const patch = repairImportedPublicationDate(article.content);
    if (!patch) continue;
    // Preserve editorial content and all other metadata, including workflow status.
    if (typeof article.excerpt === 'string') {
      patch.excerpt = article.excerpt.replace(/^\s*פורסם:\s*\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?(?:\s*(?:Z|[+-]\d{2}:?\d{2}))?)?\s*/u, '');
    }
    await pb.collection('newsletters').update(id, patch);
    repaired++;
  }
  console.log(`Corrected publication dates on ${repaired} imported newsletters.`);
}

main().catch((error) => {
  console.error('Imported newsletter date repair failed:', error.message);
  process.exit(1);
});
