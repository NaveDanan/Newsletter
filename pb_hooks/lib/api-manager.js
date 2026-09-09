var PROJECT_STATUSES = ['pending', 'in-progress', 'completed', 'delayed'];
var NEWSLETTER_STATUSES = ['draft', 'published'];
var NEWSLETTER_MUTATION_ROLES = ['author', 'manager', 'general_manager', 'admin'];
var PROJECT_ADMIN_ROLES = ['admin', 'general_manager'];

function includes(list, value) {
  return list.indexOf(value) !== -1;
}

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value) {
  if (typeof value === 'string') {
    try {
      return asStringArray(JSON.parse(value));
    } catch (_) {
      return [];
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    try {
      return asStringArray(JSON.parse(String(value)));
    } catch (_) {
      return [];
    }
  }

  return Array.isArray(value)
    ? value.filter(function (item) { return typeof item === 'string' && item.length > 0; })
    : [];
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    try {
      return asArray(JSON.parse(value));
    } catch (_) {
      return [];
    }
  }

  if (value && typeof value === 'object') {
    try {
      var cloned = JSON.parse(JSON.stringify(value));
      if (Array.isArray(cloned)) {
        return cloned;
      }
    } catch (_) {
      // Fall through to array-like handling.
    }

    if (typeof value.length === 'number') {
      var result = [];
      for (var index = 0; index < value.length; index += 1) {
        result.push(value[index]);
      }
      return result;
    }

    try {
      return asArray(JSON.parse(String(value)));
    } catch (_) {
      return [];
    }
  }

  return [];
}

