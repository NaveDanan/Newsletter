import fs from 'node:fs';
import path from 'node:path';

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const entries = {};
  const content = fs.readFileSync(filePath, 'utf8');

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    entries[key] = value;
  }

  return entries;
}

export function loadProjectEnv(cwd = process.cwd()) {
  return {
    ...parseEnvFile(path.join(cwd, '.env')),
    ...parseEnvFile(path.join(cwd, '.env.local')),
    ...process.env,
  };
}

function normalizeUrl(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\/+$/, '');
}

function resolveFromAppPublicUrl(value) {
  const normalizedValue = normalizeUrl(value);
  if (!normalizedValue) {
    return '';
  }

  try {
    const url = new URL(normalizedValue);
    const isLocalHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

    if (isLocalHost) {
      return `${url.protocol}//${url.hostname}:8090`;
    }

    return url.origin;
  } catch {
    return '';
  }
}

export function resolvePocketBaseUrl(env) {
  return normalizeUrl(env.POCKETBASE_URL)
    || normalizeUrl(env.VITE_POCKETBASE_URL)
    || normalizeUrl(env.POCKETBASE_PUBLIC_URL)
    || resolveFromAppPublicUrl(env.APP_PUBLIC_URL)
    || 'http://127.0.0.1:8090';
}
