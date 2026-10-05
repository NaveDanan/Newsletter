const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class BadRequestError extends Error {}
class ForbiddenError extends Error {}
class NotFoundError extends Error {}

function loadApiManager() {
  const filename = path.join(__dirname, '..', 'pb_hooks', 'lib', 'api-manager.js');
  const code = fs.readFileSync(filename, 'utf8');
  const sandbox = {
    module: { exports: {} },
    exports: {},
    console,
    Date,
    Math,
    Object,
    Array,
    Number,
    String,
    Boolean,
    RegExp,
    BadRequestError,
    ForbiddenError,
    NotFoundError,
  };
  vm.runInNewContext(code, sandbox, { filename });
  return sandbox.module.exports;
}

function auth(id, role) {
  return {
    id,
    getString(field) {
      return field === 'role' ? role : '';
    },
  };
}

function record(values) {
  return {
    id: values.id || 'record-1',
    get(field) {
      return values[field];
    },
    getString(field) {
      return typeof values[field] === 'string' ? values[field] : '';
    },
  };
}

const api = loadApiManager();

assert.deepEqual(Array.from(api.PROJECT_STATUSES), ['pending', 'in-progress', 'completed', 'delayed']);
assert.deepEqual(Array.from(api.NEWSLETTER_STATUSES), ['draft', 'published']);

const milestone = api.normalizeTask({
  name: 'Launch',
  startDate: '2026-07-06',
  durationDays: 15,
  status: 'pending',
}, { forceMilestone: true });
assert.equal(milestone.milestone, true);
assert.equal(milestone.durationDays, 0);
assert.equal(milestone.endDate, '2026-07-06');

const subtask = api.normalizeTask({
  name: 'Child',
  startDate: '2026-07-10',
  durationDays: 2,
  status: 'in-progress',
}, { indentLevel: 2 });
assert.equal(subtask.indentLevel, 2);
assert.equal(subtask.status, 'in-progress');
assert.equal(subtask.startDate, '2026-07-12');
assert.equal(subtask.endDate, '2026-07-13');

assert.throws(() => api.normalizeTask({ status: 'unknown' }), BadRequestError);

const tasks = [
  { id: 'root', indentLevel: 0, predecessorIds: [] },
  { id: 'child-a', indentLevel: 1, predecessorIds: ['root'] },
  { id: 'grandchild', indentLevel: 2, predecessorIds: ['child-a'] },
  { id: 'child-b', indentLevel: 1, predecessorIds: ['missing', 'root'] },
  { id: 'next-root', indentLevel: 0, predecessorIds: ['root'] },
];
assert.deepEqual(Array.from(Object.keys(api.getDescendantIds(tasks, 'root'))), ['root', 'child-a', 'grandchild', 'child-b']);
assert.deepEqual(Array.from(api.listDirectSubtasks(tasks, 'root').map((task) => task.id)), ['child-a', 'child-b']);
assert.deepEqual(Array.from(api.cleanupTaskReferences(tasks).find((task) => task.id === 'child-b').predecessorIds), ['root']);

const ownDraft = record({ status: 'draft', createdById: 'user-1' });
const otherDraft = record({ status: 'draft', createdById: 'user-2' });
const published = record({ status: 'published', createdById: 'user-2' });
assert.equal(api.canCreateNewsletter(auth('user-1', 'author')), true);
assert.equal(api.canCreateNewsletter(auth('user-1', 'reader')), false);
assert.equal(api.canEditNewsletter(auth('user-1', 'manager'), ownDraft), true);
assert.equal(api.canEditNewsletter(auth('user-1', 'manager'), otherDraft), false);
assert.equal(api.canEditNewsletter(auth('admin-1', 'admin'), otherDraft), true);
assert.equal(api.canReadNewsletter(null, published), true);
assert.equal(api.canReadNewsletter(null, ownDraft), false);
assert.equal(api.canReadNewsletter(auth('user-1', 'author'), ownDraft), true);