function asObject(value) {
  if (typeof value === 'string') {
    try {
      var parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    try {
      var cloned = JSON.parse(JSON.stringify(value));
      if (cloned && typeof cloned === 'object' && !Array.isArray(cloned) && Object.keys(cloned).length > 0) {
        return cloned;
      }
    } catch (_) {
      // Fall through to other PocketBase JSON raw parsing strategies.
    }

    try {
      var parsedObject = JSON.parse(String(value));
      return parsedObject && typeof parsedObject === 'object' && !Array.isArray(parsedObject) ? parsedObject : {};
    } catch (_) {
      return Object.keys(value).length > 0 ? value : {};
    }
  }

  return {};
}

function getRecordValue(record, field) {
  if (record && typeof record.get === 'function') {
    return record.get(field);
  }

  return record ? record[field] : undefined;
}

function setRecordValues(record, values) {
  Object.keys(values).forEach(function (field) {
    var value = values[field];
    if (value && typeof value === 'object') {
      value = JSON.stringify(value);
    }

    if (typeof record.set === 'function') {
      record.set(field, value);
    } else {
      record[field] = value;
    }
  });
}

function getRole(auth) {
  return auth && typeof auth.getString === 'function' ? auth.getString('role') : '';
}

function getAuthId(auth) {
  return auth && auth.id ? String(auth.id) : '';
}

function getQueryValue(e, key, fallback) {
  try {
    var query = e.requestInfo && e.requestInfo().query;
    if (query && query[key] !== undefined && query[key] !== null && query[key] !== '') {
      return String(query[key]);
    }
  } catch (_) {
    // Fall through to the raw URL query helper used by PocketBase JSVM.
  }

  try {
    var value = e.request.url.query().get(key);
    return value === null || value === undefined || value === '' ? fallback : String(value);
  } catch (_) {
    return fallback;
  }
}

function getPathValue(e, key) {
  if (e.request && typeof e.request.pathValue === 'function') {
    return e.request.pathValue(key);
  }

  return '';
}

function nowIso() {
  return new Date().toISOString();
}

function todayDate() {
  return nowIso().slice(0, 10);
}

function createId(prefix) {
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function assertStatus(status, allowed, label) {
  if (!includes(allowed, status)) {
    throw new BadRequestError('Unknown ' + label + ' status.');
  }
}

function normalizeDate(value) {
  var raw = asString(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    var parsed = new Date(raw + 'T00:00:00.000Z');
    if (!Number.isNaN(parsed.getTime())) {
      return formatDate(toWorkday(parsed));
    }
  }

  return formatDate(toWorkday(new Date()));
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function isRestDay(date) {
  var day = date.getUTCDay();
  return day === 5 || day === 6;
}

function toWorkday(date) {
  var next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  while (isRestDay(next)) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

function addWorkdays(dateString, days) {
  var date = new Date(dateString + 'T00:00:00.000Z');
  var remaining = Math.max(0, days);
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    date = toWorkday(date);
    remaining -= 1;
  }
  return formatDate(date);
}

function countWorkdaysInclusive(startDateString, endDateString) {
  var start = toWorkday(new Date(startDateString + 'T00:00:00.000Z'));
  var end = new Date(normalizeDate(endDateString) + 'T00:00:00.000Z');
  if (end.getTime() < start.getTime()) return 1;

  var count = 0;
  var current = new Date(start.getTime());
  while (current.getTime() <= end.getTime()) {
    if (!isRestDay(current)) count += 1;
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return Math.max(1, count);
}

function normalizeTask(task, options) {
  var source = asObject(task);
  var milestone = options && options.forceMilestone ? true : Boolean(source.milestone);
  var duration = Number(source.durationDays);
  if (!Number.isFinite(duration)) {
    duration = milestone ? 0 : 1;
  }
  duration = milestone ? 0 : Math.max(1, Math.round(duration));

  var startDate = normalizeDate(source.startDate);
  var status = asString(source.status) || 'pending';
  assertStatus(status, PROJECT_STATUSES, 'task');

  return {
    id: asString(source.id) || createId('task'),
    name: typeof source.name === 'string' ? source.name : '',
    startDate: startDate,
    endDate: milestone ? startDate : addWorkdays(startDate, duration - 1),
    durationDays: duration,
    progress: Number.isFinite(Number(source.progress))
      ? Math.max(0, Math.min(100, Math.round(Number(source.progress))))
      : 0,
    status: status,
    indentLevel: options && Number.isFinite(Number(options.indentLevel))
      ? Math.max(0, Math.round(Number(options.indentLevel)))
      : Number.isFinite(Number(source.indentLevel))
        ? Math.max(0, Math.round(Number(source.indentLevel)))
        : 0,
    predecessorIds: asStringArray(source.predecessorIds),
    resourceId: asString(source.resourceId) || null,
    milestone: milestone,
  };
}

function normalizeGantt(rawGantt) {
  var source = asObject(rawGantt);
  if ((!source.tasks || asArray(source.tasks).length === 0) && String(rawGantt || '').indexOf('"tasks"') !== -1) {
    try {
      source = JSON.parse(String(rawGantt));
    } catch (_) {
      // Keep the generic normalized source if the raw value is not valid JSON.
    }
  }

  return {
    tasks: asArray(source.tasks).map(function (task) { return normalizeTask(task); }),
    resources: asArray(source.resources),
    roles: asArray(source.roles),
    zoom: source.zoom === 'week' || source.zoom === 'month' ? source.zoom : 'day',
    lastEditedAt: typeof source.lastEditedAt === 'string' ? source.lastEditedAt : null,
  };
}

function validateTaskReferences(tasks) {
  var ids = {};
  tasks.forEach(function (task) {
    if (ids[task.id]) {
      throw new BadRequestError('Duplicate task id "' + task.id + '".');
    }
    ids[task.id] = true;
  });
  tasks.forEach(function (task) {
    task.predecessorIds.forEach(function (predecessorId) {
      if (predecessorId === task.id) {
        throw new BadRequestError('A task cannot depend on itself.');
      }
      if (!ids[predecessorId]) {
        throw new BadRequestError('Task predecessor references a missing task.');
      }
    });
  });

  var visiting = {};
  var visited = {};
  function visit(taskId) {
    if (visiting[taskId]) return true;
    if (visited[taskId]) return false;
    visiting[taskId] = true;
    var task = tasks.find(function (candidate) { return candidate.id === taskId; });
    if (task) {
      for (var index = 0; index < task.predecessorIds.length; index += 1) {
        if (visit(task.predecessorIds[index])) return true;
      }
    }
    visiting[taskId] = false;
    visited[taskId] = true;
    return false;
  }

  if (tasks.some(function (task) { return visit(task.id); })) {
    throw new BadRequestError('Task predecessor references create a circular dependency.');
  }
}

function cleanupTaskReferences(tasks) {
  var ids = {};
  tasks.forEach(function (task) { ids[task.id] = true; });
  return tasks.map(function (task) {
    return Object.assign({}, task, {
      predecessorIds: task.predecessorIds.filter(function (predecessorId) { return ids[predecessorId]; }),
    });
  });
}

function getTaskIndex(tasks, taskId) {
  for (var index = 0; index < tasks.length; index += 1) {
    if (tasks[index].id === taskId) {
      return index;
    }
  }

  return -1;
}

function getDescendantIds(tasks, taskId) {
  var startIndex = getTaskIndex(tasks, taskId);
  if (startIndex === -1) {
    throw new NotFoundError('Task not found.');
  }

  var parentIndent = tasks[startIndex].indentLevel;
  var ids = {};
  ids[taskId] = true;

  for (var index = startIndex + 1; index < tasks.length; index += 1) {
    if (tasks[index].indentLevel <= parentIndent) {
      break;
    }

    ids[tasks[index].id] = true;
  }

  return ids;
}

function getDescendantList(tasks, taskId) {
  var ids = getDescendantIds(tasks, taskId);
  delete ids[taskId];
  return tasks.filter(function (task) { return ids[task.id]; });
}

function getTaskEndDate(task) {
  return normalizeDate(task.endDate || addWorkdays(task.startDate, Math.max(0, task.durationDays - 1)));
}

function rollupParentTasks(tasks) {
  var nextTasks = tasks.map(function (task) { return Object.assign({}, task); });
  for (var index = nextTasks.length - 1; index >= 0; index -= 1) {
    var task = nextTasks[index];
    var descendants = getDescendantList(nextTasks, task.id);
    if (descendants.length === 0) continue;

    var latestEnd = descendants
      .map(getTaskEndDate)
      .sort()
      .pop();
    var status = descendants.some(function (descendant) { return descendant.status === 'delayed'; })
      ? 'delayed'
      : descendants.every(function (descendant) { return descendant.status === 'completed'; })
        ? 'completed'
        : descendants.some(function (descendant) {
          return descendant.status === 'in-progress' || descendant.status === 'completed' || Number(descendant.progress) > 0;
        })
          ? 'in-progress'
          : 'pending';
    var progress = status === 'completed'
      ? 100
      : status === 'pending' || status === 'delayed'
        ? 0
        : Math.round(descendants.reduce(function (total, descendant) {
          return total + (descendant.status === 'completed' ? 100 : descendant.status === 'in-progress' ? (Number(descendant.progress) || 50) : 0);
        }, 0) / descendants.length);

    nextTasks[index] = normalizeTask(Object.assign({}, task, {
      milestone: false,
      durationDays: countWorkdaysInclusive(task.startDate, latestEnd),
      endDate: latestEnd,
      status: status,
      progress: progress,
    }));
  }
  return nextTasks;
}

function getMinimumStartFromPredecessors(task, taskMap) {
  var starts = task.predecessorIds
    .map(function (predecessorId) { return taskMap[predecessorId]; })
    .filter(Boolean)
    .map(function (predecessor) {
      var end = new Date(getTaskEndDate(predecessor) + 'T00:00:00.000Z');
      end.setUTCDate(end.getUTCDate() + 1);
      return formatDate(toWorkday(end));
    });

  if (starts.length === 0) return null;
  return starts.sort().pop();
}

function scheduleDependentTasks(tasks, changedTaskId) {
  var nextTasks = tasks.map(function (task) { return normalizeTask(task); });
  var taskMap = {};
  var dependentsMap = {};

  nextTasks.forEach(function (task) {
    taskMap[task.id] = task;
    task.predecessorIds.forEach(function (predecessorId) {
      dependentsMap[predecessorId] = dependentsMap[predecessorId] || [];
      dependentsMap[predecessorId].push(task.id);
    });
  });

  var queue = changedTaskId ? [changedTaskId] : nextTasks.map(function (task) { return task.id; });
  var queued = {};
  queue.forEach(function (taskId) { queued[taskId] = true; });

  while (queue.length > 0) {
    var taskId = queue.shift();
    queued[taskId] = false;
    var task = taskMap[taskId];
    if (!task) continue;

    var minimumStart = getMinimumStartFromPredecessors(task, taskMap);
    if (minimumStart && task.startDate < minimumStart) {
      taskMap[taskId] = normalizeTask(Object.assign({}, task, { startDate: minimumStart }));
    }

    (dependentsMap[taskId] || []).forEach(function (dependentId) {
      var dependent = taskMap[dependentId];
      if (!dependent) return;
      var dependentMinimumStart = getMinimumStartFromPredecessors(dependent, taskMap);
      if (dependentMinimumStart && dependent.startDate < dependentMinimumStart) {
        taskMap[dependentId] = normalizeTask(Object.assign({}, dependent, { startDate: dependentMinimumStart }));
      }
      if (!queued[dependentId]) {
        queue.push(dependentId);
        queued[dependentId] = true;
      }
    });
  }

  return nextTasks.map(function (task) { return taskMap[task.id] || task; });
}

function applyGanttScheduling(tasks, changedTaskId) {
  var scheduledTasks = scheduleDependentTasks(tasks, changedTaskId);
  var maxIterations = Math.max(tasks.length, 1);

  for (var iteration = 0; iteration < maxIterations; iteration += 1) {
    var rolledUpTasks = rollupParentTasks(scheduledTasks);
    var nextTasks = rollupParentTasks(scheduleDependentTasks(rolledUpTasks));

    if (JSON.stringify(nextTasks) === JSON.stringify(scheduledTasks)) {
      return nextTasks;
    }

    scheduledTasks = nextTasks;
  }

  return scheduledTasks;
}

function listDirectSubtasks(tasks, taskId) {
  var startIndex = getTaskIndex(tasks, taskId);
  if (startIndex === -1) {
    throw new NotFoundError('Task not found.');
  }

  var parentIndent = tasks[startIndex].indentLevel;
  var childIndent = parentIndent + 1;
  var results = [];

  for (var index = startIndex + 1; index < tasks.length; index += 1) {
    if (tasks[index].indentLevel <= parentIndent) {
      break;
    }
    if (tasks[index].indentLevel === childIndent) {
      results.push(tasks[index]);
    }
  }

  return results;
}

function serializeRecord(record) {
  if (record && typeof record.publicExport === 'function') {
    return record.publicExport();
  }

  return record;
}

function getRecordOwnerId(record) {
  return asString(getRecordValue(record, 'createdById')) || asString(getRecordValue(record, 'createdBy'));
}

function canCreateNewsletter(auth) {
  return Boolean(auth && includes(NEWSLETTER_MUTATION_ROLES, getRole(auth)));
}

function canEditNewsletter(auth, record) {
  if (!auth || !record) return false;
  if (getRole(auth) === 'admin') return true;
  return includes(NEWSLETTER_MUTATION_ROLES, getRole(auth)) && getRecordOwnerId(record) === getAuthId(auth);
}

function canDeleteNewsletter(auth) {
  return getRole(auth) === 'admin';
}

function canReadNewsletter(auth, record) {
  if (getRecordValue(record, 'status') === 'published') return true;
  return canEditNewsletter(auth, record);
}

function canAccessProject(auth, record) {
  if (!auth || !record) return false;
  if (includes(PROJECT_ADMIN_ROLES, getRole(auth))) return true;
  var authId = getAuthId(auth);
  if (asString(getRecordValue(record, 'createdBy')) === authId) return true;
  return includes(asStringArray(getRecordValue(record, 'allowedUserIds')), authId);
}

function buildNewsletterPayload(body, auth, existing) {
  var source = asObject(body);
  var status = asString(source.status) || (existing ? getRecordValue(existing, 'status') : 'draft');
  assertStatus(status, NEWSLETTER_STATUSES, 'newsletter');

  var payload = {};
  [
    'title',
    'subtitle',
    'content',
    'excerpt',
    'author',
    'readTime',
    'coverImage',
    'textAlignment',
    'tags',
    'likes',
    'comments',
    'shares',
    'likedByUserIds',
    'bookmarkedByUserIds',
    'commentItems',
    'presentationFiles',
    'presentationPreviewManifest',
  ].forEach(function (field) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      payload[field] = source[field];
    }
  });

  payload.status = status;
  if (!existing) {
    payload.createdById = asString(source.createdById) || getAuthId(auth);
    payload.authorAvatar = Object.prototype.hasOwnProperty.call(source, 'authorAvatar') ? source.authorAvatar : '';
    payload.publishedAt = asString(source.publishedAt) || todayDate();
  }

  return payload;
}

function listRecords(app, collection, filter, sort, limit, offset) {
  return app.findRecordsByFilter(collection, filter || 'id != ""', sort, limit, offset);
}

function findRecord(app, collection, id) {
  return app.findRecordById(collection, id);
}

function saveRecord(app, record) {
  app.save(record);
  return record;
}

function createRecord(app, collectionName, values) {
  var collection = app.findCollectionByNameOrId(collectionName);
  var record = new Record(collection);
  setRecordValues(record, values);
  return saveRecord(app, record);
}

function handleNewsletterList(e) {
  var requestedStatus = getQueryValue(e, 'status', '');
  if (requestedStatus) {
    assertStatus(requestedStatus, NEWSLETTER_STATUSES, 'newsletter');
  }

  var page = Math.max(1, parseInt(getQueryValue(e, 'page', '1'), 10) || 1);
  var perPage = Math.max(1, Math.min(100, parseInt(getQueryValue(e, 'perPage', '50'), 10) || 50));
  var sort = getQueryValue(e, 'sort', '-created');
  var filters = [];

  if (requestedStatus) {
    filters.push('status = "' + requestedStatus + '"');
  }

  if (!e.auth) {
    filters.push('status = "published"');
  } else if (getRole(e.auth) !== 'admin') {
    filters.push('(status = "published" || createdById = "' + getAuthId(e.auth) + '")');
  }

  var all = listRecords(e.app, 'newsletters', filters.join(' && '), sort, 0, 0);
  var items = all.slice((page - 1) * perPage, page * perPage).map(serializeRecord);
  return e.json(200, {
    page: page,
    perPage: perPage,
    totalItems: all.length,
    totalPages: Math.ceil(all.length / perPage),
    items: items,
  });
}

function handleNewsletterCreate(e) {
  if (!canCreateNewsletter(e.auth)) {
    throw new ForbiddenError('A newsletter authoring role is required.');
  }

  var record = createRecord(e.app, 'newsletters', buildNewsletterPayload(e.requestInfo().body || {}, e.auth));
  return e.json(201, serializeRecord(record));
}

function handleNewsletterGet(e) {
  var record = findRecord(e.app, 'newsletters', getPathValue(e, 'id'));
  if (!canReadNewsletter(e.auth, record)) {
    throw new ForbiddenError('Newsletter access denied.');
  }

  return e.json(200, serializeRecord(record));
}

function handleNewsletterPatch(e) {
  var record = findRecord(e.app, 'newsletters', getPathValue(e, 'id'));
  if (!canEditNewsletter(e.auth, record)) {
    throw new ForbiddenError('Newsletter edit access denied.');
  }

  setRecordValues(record, buildNewsletterPayload(e.requestInfo().body || {}, e.auth, record));
  return e.json(200, serializeRecord(saveRecord(e.app, record)));
}

function handleNewsletterDelete(e) {
  var record = findRecord(e.app, 'newsletters', getPathValue(e, 'id'));
  if (!canDeleteNewsletter(e.auth)) {
    throw new ForbiddenError('Admin role is required to delete newsletters.');
  }

  e.app.delete(record);
  return e.json(200, { status: 'deleted', id: getPathValue(e, 'id') });
}

function handleNewsletterMakePublic(e) {
  var record = findRecord(e.app, 'newsletters', getPathValue(e, 'id'));
  if (!canEditNewsletter(e.auth, record)) {
    throw new ForbiddenError('Newsletter edit access denied.');
  }

  setRecordValues(record, { status: 'published' });
  return e.json(200, serializeRecord(saveRecord(e.app, record)));
}

function handleNewsletterMakeDraft(e) {
  var record = findRecord(e.app, 'newsletters', getPathValue(e, 'id'));
  if (!canEditNewsletter(e.auth, record)) {
    throw new ForbiddenError('Newsletter edit access denied.');
  }

  setRecordValues(record, { status: 'draft' });
  return e.json(200, serializeRecord(saveRecord(e.app, record)));
}

function registerNewsletterRoutes(routerAdd, appApis) {
  routerAdd('GET', '/api/newsletters', function (e) {
    return require(__hooks + '/lib/api-manager.js').handleNewsletterList(e);
  }, appApis.skipSuccessActivityLog());

  routerAdd('POST', '/api/newsletters', function (e) {
    return require(__hooks + '/lib/api-manager.js').handleNewsletterCreate(e);
  }, appApis.bodyLimit(0), appApis.requireAuth('users'), appApis.skipSuccessActivityLog());

  routerAdd('GET', '/api/newsletters/{id}', function (e) {
    return require(__hooks + '/lib/api-manager.js').handleNewsletterGet(e);
  }, appApis.skipSuccessActivityLog());

  routerAdd('PATCH', '/api/newsletters/{id}', function (e) {
    return require(__hooks + '/lib/api-manager.js').handleNewsletterPatch(e);
  }, appApis.bodyLimit(0), appApis.requireAuth('users'), appApis.skipSuccessActivityLog());

  routerAdd('DELETE', '/api/newsletters/{id}', function (e) {
    return require(__hooks + '/lib/api-manager.js').handleNewsletterDelete(e);
  }, appApis.requireAuth('users'), appApis.skipSuccessActivityLog());

  routerAdd('POST', '/api/newsletters/{id}/make-public', function (e) {
    return require(__hooks + '/lib/api-manager.js').handleNewsletterMakePublic(e);
  }, appApis.requireAuth('users'), appApis.skipSuccessActivityLog());

  routerAdd('POST', '/api/newsletters/{id}/make-draft', function (e) {
    return require(__hooks + '/lib/api-manager.js').handleNewsletterMakeDraft(e);
  }, appApis.requireAuth('users'), appApis.skipSuccessActivityLog());
}

function getProjectOrDeny(e, projectId) {
  var record = findRecord(e.app, 'projects', projectId);
  if (!canAccessProject(e.auth, record)) {
    throw new ForbiddenError('Project access denied.');
  }
  return record;
}

function saveProjectGantt(e, projectRecord, gantt) {
  gantt.tasks = cleanupTaskReferences(gantt.tasks);
  validateTaskReferences(gantt.tasks);
  gantt.tasks = applyGanttScheduling(gantt.tasks);
  validateTaskReferences(gantt.tasks);
  gantt.lastEditedAt = nowIso();
  setRecordValues(projectRecord, { gantt: gantt });
  saveRecord(e.app, projectRecord);
  return gantt;
}

function getProjectGantt(record) {
  return normalizeGantt(getRecordValue(record, 'gantt'));
}

function buildProjectPayload(body, auth, existing) {
  var source = asObject(body);
  var payload = {};
  ['title', 'description', 'department', 'devision', 'field', 'isVisibleInGantt', 'allowedUserIds'].forEach(function (field) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      payload[field] = source[field];
    }
  });

  if (Object.prototype.hasOwnProperty.call(source, 'status')) {
    var status = asString(source.status);
    assertStatus(status, PROJECT_STATUSES, 'project');
    payload.status = status;
  }

  if (Object.prototype.hasOwnProperty.call(source, 'gantt')) {
    payload.gantt = normalizeGantt(source.gantt);
    validateTaskReferences(payload.gantt.tasks);
    payload.gantt.tasks = applyGanttScheduling(cleanupTaskReferences(payload.gantt.tasks));
    validateTaskReferences(payload.gantt.tasks);
  }

  if (!existing) {
    payload.status = payload.status || 'pending';
    payload.isVisibleInGantt = Object.prototype.hasOwnProperty.call(payload, 'isVisibleInGantt') ? payload.isVisibleInGantt : true;
    payload.gantt = normalizeGantt(source.gantt || {});
    validateTaskReferences(payload.gantt.tasks);
    payload.gantt.tasks = applyGanttScheduling(cleanupTaskReferences(payload.gantt.tasks));
    payload.createdBy = getAuthId(auth);
    payload.allowedUserIds = asStringArray(source.allowedUserIds);
  }

  return payload;
}

