import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProjectEnv } from './pocketbase/load-env.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = loadProjectEnv(ROOT);
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const image = env.NEWSLETTER_DOCKER_IMAGE || `newsletter:${packageJson.version}`;
const pocketbaseDistDir = env.POCKETBASE_DIST_DIR?.trim();

if (!pocketbaseDistDir) {
  throw new Error('POCKETBASE_DIST_DIR must be configured in .env or the process environment.');
}

if (!fs.existsSync(path.join(pocketbaseDistDir, 'pocketbase'))) {
  throw new Error(`POCKETBASE_DIST_DIR must contain a Linux PocketBase binary: ${pocketbaseDistDir}`);
}

console.log(`Building ${image} with PocketBase from ${pocketbaseDistDir}...`);
execFileSync('docker', [
  'buildx',
  'build',
  '--load',
  '--build-context',
  `pocketbase-dist=${pocketbaseDistDir}`,
  '-t',
  image,
  '.',
], {
  cwd: ROOT,
  env: { ...process.env, DOCKER_BUILDKIT: '1' },
  stdio: 'inherit',
});

console.log(`Built ${image}.`);