const project = record({ createdBy: 'creator-1', allowedUserIds: ['user-2'] });
assert.equal(api.canAccessProject(auth('admin-1', 'admin'), project), true);
assert.equal(api.canAccessProject(auth('gm-1', 'general_manager'), project), true);
assert.equal(api.canAccessProject(auth('creator-1', 'manager'), project), true);
assert.equal(api.canAccessProject(auth('user-2', 'author'), project), true);
assert.equal(api.canAccessProject(auth('user-3', 'author'), project), false);

const projectPayload = api.buildProjectPayload({
  title: 'Example',
  status: 'delayed',
  gantt: { tasks: [{ id: 'a', status: 'pending' }, { id: 'b', status: 'completed', predecessorIds: ['a'] }] },
}, auth('creator-1', 'manager'));
assert.equal(projectPayload.status, 'delayed');
assert.equal(projectPayload.gantt.tasks.length, 2);

assert.throws(() => api.buildProjectPayload({
  status: 'pending',
  gantt: { tasks: [{ id: 'b', status: 'pending', predecessorIds: ['missing'] }] },
}, auth('creator-1', 'manager')), BadRequestError);
assert.throws(() => api.buildProjectPayload({
  status: 'pending',
  gantt: { tasks: [{ id: 'b', status: 'pending', predecessorIds: ['b'] }] },
}, auth('creator-1', 'manager')), BadRequestError);
assert.throws(() => api.buildProjectPayload({
  status: 'pending',
  gantt: { tasks: [{ id: 'b', status: 'pending' }, { id: 'b', status: 'pending' }] },
}, auth('creator-1', 'manager')), BadRequestError);

const engaged = record({
  status: 'published',
  createdById: 'owner-1',
  likes: 2,
  likedByUserIds: ['reader-1', 'reader-2'],
  bookmarkedByUserIds: ['reader-1'],
  commentItems: JSON.stringify([
    { id: 'c1', authorId: 'reader-1', likes: 1, likedByUserIds: ['reader-2'] },
  ]),
});
const engagementPatch = api.buildNewsletterPayload({
  likes: 9,
  likedByUserIds: ['owner-1', 'victim-1', 'victim-2'],
  bookmarkedByUserIds: ['victim-1'],
  commentItems: [
    { id: 'c1', authorId: 'victim-1', likes: 5, likedByUserIds: ['victim-1', 'owner-1'] },
    { id: 'c2', authorId: 'victim-2', likes: 3, likedByUserIds: ['victim-2'] },
  ],
}, auth('owner-1', 'author'), engaged);
assert.deepEqual(Array.from(engagementPatch.likedByUserIds), ['reader-1', 'reader-2', 'owner-1']);
assert.equal(engagementPatch.likes, 3);
assert.deepEqual(Array.from(engagementPatch.bookmarkedByUserIds), ['reader-1']);
const [storedComment, newComment] = engagementPatch.commentItems;
assert.equal(storedComment.authorId, 'reader-1');
assert.deepEqual(Array.from(storedComment.likedByUserIds), ['reader-2', 'owner-1']);
assert.equal(storedComment.likes, 2);
assert.equal(newComment.authorId, 'owner-1');
assert.deepEqual(Array.from(newComment.likedByUserIds), []);
assert.equal(newComment.likes, 0);

const unlikePatch = api.buildNewsletterPayload({ likes: 0, likedByUserIds: [] }, auth('reader-1', 'admin'), engaged);
assert.deepEqual(Array.from(unlikePatch.likedByUserIds), ['reader-2']);
assert.equal(unlikePatch.likes, 1);

// Mirrors a PocketBase record update request: the body carries JSON fields as
// raw bytes, while the loaded record exposes the sent values by field type.
function recordUpdateEvent(body, caller, { superuser = false } = {}) {
  const written = {};
  const rawBody = {};
  let nextCalls = 0;
  Object.keys(body).forEach((field) => {
    const value = body[field];
    rawBody[field] = value && typeof value === 'object' ? Array.from(Buffer.from(JSON.stringify(value))) : value;
  });
  return {
    written,
    get nextCalls() { return nextCalls; },
    auth: caller,
    hasSuperuserAuth: () => superuser,
    requestInfo: () => ({ body: rawBody }),
    record: {
      original: () => engaged,
      get: (field) => body[field],
      getString: (field) => (body[field] && typeof body[field] === 'object' ? JSON.stringify(body[field]) : String(body[field] ?? '')),
      set(field, value) { written[field] = value; },
    },
    next() { nextCalls += 1; return 'next-result'; },
  };
}