function handleProjectList(e) {
  var records = listRecords(e.app, 'projects', '', '-created', 0, 0).filter(function (record) {
    return canAccessProject(e.auth, record);
  });
  return e.json(200, { items: records.map(serializeRecord) });
}

function handleProjectCreate(e) {
  var record = createRecord(e.app, 'projects', buildProjectPayload(e.requestInfo().body || {}, e.auth));
  return e.json(201, serializeRecord(record));
}

function handleProjectGet(e) {
  return e.json(200, serializeRecord(getProjectOrDeny(e, getPathValue(e, 'projectId'))));
}

function handleProjectPatch(e) {
  var record = getProjectOrDeny(e, getPathValue(e, 'projectId'));
  setRecordValues(record, buildProjectPayload(e.requestInfo().body || {}, e.auth, record));
  return e.json(200, serializeRecord(saveRecord(e.app, record)));
}

function handleProjectStatus(e) {
  var record = getProjectOrDeny(e, getPathValue(e, 'projectId'));
  var status = asString((e.requestInfo().body || {}).status);
  assertStatus(status, PROJECT_STATUSES, 'project');
  setRecordValues(record, { status: status });
  return e.json(200, serializeRecord(saveRecord(e.app, record)));
}

function handleProjectTasks(e) {
  var record = getProjectOrDeny(e, getPathValue(e, 'projectId'));
  return e.json(200, { items: getProjectGantt(record).tasks });
}

