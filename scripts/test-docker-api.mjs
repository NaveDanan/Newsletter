import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PocketBase from 'pocketbase';
import { APP_COLLECTION_SCHEMAS } from './pocketbase/app-schema.mjs';
import { loadProjectEnv } from './pocketbase/load-env.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = loadProjectEnv(ROOT);
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const image = env.NEWSLETTER_DOCKER_IMAGE || `newsletter:${packageJson.version}`;
const skipBuild = process.argv.includes('--skip-build');
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const containerName = `newsletter-api-test-${runId}`;
const volumeName = `newsletter-api-test-data-${runId}`;
const superuserEmail = 'api-test-superuser@example.com';
const superuserPassword = 'api-test-superuser-password-12345';
const adminEmail = 'api-test-admin@example.com';
const adminPassword = 'api-test-admin-password-12345';
const authorEmail = 'api-test-author@example.com';
const authorPassword = 'api-test-author-password-12345';
const viewerEmail = 'api-test-viewer@example.com';
const viewerPassword = 'api-test-viewer-password-12345';

function run(command, args, options = {}) {
  const printable = [command, ...args].join(' ');
  if (!options.quiet) {
    console.log(`$ ${printable}`);
  }

  return execFileSync(command, args, {
    cwd: ROOT,
    env: { ...process.env, DOCKER_BUILDKIT: '1' },
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRequiredEnv(name) {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for Docker image build/testing.`);
  }
  return value;
}

async function waitFor(description, fn, timeoutMs = 120000) {
  const started = Date.now();
  let lastError;

  while (Date.now() - started < timeoutMs) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      await sleep(1000);
    }
  }

  throw new Error(`${description} did not become ready: ${lastError instanceof Error ? lastError.message : lastError}`);
}

function dockerPort(container, privatePort) {
  const output = run('docker', ['port', container, `${privatePort}/tcp`], { capture: true, quiet: true }).trim();
  const first = output.split(/\r?\n/)[0] || '';
  const port = first.split(':').pop();
  if (!port) {
    throw new Error(`Unable to resolve mapped Docker port for ${privatePort}/tcp.`);
  }
  return Number(port);
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

  const expected = options.expected ?? (response.status < 400 ? response.status : 200);
  if (Array.isArray(expected)) {
    assert.ok(expected.includes(response.status), `${pathName} returned ${response.status}: ${text}`);
  } else {
    assert.equal(response.status, expected, `${pathName} returned ${response.status}: ${text}`);
  }

  return { response, data };
}

function assertCollectionSchema(collection, expectedSchema) {
  const actualFields = collection.fields
    .filter((field) => field.name !== 'id')
    .map((field) => ({ name: field.name, type: field.type }));
  const expectedFields = expectedSchema.fields.map((field) => ({ name: field.name, type: field.type }));
  assert.deepEqual(actualFields, expectedFields, `${expectedSchema.name} fields changed`);
  assert.equal(collection.listRule ?? '', expectedSchema.listRule ?? '', `${expectedSchema.name} listRule changed`);
  assert.equal(collection.viewRule ?? '', expectedSchema.viewRule ?? '', `${expectedSchema.name} viewRule changed`);
  assert.equal(collection.createRule ?? '', expectedSchema.createRule ?? '', `${expectedSchema.name} createRule changed`);
  assert.equal(collection.updateRule ?? '', expectedSchema.updateRule ?? '', `${expectedSchema.name} updateRule changed`);
  assert.equal(collection.deleteRule ?? '', expectedSchema.deleteRule ?? '', `${expectedSchema.name} deleteRule changed`);
}

async function authUser(baseUrl, email, password) {
  const pb = new PocketBase(baseUrl);
  await pb.collection('users').authWithPassword(email, password);
  return pb;
}

async function createUser(superPb, email, password, role) {
  return superPb.collection('users').create({
    email,
    password,
    passwordConfirm: password,
    name: role,
    role,
    verified: true,
  });
}

async function verifyOldSchemasAndCollectionApi(baseUrl) {
  console.log('Checking collection schemas and legacy collection API...');
  const superPb = new PocketBase(baseUrl);
  await superPb.collection('_superusers').authWithPassword(superuserEmail, superuserPassword);

  for (const schema of APP_COLLECTION_SCHEMAS) {
    const collection = await superPb.collections.getOne(schema.name);
    assertCollectionSchema(collection, schema);
  }

  await createUser(superPb, authorEmail, authorPassword, 'author');
  await createUser(superPb, viewerEmail, viewerPassword, 'viewer');
  const adminPb = await authUser(baseUrl, adminEmail, adminPassword);

  const legacyNewsletter = await adminPb.collection('newsletters').create({
    title: 'Legacy newsletter',
    subtitle: 'Legacy subtitle',
    content: '<p>Legacy body</p>',
    excerpt: 'Legacy body',
    author: 'Admin',
    publishedAt: '2026-07-06',
    readTime: '1 min read',
    coverImage: '',
    textAlignment: 'left',
    tags: ['legacy'],
    status: 'draft',
    likes: 0,
    comments: 0,
    shares: 0,
    likedByUserIds: [],
    bookmarkedByUserIds: [],
    commentItems: [],
  });
  const patchedNewsletter = await adminPb.collection('newsletters').update(legacyNewsletter.id, { status: 'published' });
  assert.equal(patchedNewsletter.status, 'published');
  await adminPb.collection('newsletters').getOne(legacyNewsletter.id);
  await adminPb.collection('newsletters').delete(legacyNewsletter.id);

  const legacyProject = await adminPb.collection('projects').create({
    title: 'Legacy project',
    description: 'Created through collection API',
    department: 'Engineering',
    devision: 'Platform',
    field: 'API',
    status: 'pending',
    isVisibleInGantt: true,
    gantt: { tasks: [], resources: [], roles: [], zoom: 'week', lastEditedAt: null },
    createdBy: adminPb.authStore.record.id,
    allowedUserIds: [],
  });
  const patchedProject = await adminPb.collection('projects').update(legacyProject.id, { status: 'in-progress' });
  assert.equal(patchedProject.status, 'in-progress');
  await adminPb.collection('projects').getOne(legacyProject.id);
  await adminPb.collection('projects').delete(legacyProject.id);

  return { superPb, adminPb };
}

async function verifyNewsletterApi(baseUrl, adminPb) {
  console.log('Checking newsletter API routes...');
  const authorPb = await authUser(baseUrl, authorEmail, authorPassword);
  const viewerPb = await authUser(baseUrl, viewerEmail, viewerPassword);

  const create = await apiFetch(baseUrl, '/api/newsletters', {
    method: 'POST',
    token: authorPb.authStore.token,
    expected: 201,
    body: {
      title: 'API newsletter',
      subtitle: 'Draft',
      content: '<p>API body</p>',
      excerpt: 'API body',
      author: 'Author',
      readTime: '1 min read',
      coverImage: '',
      textAlignment: 'left',
      tags: ['api'],
      status: 'draft',
      likes: 0,
      comments: 0,
      shares: 0,
      likedByUserIds: [],
      bookmarkedByUserIds: [],
      commentItems: [],
    },
  });
  const newsletterId = create.data.id;
  assert.equal(create.data.status, 'draft');
  assert.equal(create.data.createdById, authorPb.authStore.record.id);

  await apiFetch(baseUrl, `/api/newsletters/${newsletterId}`, { expected: 403 });
  await apiFetch(baseUrl, `/api/newsletters/${newsletterId}`, { token: viewerPb.authStore.token, expected: 403 });
  const authorDetail = await apiFetch(baseUrl, `/api/newsletters/${newsletterId}`, { token: authorPb.authStore.token });
  assert.equal(authorDetail.data.id, newsletterId);

  const publicList = await apiFetch(baseUrl, '/api/newsletters?status=published');
  assert.equal(publicList.data.items.some((item) => item.id === newsletterId), false);

  await apiFetch(baseUrl, `/api/newsletters/${newsletterId}`, {
    method: 'PATCH',
    token: authorPb.authStore.token,
    body: { title: 'API newsletter updated' },
  });
  await apiFetch(baseUrl, `/api/newsletters/${newsletterId}`, {
    method: 'PATCH',
    token: authorPb.authStore.token,
    expected: 400,
    body: { status: 'archived' },
  });
  await apiFetch(baseUrl, `/api/newsletters/${newsletterId}/make-public`, {
    method: 'POST',
    token: authorPb.authStore.token,
  });

  const publishedDetail = await apiFetch(baseUrl, `/api/newsletters/${newsletterId}`);
  assert.equal(publishedDetail.data.status, 'published');

  await apiFetch(baseUrl, `/api/newsletters/${newsletterId}/make-draft`, {
    method: 'POST',
    token: authorPb.authStore.token,
  });
  await apiFetch(baseUrl, `/api/newsletters/${newsletterId}`, {
    method: 'DELETE',
    token: authorPb.authStore.token,
    expected: 403,
  });
  await apiFetch(baseUrl, `/api/newsletters/${newsletterId}`, {
    method: 'DELETE',
    token: adminPb.authStore.token,
  });
}

async function verifyProjectApi(baseUrl, adminPb) {
  console.log('Checking project/task API routes...');
  const authorPb = await authUser(baseUrl, authorEmail, authorPassword);

  const createProject = await apiFetch(baseUrl, '/api/projects', {
    method: 'POST',
    token: authorPb.authStore.token,
    expected: 201,
    body: {
      title: 'API project',
      description: 'Project API test',
      department: 'Engineering',
      devision: 'Platform',
      field: 'Backend',
    },
  });
  const projectId = createProject.data.id;
  assert.equal(createProject.data.status, 'pending');
  assert.deepEqual(createProject.data.gantt.tasks, []);

  const list = await apiFetch(baseUrl, '/api/projects', { token: authorPb.authStore.token });
  assert.ok(list.data.items.some((item) => item.id === projectId));

  await apiFetch(baseUrl, `/api/projects/${projectId}`, { token: authorPb.authStore.token });
  const patchProject = await apiFetch(baseUrl, `/api/projects/${projectId}`, {
    method: 'PATCH',
    token: authorPb.authStore.token,
    body: { isVisibleInGantt: false, description: 'Updated' },
  });
  assert.equal(patchProject.data.isVisibleInGantt, false);

  const statusProject = await apiFetch(baseUrl, `/api/projects/${projectId}/status`, {
    method: 'PATCH',
    token: authorPb.authStore.token,
    body: { status: 'in-progress' },
  });
  assert.equal(statusProject.data.status, 'in-progress');
  await apiFetch(baseUrl, `/api/projects/${projectId}/status`, {
    method: 'PATCH',
    token: authorPb.authStore.token,
    expected: 400,
    body: { status: 'blocked' },
  });

  const emptyTasks = await apiFetch(baseUrl, `/api/projects/${projectId}/tasks`, { token: authorPb.authStore.token });
  assert.deepEqual(emptyTasks.data.items, []);

  const parent = await apiFetch(baseUrl, `/api/projects/${projectId}/tasks`, {
    method: 'POST',
    token: authorPb.authStore.token,
    expected: 201,
    body: {
      name: 'Parent task',
      startDate: '2026-07-06',
      durationDays: 3,
      progress: 10,
      status: 'pending',
    },
  });
  assert.equal(parent.data.indentLevel, 0);

  const subtask = await apiFetch(baseUrl, `/api/projects/${projectId}/tasks/${parent.data.id}/subtasks`, {
    method: 'POST',
    token: authorPb.authStore.token,
    expected: 201,
    body: {
      name: 'Child task',
      startDate: '2026-07-06',
      durationDays: 1,
      status: 'pending',
    },
  });
  assert.equal(subtask.data.indentLevel, parent.data.indentLevel + 1);

  const directSubtasks = await apiFetch(baseUrl, `/api/projects/${projectId}/tasks/${parent.data.id}/subtasks`, {
    token: authorPb.authStore.token,
  });
  assert.deepEqual(directSubtasks.data.items.map((item) => item.id), [subtask.data.id]);

  const dependent = await apiFetch(baseUrl, `/api/projects/${projectId}/tasks`, {
    method: 'POST',
    token: authorPb.authStore.token,
    expected: 201,
    body: {
      name: 'Dependent root',
      startDate: '2026-07-06',
      durationDays: 1,
      status: 'pending',
      predecessorIds: [subtask.data.id],
    },
  });
  assert.deepEqual(dependent.data.predecessorIds, [subtask.data.id]);

  const milestone = await apiFetch(baseUrl, `/api/projects/${projectId}/milestones`, {
    method: 'POST',
    token: authorPb.authStore.token,
    expected: 201,
    body: {
      name: 'Launch milestone',
      startDate: '2026-07-06',
      durationDays: 9,
      status: 'pending',
    },
  });
  assert.equal(milestone.data.milestone, true);
  assert.equal(milestone.data.durationDays, 0);

  const milestones = await apiFetch(baseUrl, `/api/projects/${projectId}/milestones`, { token: authorPb.authStore.token });
  assert.ok(milestones.data.items.some((item) => item.id === milestone.data.id));

  const patchTask = await apiFetch(baseUrl, `/api/projects/${projectId}/tasks/${subtask.data.id}`, {
    method: 'PATCH',
    token: authorPb.authStore.token,
    body: { progress: 60, status: 'in-progress' },
  });
  assert.equal(patchTask.data.progress, 60);

  const statusTask = await apiFetch(baseUrl, `/api/projects/${projectId}/tasks/${subtask.data.id}/status`, {
    method: 'PATCH',
    token: authorPb.authStore.token,
    body: { status: 'completed' },
  });
  assert.equal(statusTask.data.status, 'completed');
  assert.equal(statusTask.data.progress, 100);

  // Parent status is derived from its descendants by the Gantt scheduler.
  const completedTasks = await apiFetch(baseUrl, `/api/projects/${projectId}/tasks`, {
    token: authorPb.authStore.token,
  });
  const completedParent = completedTasks.data.items.find((task) => task.id === parent.data.id);
  assert.equal(completedParent.status, 'completed');
  assert.equal(completedParent.progress, 100);
  assert.equal(completedTasks.data.items.find((task) => task.id === dependent.data.id).status, 'pending');

  await apiFetch(baseUrl, `/api/projects/${projectId}/tasks/${parent.data.id}`, {
    method: 'DELETE',
    token: authorPb.authStore.token,
  });
  const remainingTasks = await apiFetch(baseUrl, `/api/projects/${projectId}/tasks`, { token: authorPb.authStore.token });
  assert.equal(remainingTasks.data.items.some((task) => task.id === parent.data.id || task.id === subtask.data.id), false);
  const remainingDependent = remainingTasks.data.items.find((task) => task.id === dependent.data.id);
  assert.deepEqual(remainingDependent.predecessorIds, []);

  await adminPb.collection('projects').delete(projectId);
}

async function verifyFrontend(frontendUrl) {
  console.log('Checking bundled frontend and runtime config...');
  const index = await fetch(frontendUrl);
  assert.equal(index.status, 200);
  const appConfig = await fetch(`${frontendUrl}/app-config.js`);
  assert.equal(appConfig.status, 200);
  const text = await appConfig.text();
  assert.match(text, /VITE_POCKETBASE_URL/);
}

async function main() {
  const pocketbaseDistDir = getRequiredEnv('POCKETBASE_DIST_DIR');
  if (!fs.existsSync(path.join(pocketbaseDistDir, 'pocketbase'))) {
    throw new Error(`POCKETBASE_DIST_DIR must contain a Linux PocketBase binary: ${pocketbaseDistDir}`);
  }

  if (skipBuild) {
    console.log(`Skipping Docker build; testing existing image ${image}.`);
  } else {
    console.log(`Building Docker image ${image} with PocketBase from ${pocketbaseDistDir}...`);
    run('docker', [
      'buildx',
      'build',
      '--load',
      '--build-context',
      `pocketbase-dist=${pocketbaseDistDir}`,
      '-t',
      image,
      '.',
    ]);
  }

  try {
    run('docker', [
      'run',
      '-d',
      '--name',
      containerName,
      '-p',
      '127.0.0.1::8090',
      '-p',
      '127.0.0.1::8080',
      '-v',
      `${volumeName}:/pb_data`,
      '-e',
      `POCKETBASE_SUPERUSER_EMAIL=${superuserEmail}`,
      '-e',
      `POCKETBASE_SUPERUSER_PASSWORD=${superuserPassword}`,
      '-e',
      `POCKETBASE_ADMIN_EMAIL=${adminEmail}`,
      '-e',
      `POCKETBASE_ADMIN_PASSWORD=${adminPassword}`,
      '-e',
      'POCKETBASE_RECREATE_COLLECTIONS=1',
      '-e',
      'POCKETBASE_SMTP_ENABLED=0',
      '-e',
      'APP_PUBLIC_URL=http://127.0.0.1:8080',
      '-e',
      'POCKETBASE_PUBLIC_URL=',
      image,
    ]);

    const pocketbasePort = dockerPort(containerName, 8090);
    const frontendPort = dockerPort(containerName, 8080);
    const baseUrl = `http://127.0.0.1:${pocketbasePort}`;
    const frontendUrl = `http://127.0.0.1:${frontendPort}`;

    await waitFor('PocketBase health', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      assert.equal(response.status, 200);
    });

    const adminPb = await waitFor('PocketBase bootstrap', async () => {
      const pb = await authUser(baseUrl, adminEmail, adminPassword);
      await apiFetch(baseUrl, '/api/projects', { token: pb.authStore.token });
      await apiFetch(baseUrl, '/api/newsletters', { token: pb.authStore.token });
      return pb;
    }, 180000);

    await verifyFrontend(frontendUrl);
    await verifyOldSchemasAndCollectionApi(baseUrl);
    await verifyNewsletterApi(baseUrl, adminPb);
    await verifyProjectApi(baseUrl, adminPb);

    console.log(`Docker image and API integration tests passed for ${image}.`);
  } catch (error) {
    console.error(`\nContainer logs for ${containerName}:`);
    try {
      run('docker', ['logs', '--tail', '250', containerName]);
    } catch {
      // Ignore log collection failures so the original assertion is visible.
    }
    throw error;
  } finally {
    run('docker', ['rm', '-f', containerName], { quiet: true });
    run('docker', ['volume', 'rm', '-f', volumeName], { quiet: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