const forgedBody = {
  title: 'Retitled',
  likes: 9,
  likedByUserIds: ['victim-1', 'owner-1'],
  bookmarkedByUserIds: ['victim-1'],
  commentItems: [
    { id: 'c1', authorId: 'victim-1', likes: 5, likedByUserIds: ['victim-1'] },
    { id: 'c2', authorId: 'victim-2', authorName: 'Victim', likedByUserIds: [] },
  ],
};
const ownerRequest = recordUpdateEvent(forgedBody, auth('owner-1', 'author'));
assert.equal(api.handleNewsletterRecordUpdateRequest(ownerRequest), 'next-result');
assert.equal(ownerRequest.nextCalls, 1);
assert.equal('title' in ownerRequest.written, false, 'non-engagement fields keep the loaded request value');
assert.deepEqual(JSON.parse(ownerRequest.written.likedByUserIds), ['reader-1', 'reader-2', 'owner-1']);
assert.equal(ownerRequest.written.likes, 3);
assert.deepEqual(JSON.parse(ownerRequest.written.bookmarkedByUserIds), ['reader-1']);
const [recordStoredComment, recordNewComment] = JSON.parse(ownerRequest.written.commentItems);
assert.equal(recordStoredComment.authorId, 'reader-1');
assert.deepEqual(recordStoredComment.likedByUserIds, ['reader-2']);
assert.equal(recordStoredComment.likes, 1);
assert.equal(recordNewComment.authorId, 'owner-1');

// User-controlled comment IDs must not resolve inherited properties or mutate
// the lookup's prototype across writes. Both newsletter write paths use this.
for (const id of ['constructor', 'toString', '__proto__']) {
  const body = { commentItems: [{ id, authorId: 'victim', constructor: { authorId: 'victim' }, body: 'Forged' }] };
  const custom = api.buildNewsletterPayload(body, auth('owner-1', 'author'), engaged);
  assert.equal(custom.commentItems[0].authorId, 'owner-1', `new ${id} comment uses caller identity`);
  const raw = recordUpdateEvent(body, auth('owner-1', 'author'));
  api.handleNewsletterRecordUpdateRequest(raw);
  assert.equal(JSON.parse(raw.written.commentItems)[0].authorId, 'owner-1', `record API ${id} comment uses caller identity`);
}
const prototypeSeed = record({
  status: 'published',
  commentItems: JSON.stringify([{ id: '__proto__', authorId: 'owner-1', constructor: { authorId: 'victim' } }]),
});
const followup = api.buildNewsletterPayload({
  commentItems: [{ id: '__proto__', authorId: 'owner-1', constructor: { authorId: 'victim' } }, { id: 'constructor', authorId: 'victim' }],
}, auth('owner-1', 'author'), prototypeSeed);
assert.equal(followup.commentItems[1].authorId, 'owner-1', 'a prior __proto__ comment cannot seed forged author identity');

const titleOnlyRequest = recordUpdateEvent({ title: 'Only the title' }, auth('owner-1', 'author'));
api.handleNewsletterRecordUpdateRequest(titleOnlyRequest);
assert.deepEqual(titleOnlyRequest.written, {}, 'requests without engagement fields are untouched');
assert.equal(titleOnlyRequest.nextCalls, 1);

const superuserRequest = recordUpdateEvent(forgedBody, null, { superuser: true });
api.handleNewsletterRecordUpdateRequest(superuserRequest);
assert.deepEqual(superuserRequest.written, {}, 'superusers keep full write access');
assert.equal(superuserRequest.nextCalls, 1);

console.log('api-manager helper tests passed');