function handleProjectTaskCreate(e) {
  var record = getProjectOrDeny(e, getPathValue(e, 'projectId'));
  var gantt = getProjectGantt(record);
  var task = normalizeTask(e.requestInfo().body || {}, { indentLevel: 0 });
  gantt.tasks.push(task);
  saveProjectGantt(e, record, gantt);
  return e.json(201, task);
}

function handleProjectTaskPatch(e) {
  var record = getProjectOrDeny(e, getPathValue(e, 'projectId'));
  var gantt = getProjectGantt(record);
  var index = getTaskIndex(gantt.tasks, getPathValue(e, 'taskId'));
  if (index === -1) throw new NotFoundError('Task not found.');
  var task = normalizeTask(Object.assign({}, gantt.tasks[index], e.requestInfo().body || {}, { id: gantt.tasks[index].id }));
  gantt.tasks[index] = task;
  saveProjectGantt(e, record, gantt);
  return e.json(200, task);
}

function handleProjectTaskStatus(e) {
  var record = getProjectOrDeny(e, getPathValue(e, 'projectId'));
  var gantt = getProjectGantt(record);
  var index = getTaskIndex(gantt.tasks, getPathValue(e, 'taskId'));
  if (index === -1) throw new NotFoundError('Task not found.');
  var status = asString((e.requestInfo().body || {}).status);
  assertStatus(status, PROJECT_STATUSES, 'task');
  gantt.tasks[index].status = status;
  if (status === 'completed') gantt.tasks[index].progress = 100;
  saveProjectGantt(e, record, gantt);
  return e.json(200, gantt.tasks[index]);
}

