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

console.log('api-manager helper tests passed');
