import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProjectEnv } from '../../scripts/pocketbase/load-env.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_FIXTURE = 'tests/fixtures/newsletter.json';

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const name = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      options[name] = 'true';
      continue;
    }

    options[name] = next;
    index += 1;
  }

  return options;
}

function normalizeUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function asString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asStringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.length > 0)
    : [];
}

function asCommentItems(value) {
  return Array.isArray(value) ? value : [];
}

function asCount(value) {
  return Number.isFinite(value) ? value : 0;
}

function normalizeTextAlignment(value) {
  return value === 'center' || value === 'left' || value === 'right' ? value : 'right';
}

function resolveFixturePath(value) {
  const fixturePath = value || DEFAULT_FIXTURE;
  return path.isAbsolute(fixturePath) ? fixturePath : path.join(ROOT, fixturePath);
}

function loadFixture(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function buildCreatePayload(source) {
  const payload = {
    title: asString(source.title),
    subtitle: asString(source.subtitle),
    content: asString(source.content),
    excerpt: asString(source.excerpt),
    author: asString(source.author),
    authorAvatar: asString(source.authorAvatar),
    readTime: asString(source.readTime),
    coverImage: asString(source.coverImage),
    textAlignment: normalizeTextAlignment(source.textAlignment),
    tags: asStringArray(source.tags),
    likes: asCount(source.likes),
    comments: asCount(source.comments),
    shares: asCount(source.shares),
    likedByUserIds: asStringArray(source.likedByUserIds),
    bookmarkedByUserIds: asStringArray(source.bookmarkedByUserIds),
    commentItems: asCommentItems(source.commentItems),
    presentationFiles: asStringArray(source.presentationFiles),
    status: source.status === 'draft' ? 'draft' : 'published',
    publishedAt: asString(source.publishedAt),
  };

  if (source.presentationPreviewManifest && typeof source.presentationPreviewManifest === 'object') {
    payload.presentationPreviewManifest = source.presentationPreviewManifest;
  }

  if (typeof source.createdById === 'string' && source.createdById.trim()) {
    payload.createdById = source.createdById.trim();
  }

  return payload;
}

async function apiFetch(baseUrl, pathName, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${baseUrl}${pathName}`, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (options.expected !== undefined) {
    assert.equal(response.status, options.expected, `${pathName} returned ${response.status}: ${text}`);
  }

  return { response, data, text };
}

async function authenticate(baseUrl, email, password) {
  const result = await apiFetch(baseUrl, '/api/collections/users/auth-with-password', {
    method: 'POST',
    expected: 200,
    body: {
      identity: email,
      password,
    },
  });

  const token = typeof result.data?.token === 'string' ? result.data.token : '';
  assert.ok(token, 'Authentication did not return a token.');
  return token;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help === 'true') {
    console.log([
      'Usage: node tests/scripts/add-newsletter-fixture.mjs [options]',
      '',
      'Options:',
      '  --base-url <url>    App base URL. Default: http://localhost:7080',
      '  --fixture <path>    Fixture path. Default: tests/geektime-ai-newsletter-2026-07-13.json',
      '  --email <email>     Login email. Default: POCKETBASE_ADMIN_EMAIL or VITE_ADMIN_EMAIL',
      '  --password <pass>   Login password. Default: POCKETBASE_ADMIN_PASSWORD or VITE_ADMIN_PASSWORD',
    ].join('\n'));
    return;
  }

  const env = loadProjectEnv(ROOT);
  const baseUrl = normalizeUrl(args['base-url'] || env.TEST_API_BASE_URL || 'http://localhost:7080');
  const fixturePath = resolveFixturePath(args.fixture);
  const email = String(args.email || env.POCKETBASE_ADMIN_EMAIL || env.VITE_ADMIN_EMAIL || '').trim();
  const password = String(args.password || env.POCKETBASE_ADMIN_PASSWORD || env.VITE_ADMIN_PASSWORD || '').trim();

  assert.ok(baseUrl, 'A base URL is required.');
  assert.ok(email, 'A login email is required. Pass --email or set POCKETBASE_ADMIN_EMAIL.');
  assert.ok(password, 'A login password is required. Pass --password or set POCKETBASE_ADMIN_PASSWORD.');
  assert.ok(fs.existsSync(fixturePath), `Fixture file not found: ${fixturePath}`);

  const source = loadFixture(fixturePath);
  const payload = buildCreatePayload(source);
  const token = await authenticate(baseUrl, email, password);

  const created = await apiFetch(baseUrl, '/api/newsletters', {
    method: 'POST',
    token,
    expected: 201,
    body: payload,
  });

  assert.equal(created.data.title, payload.title, 'Created title does not match fixture title.');
  assert.equal(created.data.status, payload.status, 'Created status does not match fixture status.');
  assert.equal(created.data.publishedAt, payload.publishedAt, 'Created publishedAt does not match fixture.');
  assert.deepEqual(created.data.tags, payload.tags, 'Created tags do not match fixture tags.');
  assert.equal(created.data.textAlignment, payload.textAlignment, 'Created textAlignment does not match fixture.');

  console.log(`Created newsletter ${created.data.id} from fixture ${path.relative(ROOT, fixturePath)}.`);
  console.log(`Title: ${created.data.title}`);
  console.log(`Status: ${created.data.status}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