function handleProjectTaskDelete(e) {
  var record = getProjectOrDeny(e, getPathValue(e, 'projectId'));
  var gantt = getProjectGantt(record);
  var deletedIds = getDescendantIds(gantt.tasks, getPathValue(e, 'taskId'));
  gantt.tasks = gantt.tasks
    .filter(function (task) { return !deletedIds[task.id]; })
    .map(function (task) {
      return Object.assign({}, task, {
        predecessorIds: task.predecessorIds.filter(function (predecessorId) { return !deletedIds[predecessorId]; }),
      });
    });
  saveProjectGantt(e, record, gantt);
  return e.json(200, { status: 'deleted', deletedTaskIds: Object.keys(deletedIds) });
}

function handleProjectSubtasks(e) {
  var record = getProjectOrDeny(e, getPathValue(e, 'projectId'));
  return e.json(200, { items: listDirectSubtasks(getProjectGantt(record).tasks, getPathValue(e, 'taskId')) });
}

function handleProjectSubtaskCreate(e) {
  var record = getProjectOrDeny(e, getPathValue(e, 'projectId'));
  var gantt = getProjectGantt(record);
  var requestedTaskId = getPathValue(e, 'taskId');
  var parentIndex = getTaskIndex(gantt.tasks, requestedTaskId);
  if (parentIndex === -1) {
    throw new NotFoundError('Task not found.');
  }
  var child = normalizeTask(e.requestInfo().body || {}, { indentLevel: gantt.tasks[parentIndex].indentLevel + 1 });
  var insertIndex = parentIndex + 1;
  while (insertIndex < gantt.tasks.length && gantt.tasks[insertIndex].indentLevel > gantt.tasks[parentIndex].indentLevel) {
    insertIndex += 1;
  }
  gantt.tasks.splice(insertIndex, 0, child);
  saveProjectGantt(e, record, gantt);
  return e.json(201, child);
}

