import { openAsBlob } from 'node:fs';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const baseUrl = 'http://127.0.0.1:8090';
const envPath = path.resolve('.env.docker.example');
const sourceRoot = path.resolve('C:/Users/naved/Downloads/pocketbase_0.36.8_windows_amd64/pb_data');
const dataDbPath = path.join(sourceRoot, 'data.db');
const collections = [
  ['projects', 'projects'],
  ['newsletters', 'newsletters'],
  ['users', 'users'],
  ['links', 'links'],
  ['navigationLinks', 'navigation_links'],
  ['dropdowns', 'nav_dropdowns'],
  ['subscribers', 'newsletter_subscribers'],
];

function parseEnvFile(content) {
  const values = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    values[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
  return values;
}

async function requestJson(url, { method = 'GET', token, body, headers } = {}) {
  const response = await fetch(url, {
    method,
    body,
    headers: {
      ...(token ? { Authorization: token } : {}),
      ...(headers ?? {}),
    },
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new Error(`${method} ${url} failed with ${response.status}: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`);
  }

  return payload;
}

async function getCounts(token) {
  const counts = {};
  for (const [key, collection] of collections) {
    const payload = await requestJson(`${baseUrl}/api/collections/${collection}/records?page=1&perPage=1`, { token });
    counts[key] = payload.totalItems;
  }
  return counts;
}

async function listFiles(rootDir, currentDir = rootDir) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(rootDir, absolutePath));
      continue;
    }

    files.push({
      absolutePath,
      relativePath: path.relative(rootDir, absolutePath).replace(/\\/g, '/'),
    });
  }

  return files;
}

async function main() {
  await access(envPath);
  await access(sourceRoot);
  await access(dataDbPath);

  const env = parseEnvFile(await readFile(envPath, 'utf8'));
  const identity = env.POCKETBASE_ADMIN_EMAIL;
  const password = env.POCKETBASE_ADMIN_PASSWORD;

  if (!identity || !password) {
    throw new Error('Missing PocketBase admin credentials in .env.docker.example');
  }

  const authPayload = await requestJson(`${baseUrl}/api/collections/users/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity, password }),
  });

  const token = authPayload.token;
  const beforeCounts = await getCounts(token);

  const inspectForm = new FormData();
  inspectForm.append('dataDb', await openAsBlob(dataDbPath), 'data.db');
  const inspectResponse = await requestJson(`${baseUrl}/api/newsletter/migrate/inspect`, {
    method: 'POST',
    token,
    body: inspectForm,
  });

  const sourceFiles = await listFiles(sourceRoot);
  const importForm = new FormData();
  for (const file of sourceFiles) {
    importForm.append('sourceFiles', await openAsBlob(file.absolutePath), file.relativePath);
  }

  const importResponse = await requestJson(`${baseUrl}/api/newsletter/migrate/import`, {
    method: 'POST',
    token,
    body: importForm,
  });

  console.log(JSON.stringify({
    authenticatedAs: authPayload.record?.email ?? identity,
    beforeCounts,
    inspectResponse,
    uploadFileCount: sourceFiles.length,
    importResponse,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
