/**
 * Test script: create a newsletter and upload a PowerPoint presentation to it.
 *
 * Usage:
 *   node test_newsletter_pptx.mjs
 *
 * Requires POCKETBASE_URL, POCKETBASE_SUPERUSER_EMAIL, POCKETBASE_SUPERUSER_PASSWORD
 * to be set in .env / .env.local / environment, OR falls back to docker defaults.
 */

import fs from 'node:fs';
import path from 'node:path';
import PocketBase from 'pocketbase';
import { loadProjectEnv } from './scripts/pocketbase/load-env.mjs';

const PPTX_PATH = String.raw`C:\Users\naved\Downloads\The_AI_Coding_Harness.pptx`;

// ── helpers ──────────────────────────────────────────────────────────────────

function loadEnv() {
  const base = loadProjectEnv();
  // Also try .env.docker.example as fallback when no .env exists
  const examplePath = path.join(process.cwd(), '.env.docker.example');
  if (fs.existsSync(examplePath)) {
    const lines = fs.readFileSync(examplePath, 'utf8').split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const sep = line.indexOf('=');
      if (sep === -1) continue;
      const key = line.slice(0, sep).trim();
      const val = line.slice(sep + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!base[key]) base[key] = val;
    }
  }
  return base;
}

function requireEnv(env, keys) {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  throw new Error(`Missing env var. Tried: ${keys.join(', ')}`);
}

function fileToBlob(filePath) {
  const buf = fs.readFileSync(filePath);
  const name = path.basename(filePath);
  return new File([buf], name, {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const env = loadEnv();
  const pbUrl = requireEnv(env, ['POCKETBASE_URL', 'VITE_POCKETBASE_URL']);

  // Authenticate as a regular user (admin role) so createRule passes
  const userEmail = requireEnv(env, ['POCKETBASE_ADMIN_EMAIL']);
  const userPassword = requireEnv(env, ['POCKETBASE_ADMIN_PASSWORD']);

  console.log(`Connecting to PocketBase at ${pbUrl}…`);
  const pb = new PocketBase(pbUrl);
  await pb.collection('users').authWithPassword(userEmail, userPassword);
  console.log(`Authenticated as ${userEmail}`);

  // 1. Create newsletter
  console.log('\n── Creating newsletter ──');
  const newsletter = await pb.collection('newsletters').create({
    title: 'Test Newsletter – PPTX Upload',
    subtitle: 'Automated test for PowerPoint presentation upload',
    content: '<p>This newsletter was created by <code>test_newsletter_pptx.mjs</code>.</p>',
    excerpt: 'Automated test for PowerPoint presentation upload',
    author: 'Test Script',
    status: 'draft',
    publishedAt: new Date().toISOString().split('T')[0],
    tags: ['test', 'pptx'],
    likes: 0,
    comments: 0,
    shares: 0,
    likedByUserIds: [],
    commentItems: [],
  });
  console.log(`Created newsletter  id=${newsletter.id}  title="${newsletter.title}"`);

  // 2. Upload PowerPoint
  console.log('\n── Uploading PowerPoint ──');
  if (!fs.existsSync(PPTX_PATH)) {
    throw new Error(`PowerPoint file not found: ${PPTX_PATH}`);
  }
  const file = fileToBlob(PPTX_PATH);
  console.log(`File: ${file.name}  (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

  const formData = new FormData();
  formData.append('presentationFiles+', file);

  const updated = await pb.collection('newsletters').update(newsletter.id, formData);
  const uploadedFiles = updated.presentationFiles ?? [];
  console.log(`Upload complete – presentationFiles: [${uploadedFiles.join(', ')}]`);

  // 3. Verify
  console.log('\n── Verification ──');
  const fetched = await pb.collection('newsletters').getOne(newsletter.id);
  const files = fetched.presentationFiles ?? [];
  if (files.length === 0) {
    throw new Error('FAIL: No presentation files found on the newsletter record.');
  }

  const fileUrl = pb.files.getURL(fetched, files[0]);
  console.log(`Presentation file URL: ${fileUrl}`);
  console.log(`\n✅  Test passed – newsletter ${newsletter.id} has ${files.length} presentation file(s).`);
}

main().catch((err) => {
  console.error('\n❌  Test failed:', err.message ?? err);
  if (err.response) console.error('PocketBase response:', JSON.stringify(err.response, null, 2));
  process.exit(1);
});