function handleProjectMilestones(e) {
  var record = getProjectOrDeny(e, getPathValue(e, 'projectId'));
  return e.json(200, { items: getProjectGantt(record).tasks.filter(function (task) { return task.milestone; }) });
}

function handleProjectMilestoneCreate(e) {
  var record = getProjectOrDeny(e, getPathValue(e, 'projectId'));
  var gantt = getProjectGantt(record);
  var milestone = normalizeTask(e.requestInfo().body || {}, { indentLevel: 0, forceMilestone: true });
  gantt.tasks.push(milestone);
  saveProjectGantt(e, record, gantt);
  return e.json(201, milestone);
}

function registerProjectRoutes(routerAdd, appApis) {
  routerAdd('GET', '/api/projects', function (e) {
    return require(__hooks + '/lib/api-manager.js').handleProjectList(e);
  }, appApis.requireAuth('users'), appApis.skipSuccessActivityLog());

  routerAdd('POST', '/api/projects', function (e) {
    return require(__hooks + '/lib/api-manager.js').handleProjectCreate(e);
  }, appApis.bodyLimit(0), appApis.requireAuth('users'), appApis.skipSuccessActivityLog());

  routerAdd('GET', '/api/projects/{projectId}', function (e) {
    return require(__hooks + '/lib/api-manager.js').handleProjectGet(e);
  }, appApis.requireAuth('users'), appApis.skipSuccessActivityLog());

  routerAdd('PATCH', '/api/projects/{projectId}', function (e) {
    return require(__hooks + '/lib/api-manager.js').handleProjectPatch(e);
  }, appApis.bodyLimit(0), appApis.requireAuth('users'), appApis.skipSuccessActivityLog());

  routerAdd('PATCH', '/api/projects/{projectId}/status', function (e) {
    return require(__hooks + '/lib/api-manager.js').handleProjectStatus(e);
  }, appApis.bodyLimit(16384), appApis.requireAuth('users'), appApis.skipSuccessActivityLog());

  routerAdd('GET', '/api/projects/{projectId}/tasks', function (e) {
    return require(__hooks + '/lib/api-manager.js').handleProjectTasks(e);
  }, appApis.requireAuth('users'), appApis.skipSuccessActivityLog());

  routerAdd('POST', '/api/projects/{projectId}/tasks', function (e) {
    return require(__hooks + '/lib/api-manager.js').handleProjectTaskCreate(e);
  }, appApis.bodyLimit(16384), appApis.requireAuth('users'), appApis.skipSuccessActivityLog());

  routerAdd('PATCH', '/api/projects/{projectId}/tasks/{taskId}', function (e) {
    return require(__hooks + '/lib/api-manager.js').handleProjectTaskPatch(e);
  }, appApis.bodyLimit(16384), appApis.requireAuth('users'), appApis.skipSuccessActivityLog());

  routerAdd('PATCH', '/api/projects/{projectId}/tasks/{taskId}/status', function (e) {
    return require(__hooks + '/lib/api-manager.js').handleProjectTaskStatus(e);
  }, appApis.bodyLimit(16384), appApis.requireAuth('users'), appApis.skipSuccessActivityLog());

  routerAdd('DELETE', '/api/projects/{projectId}/tasks/{taskId}', function (e) {
    return require(__hooks + '/lib/api-manager.js').handleProjectTaskDelete(e);
  }, appApis.requireAuth('users'), appApis.skipSuccessActivityLog());

  routerAdd('GET', '/api/projects/{projectId}/tasks/{taskId}/subtasks', function (e) {
    return require(__hooks + '/lib/api-manager.js').handleProjectSubtasks(e);
  }, appApis.requireAuth('users'), appApis.skipSuccessActivityLog());

  routerAdd('POST', '/api/projects/{projectId}/tasks/{taskId}/subtasks', function (e) {
    return require(__hooks + '/lib/api-manager.js').handleProjectSubtaskCreate(e);
  }, appApis.bodyLimit(16384), appApis.requireAuth('users'), appApis.skipSuccessActivityLog());

  routerAdd('GET', '/api/projects/{projectId}/milestones', function (e) {
    return require(__hooks + '/lib/api-manager.js').handleProjectMilestones(e);
  }, appApis.requireAuth('users'), appApis.skipSuccessActivityLog());

  routerAdd('POST', '/api/projects/{projectId}/milestones', function (e) {
    return require(__hooks + '/lib/api-manager.js').handleProjectMilestoneCreate(e);
  }, appApis.bodyLimit(16384), appApis.requireAuth('users'), appApis.skipSuccessActivityLog());
}

function registerApiManager(routerAdd, appApis) {
  registerNewsletterRoutes(routerAdd, appApis);
  registerProjectRoutes(routerAdd, appApis);
}

module.exports = {
  PROJECT_STATUSES: PROJECT_STATUSES,
  NEWSLETTER_STATUSES: NEWSLETTER_STATUSES,
  normalizeTask: normalizeTask,
  normalizeGantt: normalizeGantt,
  getDescendantIds: getDescendantIds,
  listDirectSubtasks: listDirectSubtasks,
  cleanupTaskReferences: cleanupTaskReferences,
  canCreateNewsletter: canCreateNewsletter,
  canEditNewsletter: canEditNewsletter,
  canDeleteNewsletter: canDeleteNewsletter,
  canReadNewsletter: canReadNewsletter,
  canAccessProject: canAccessProject,
  buildNewsletterPayload: buildNewsletterPayload,
  buildProjectPayload: buildProjectPayload,
  handleNewsletterList: handleNewsletterList,
  handleNewsletterCreate: handleNewsletterCreate,
  handleNewsletterGet: handleNewsletterGet,
  handleNewsletterPatch: handleNewsletterPatch,
  handleNewsletterDelete: handleNewsletterDelete,
  handleNewsletterMakePublic: handleNewsletterMakePublic,
  handleNewsletterMakeDraft: handleNewsletterMakeDraft,
  handleProjectList: handleProjectList,
  handleProjectCreate: handleProjectCreate,
  handleProjectGet: handleProjectGet,
  handleProjectPatch: handleProjectPatch,
  handleProjectStatus: handleProjectStatus,
  handleProjectTasks: handleProjectTasks,
  handleProjectTaskCreate: handleProjectTaskCreate,
  handleProjectTaskPatch: handleProjectTaskPatch,
  handleProjectTaskStatus: handleProjectTaskStatus,
  handleProjectTaskDelete: handleProjectTaskDelete,
  handleProjectSubtasks: handleProjectSubtasks,
  handleProjectSubtaskCreate: handleProjectSubtaskCreate,
  handleProjectMilestones: handleProjectMilestones,
  handleProjectMilestoneCreate: handleProjectMilestoneCreate,
  registerApiManager: registerApiManager,
};
