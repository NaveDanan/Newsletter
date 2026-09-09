import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfDay,
  startOfWeek,
  subDays,
} from 'date-fns';
import type { GanttCurrency, GanttResource, GanttRole, GanttRoleBillingPeriod, GanttTask, ProjectGantt } from '@/types/gantt';

const DEFAULT_RESOURCE_COLORS = ['#D93A3A', '#2563EB', '#059669', '#7C3AED', '#EA580C', '#0891B2'];
const DEFAULT_ROLE_PERIOD: GanttRoleBillingPeriod = 'monthly';
const DEFAULT_ROLE_CURRENCY: GanttCurrency = 'ILS';
const WORKWEEK_STARTS_ON = 0;

function toDate(value: string, fallback: Date): Date {
  try {
    const parsed = parseISO(value);
    return Number.isNaN(parsed.getTime()) ? fallback : startOfDay(parsed);
  } catch {
    return fallback;
  }
}

export function formatGanttDate(date: Date): string {
  return format(startOfDay(date), 'yyyy-MM-dd');
}

export function isRestDay(date: Date): boolean {
  const day = startOfDay(date).getDay();
  return day === 5 || day === 6;
}

function toWorkday(date: Date): Date {
  let current = startOfDay(date);

  while (isRestDay(current)) {
    current = addDays(current, 1);
  }

  return current;
}

function addWorkdays(startDate: Date, workdays: number): Date {
  let current = toWorkday(startDate);
  let remaining = Math.max(0, Math.round(workdays));

  while (remaining > 0) {
    current = toWorkday(addDays(current, 1));
    remaining -= 1;
  }

  return current;
}

function countWorkdaysInclusive(startDate: Date, endDate: Date): number {
  const start = toWorkday(startDate);
  const end = startOfDay(endDate);

  if (isBefore(end, start)) {
    return 1;
  }

  let count = 0;
  let current = start;

  while (!isAfter(current, end)) {
    if (!isRestDay(current)) {
      count += 1;
    }
    current = addDays(current, 1);
  }

  return Math.max(1, count);
}

export function getWorkdayDuration(startDate: Date, endDate: Date): number {
  return countWorkdaysInclusive(startDate, endDate);
}

function getNextWorkday(date: Date): Date {
  return toWorkday(addDays(startOfDay(date), 1));
}

export function createEmptyProjectGantt(): ProjectGantt {
  return {
    tasks: [],
    resources: [],
    roles: [],
    zoom: 'day',
    lastEditedAt: null,
  };
}

export function createTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createResourceId(): string {
  return `resource-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createRoleId(): string {
  return `role-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getNextResourceColor(index: number): string {
  return DEFAULT_RESOURCE_COLORS[index % DEFAULT_RESOURCE_COLORS.length];
}

export function normalizeTask(task: Partial<GanttTask>, fallbackDate = startOfDay(new Date())): GanttTask {
  const start = toWorkday(toDate(task.startDate ?? '', fallbackDate));
  const milestone = Boolean(task.milestone);
  const rawDuration = typeof task.durationDays === 'number' && Number.isFinite(task.durationDays)
    ? Math.round(task.durationDays)
    : milestone
      ? 0
      : 1;
  const durationDays = milestone ? 0 : Math.max(1, rawDuration);
  const end = milestone ? start : addWorkdays(start, durationDays - 1);

  return {
    id: typeof task.id === 'string' && task.id ? task.id : createTaskId(),
    name: typeof task.name === 'string' ? task.name : '',
    startDate: formatGanttDate(start),
    endDate: formatGanttDate(end),
    durationDays,
    progress: typeof task.progress === 'number' && Number.isFinite(task.progress)
      ? Math.max(0, Math.min(100, Math.round(task.progress)))
      : 0,
    status: task.status ?? 'pending',
    indentLevel: typeof task.indentLevel === 'number' && Number.isFinite(task.indentLevel)
      ? Math.max(0, Math.round(task.indentLevel))
      : 0,
    predecessorIds: Array.isArray(task.predecessorIds)
      ? task.predecessorIds.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : [],
    resourceId: typeof task.resourceId === 'string' && task.resourceId ? task.resourceId : null,
    milestone,
  };
}

export function normalizeResource(resource: Partial<GanttResource>, index: number): GanttResource {
  return {
    id: typeof resource.id === 'string' && resource.id ? resource.id : createResourceId(),
    name: typeof resource.name === 'string' && resource.name.trim() ? resource.name.trim() : `Resource ${index + 1}`,
    role: typeof resource.role === 'string' ? resource.role : '',
    roleId: typeof resource.roleId === 'string' && resource.roleId ? resource.roleId : null,
    color: typeof resource.color === 'string' && resource.color ? resource.color : getNextResourceColor(index),
    capacityPercent: typeof resource.capacityPercent === 'number' && Number.isFinite(resource.capacityPercent)
      ? Math.max(0, Math.min(100, Math.round(resource.capacityPercent)))
      : 100,
  };
}

export function normalizeRole(role: Partial<GanttRole>, index: number): GanttRole {
  const paidBy = role.paidBy;
  const currency = role.currency;

  return {
    id: typeof role.id === 'string' && role.id ? role.id : createRoleId(),
    name: typeof role.name === 'string' && role.name.trim() ? role.name.trim() : `Role ${index + 1}`,
    budget: typeof role.budget === 'number' && Number.isFinite(role.budget)
      ? Math.max(0, Math.round(role.budget * 100) / 100)
      : 0,
    paidBy: paidBy === 'hourly' || paidBy === 'daily' || paidBy === 'weekly' || paidBy === 'monthly' || paidBy === 'yearly' || paidBy === 'one-time'
      ? paidBy
      : DEFAULT_ROLE_PERIOD,
    currency: currency === 'ILS' || currency === 'USD' || currency === 'EUR' || currency === 'GBP'
      ? currency
      : DEFAULT_ROLE_CURRENCY,
  };
}

export function normalizeProjectGantt(rawGantt: unknown): ProjectGantt {
  if (!rawGantt || typeof rawGantt !== 'object') {
    return createEmptyProjectGantt();
  }

  const candidate = rawGantt as Partial<ProjectGantt>;
  const today = startOfDay(new Date());
  const roles = Array.isArray(candidate.roles)
    ? candidate.roles.map((role, index) => normalizeRole(role, index))
    : [];
  const roleIds = new Set(roles.map((role) => role.id));
  const resources = Array.isArray(candidate.resources)
    ? candidate.resources.map((resource, index) => normalizeResource(resource, index))
      .map((resource) => ({
        ...resource,
        roleId: resource.roleId && roleIds.has(resource.roleId) ? resource.roleId : null,
      }))
    : [];
  const resourceIds = new Set(resources.map((resource) => resource.id));
  const tasks = Array.isArray(candidate.tasks)
    ? candidate.tasks.map((task) => normalizeTask(task, today)).map((task) => ({
      ...task,
      resourceId: task.resourceId && resourceIds.has(task.resourceId) ? task.resourceId : null,
    }))
    : [];

  return {
    tasks,
    resources,
    roles,
    zoom: candidate.zoom === 'week' || candidate.zoom === 'month' ? candidate.zoom : 'day',
    lastEditedAt: typeof candidate.lastEditedAt === 'string' ? candidate.lastEditedAt : null,
  };
}

export function createDefaultTask(seedDate = startOfDay(new Date())): GanttTask {
  return normalizeTask({
    name: 'New task',
    startDate: formatGanttDate(seedDate),
    durationDays: 3,
    progress: 0,
    status: 'pending',
    indentLevel: 0,
    predecessorIds: [],
    resourceId: null,
    milestone: false,
  }, seedDate);
}

export function createDefaultResource(index: number): GanttResource {
  return normalizeResource({
    name: `Resource ${index + 1}`,
    role: '',
    roleId: null,
    color: getNextResourceColor(index),
    capacityPercent: 100,
  }, index);
}

export function createDefaultRole(index: number): GanttRole {
  return normalizeRole({
    name: `Role ${index + 1}`,
    budget: 0,
    paidBy: DEFAULT_ROLE_PERIOD,
    currency: DEFAULT_ROLE_CURRENCY,
  }, index);
}

function getTaskStart(task: GanttTask): Date {
  return toDate(task.startDate, startOfDay(new Date()));
}

export function getTaskEnd(task: GanttTask): Date {
  if (task.milestone) {
    return getTaskStart(task);
  }

  return addWorkdays(getTaskStart(task), Math.max(1, task.durationDays) - 1);
}

export function alignTaskDates(task: GanttTask): GanttTask {
  const normalized = normalizeTask(task, getTaskStart(task));
  const end = getTaskEnd(normalized);

  return {
    ...normalized,
    endDate: formatGanttDate(end),
  };
}

export function updateTaskDeadline(task: GanttTask, deadline: string): GanttTask {
  const start = getTaskStart(task);
  const parsedDeadline = toDate(deadline, getTaskEnd(task));
  const durationDays = countWorkdaysInclusive(start, parsedDeadline);
  const nextTask = {
    ...task,
    milestone: task.milestone && sameDateValue(start, parsedDeadline),
    durationDays: task.milestone && sameDateValue(start, parsedDeadline) ? 0 : durationDays,
    endDate: formatGanttDate(parsedDeadline),
  };

  return alignTaskDates(nextTask);
}

function sameDateValue(left: Date, right: Date): boolean {
  return formatGanttDate(left) === formatGanttDate(right);
}

export function taskHasChildren(tasks: GanttTask[], taskId: string): boolean {
  const taskIndex = tasks.findIndex((task) => task.id === taskId);
  if (taskIndex < 0) {
    return false;
  }

  return (tasks[taskIndex + 1]?.indentLevel ?? -1) > tasks[taskIndex].indentLevel;
}

export function getDescendantTaskIds(tasks: GanttTask[], parentTaskId: string): string[] {
  const parentIndex = tasks.findIndex((task) => task.id === parentTaskId);
  if (parentIndex < 0) {
    return [];
  }

  const parentIndentLevel = tasks[parentIndex].indentLevel;
  const descendantTaskIds: string[] = [];

  for (let index = parentIndex + 1; index < tasks.length; index += 1) {
    const candidate = tasks[index];
    if (candidate.indentLevel <= parentIndentLevel) {
      break;
    }

    descendantTaskIds.push(candidate.id);
  }

  return descendantTaskIds;
}

export function getDefaultCollapsedTaskIds(tasks: GanttTask[]): Set<string> {
  return new Set(tasks.filter((task) => taskHasChildren(tasks, task.id)).map((task) => task.id));
}

function rollupParentTasks(tasks: GanttTask[]): GanttTask[] {
  const nextTasks = tasks.map((task) => ({ ...task }));
  const taskById = new Map(nextTasks.map((task) => [task.id, task]));

  for (let index = nextTasks.length - 1; index >= 0; index -= 1) {
    const task = nextTasks[index];
    const descendantIds = getDescendantTaskIds(nextTasks, task.id);
    if (descendantIds.length === 0) {
      continue;
    }

    const descendants = descendantIds
      .map((id) => taskById.get(id))
      .filter((candidate): candidate is GanttTask => Boolean(candidate));
    if (descendants.length === 0) {
      continue;
    }

    const latestEnd = descendants
      .map(getTaskEnd)
      .reduce((latest, current) => (isAfter(current, latest) ? current : latest));
    const start = getTaskStart(task);
    const durationDays = countWorkdaysInclusive(start, latestEnd);
    const status = descendants.some((descendant) => descendant.status === 'delayed')
      ? 'delayed'
      : descendants.every((descendant) => descendant.status === 'completed')
        ? 'completed'
        : descendants.some((descendant) => descendant.status === 'in-progress' || descendant.status === 'completed' || descendant.progress > 0)
          ? 'in-progress'
          : 'pending';
    const progress = status === 'completed'
      ? 100
      : status === 'pending' || status === 'delayed'
        ? 0
        : Math.round(descendants.reduce((total, descendant) => total + getTaskProgress(descendant), 0) / descendants.length);
    const rolledUpTask = alignTaskDates({
      ...task,
      milestone: false,
      durationDays,
      status,
      progress,
      endDate: formatGanttDate(latestEnd),
    });

    nextTasks[index] = rolledUpTask;
    taskById.set(task.id, rolledUpTask);
  }

  return nextTasks;
}

function getMinimumStartFromPredecessors(task: GanttTask, taskMap: Map<string, GanttTask>): Date | null {
  const predecessorEndDates = task.predecessorIds
    .map((predecessorId) => taskMap.get(predecessorId))
    .filter((candidate): candidate is GanttTask => Boolean(candidate))
    .map((predecessor) => getNextWorkday(getTaskEnd(predecessor)));

  if (predecessorEndDates.length === 0) {
    return null;
  }

  return predecessorEndDates.reduce((latest, current) => (isAfter(current, latest) ? current : latest));
}

function shiftTaskToStart(task: GanttTask, startDate: Date): GanttTask {
  const aligned = alignTaskDates(task);
  const nextStartDate = toWorkday(startDate);
  const endDate = aligned.milestone
    ? nextStartDate
    : addWorkdays(nextStartDate, Math.max(1, aligned.durationDays) - 1);

  return {
    ...aligned,
    startDate: formatGanttDate(nextStartDate),
    endDate: formatGanttDate(endDate),
  };
}

export function hasDependencyCycle(tasks: GanttTask[]): boolean {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (taskId: string): boolean => {
    if (visiting.has(taskId)) {
      return true;
    }

    if (visited.has(taskId)) {
      return false;
    }

    visiting.add(taskId);
    const task = taskMap.get(taskId);
    if (task) {
      for (const predecessorId of task.predecessorIds) {
        if (!taskMap.has(predecessorId)) {
          continue;
        }

        if (visit(predecessorId)) {
          return true;
        }
      }
    }

    visiting.delete(taskId);
    visited.add(taskId);
    return false;
  };

  return tasks.some((task) => visit(task.id));
}

function scheduleDependentTasks(tasks: GanttTask[], changedTaskId?: string): GanttTask[] {
  const nextTasks = tasks.map((task) => alignTaskDates(task));
  const taskMap = new Map(nextTasks.map((task) => [task.id, task]));
  const dependentsMap = new Map<string, string[]>();

  nextTasks.forEach((task) => {
    task.predecessorIds.forEach((predecessorId) => {
      dependentsMap.set(predecessorId, [...(dependentsMap.get(predecessorId) ?? []), task.id]);
    });
  });

  const queue = changedTaskId ? [changedTaskId] : nextTasks.map((task) => task.id);
  const queued = new Set(queue);

  while (queue.length > 0) {
    const taskId = queue.shift()!;
    queued.delete(taskId);

    const task = taskMap.get(taskId);
    if (!task) {
      continue;
    }

    const minimumStart = getMinimumStartFromPredecessors(task, taskMap);
    if (minimumStart && isBefore(getTaskStart(task), minimumStart)) {
      const shifted = shiftTaskToStart(task, minimumStart);
      taskMap.set(taskId, shifted);
    }

    for (const dependentId of dependentsMap.get(taskId) ?? []) {
      const dependent = taskMap.get(dependentId);
      if (!dependent) {
        continue;
      }

      const dependentMinimumStart = getMinimumStartFromPredecessors(dependent, taskMap);
      if (!dependentMinimumStart) {
        continue;
      }

      if (isBefore(getTaskStart(dependent), dependentMinimumStart)) {
        taskMap.set(dependentId, shiftTaskToStart(dependent, dependentMinimumStart));
      }

      if (!queued.has(dependentId)) {
        queue.push(dependentId);
        queued.add(dependentId);
      }
    }
  }

  return nextTasks.map((task) => taskMap.get(task.id) ?? task);
}

export function applyDependencyScheduling(tasks: GanttTask[], changedTaskId?: string): GanttTask[] {
  let scheduledTasks = scheduleDependentTasks(tasks, changedTaskId);

  for (let iteration = 0; iteration < Math.max(tasks.length, 1); iteration += 1) {
    const rolledUpTasks = rollupParentTasks(scheduledTasks);
    const nextTasks = rollupParentTasks(scheduleDependentTasks(rolledUpTasks));

    if (JSON.stringify(nextTasks) === JSON.stringify(scheduledTasks)) {
      return nextTasks;
    }

    scheduledTasks = nextTasks;
  }

  return scheduledTasks;
}

export function getStatusBadgeClass(status: GanttTask['status']): string {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-700';
    case 'in-progress':
      return 'bg-yellow-100 text-yellow-700';
    case 'pending':
      return 'bg-[#F3F4F6] text-[#737373]';
    case 'delayed':
      return 'bg-red-100 text-red-700';
  }
}

export function getStatusColor(status: GanttTask['status']): string {
  switch (status) {
    case 'completed':
      return '#16A34A';
    case 'in-progress':
      return '#EAB308';
    case 'pending':
      return '#A3A3A3';
    case 'delayed':
      return '#D93A3A';
  }
}

export function getStatusBarClass(status: GanttTask['status']): string {
  switch (status) {
    case 'completed':
      return 'bg-green-600';
    case 'in-progress':
      return 'bg-yellow-500';
    case 'pending':
      return 'bg-[#D4D4D4]';
    case 'delayed':
      return 'bg-[#D93A3A]';
  }
}

export function getTimelineRange(tasks: GanttTask[]) {
  if (tasks.length === 0) {
    const today = startOfDay(new Date());
    return {
      start: startOfWeek(today, { weekStartsOn: WORKWEEK_STARTS_ON }),
      end: endOfWeek(addDays(today, 13), { weekStartsOn: WORKWEEK_STARTS_ON }),
    };
  }

  const starts = tasks.map(getTaskStart);
  const ends = tasks.map(getTaskEnd);
  const earliest = starts.reduce((minDate, current) => (isBefore(current, minDate) ? current : minDate));
  const latest = ends.reduce((maxDate, current) => (isAfter(current, maxDate) ? current : maxDate));

  return {
    start: startOfWeek(subDays(earliest, 2), { weekStartsOn: WORKWEEK_STARTS_ON }),
    end: endOfWeek(addDays(latest, 4), { weekStartsOn: WORKWEEK_STARTS_ON }),
  };
}

export function getTimelineDays(tasks: GanttTask[]): Date[] {
  const range = getTimelineRange(tasks);
  return eachDayOfInterval(range);
}

export function getTaskOffsetDays(task: GanttTask, timelineStart: Date): number {
  return differenceInCalendarDays(getTaskStart(task), timelineStart);
}

export function getTaskSpanDays(task: GanttTask): number {
  return task.milestone ? 0 : Math.max(1, task.durationDays);
}

export function getTaskCalendarSpanDays(task: GanttTask): number {
  return differenceInCalendarDays(getTaskEnd(task), getTaskStart(task)) + 1;
}

export function getTaskProgress(task: GanttTask): number {
  switch (task.status) {
    case 'completed':
      return 100;
    case 'in-progress':
      return task.progress > 0 ? task.progress : 50;
    case 'pending':
    case 'delayed':
      return 0;
  }
}

export function getProjectProgress(tasks: GanttTask[]): number {
  const totalDuration = tasks.reduce((total, task) => total + getTaskSpanDays(task), 0);

  if (totalDuration === 0) {
    return 0;
  }

  const completedDuration = tasks.reduce((total, task) => (
    total + ((getTaskSpanDays(task) * getTaskProgress(task)) / 100)
  ), 0);

  return Math.round((completedDuration / totalDuration) * 100);
}

export const HOURS_PER_WORKDAY = 8;
const WORKDAYS_PER_WEEK = 5;
const WORKDAYS_PER_MONTH = 22;
const WORKDAYS_PER_YEAR = 260;

export interface GanttRoleCost {
  roleId: string;
  roleName: string;
  currency: GanttCurrency;
  cost: number;
  percent: number; // share of the total cost within the same currency (0-100)
}

export interface GanttCostEstimate {
  manpowerHours: number;
  remainingManpowerHours: number;
  costsByCurrency: Partial<Record<GanttCurrency, number>>;
  spentCostsByCurrency: Partial<Record<GanttCurrency, number>>;
  roleCosts: GanttRoleCost[];
}

function computeRoleCost(
  role: GanttRole,
  effectiveDays: number,
  effectiveHours: number,
  oneTimeFraction: number,
): number {
  switch (role.paidBy) {
    case 'hourly':
      return role.budget * effectiveHours;
    case 'daily':
      return role.budget * effectiveDays;
    case 'weekly':
      return role.budget * (effectiveDays / WORKDAYS_PER_WEEK);
    case 'monthly':
      return role.budget * (effectiveDays / WORKDAYS_PER_MONTH);
    case 'yearly':
      return role.budget * (effectiveDays / WORKDAYS_PER_YEAR);
    case 'one-time':
      return role.budget * oneTimeFraction;
  }
}

/**
 * Estimate the manpower hours and the monetary cost required for a given set of
 * tasks. Effort is scaled by each resource's capacity to the project, and cost
 * is derived from the resource role's rate and billing unit
 * (hourly/daily/weekly/monthly/yearly/one-time). Costs are grouped by currency
 * since different roles may bill in different currencies, and broken down per
 * role with each role's percentage share of the total cost. The spent cost
 * reflects the completed portion of the work based on task progress.
 */
export function estimateTasksCost(
  tasks: GanttTask[],
  resources: GanttResource[],
  roles: GanttRole[],
): GanttCostEstimate {
  const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
  const rolesById = new Map(roles.map((role) => [role.id, role]));

  const workdaysByResource = new Map<string, { total: number; remaining: number }>();
  tasks.forEach((task) => {
    if (!task.resourceId) {
      return;
    }

    const spanDays = getTaskSpanDays(task);
    if (spanDays === 0) {
      return;
    }

    const remainingDays = spanDays * (1 - (getTaskProgress(task) / 100));
    const entry = workdaysByResource.get(task.resourceId) ?? { total: 0, remaining: 0 };
    entry.total += spanDays;
    entry.remaining += remainingDays;
    workdaysByResource.set(task.resourceId, entry);
  });

  let manpowerHours = 0;
  let remainingManpowerHours = 0;
  const costsByCurrency: Partial<Record<GanttCurrency, number>> = {};
  const spentCostsByCurrency: Partial<Record<GanttCurrency, number>> = {};
  const costByRole = new Map<string, number>();

  workdaysByResource.forEach(({ total, remaining }, resourceId) => {
    const resource = resourcesById.get(resourceId);
    if (!resource) {
      return;
    }

    const completed = Math.max(0, total - remaining);
    const capacity = Math.max(0, Math.min(100, resource.capacityPercent)) / 100;
    const effectiveDays = total * capacity;
    const effectiveHours = effectiveDays * HOURS_PER_WORKDAY;
    const effectiveCompletedDays = completed * capacity;
    const effectiveCompletedHours = effectiveCompletedDays * HOURS_PER_WORKDAY;
    manpowerHours += effectiveHours;
    remainingManpowerHours += remaining * capacity * HOURS_PER_WORKDAY;

    const role = resource.roleId ? rolesById.get(resource.roleId) ?? null : null;
    if (!role || role.budget <= 0) {
      return;
    }

    const cost = computeRoleCost(role, effectiveDays, effectiveHours, 1);
    const spent = computeRoleCost(
      role,
      effectiveCompletedDays,
      effectiveCompletedHours,
      total > 0 ? completed / total : 0,
    );

    costsByCurrency[role.currency] = (costsByCurrency[role.currency] ?? 0) + cost;
    spentCostsByCurrency[role.currency] = (spentCostsByCurrency[role.currency] ?? 0) + spent;
    costByRole.set(role.id, (costByRole.get(role.id) ?? 0) + cost);
  });

  const roleCosts: GanttRoleCost[] = Array.from(costByRole.entries())
    .map(([roleId, cost]) => {
      const role = rolesById.get(roleId) ?? null;
      const currency = role?.currency ?? 'ILS';
      const currencyTotal = costsByCurrency[currency] ?? 0;

      return {
        roleId,
        roleName: role?.name ?? '',
        currency,
        cost,
        percent: currencyTotal > 0 ? Math.round((cost / currencyTotal) * 100) : 0,
      };
    })
    .sort((left, right) => right.cost - left.cost);

  return { manpowerHours, remainingManpowerHours, costsByCurrency, spentCostsByCurrency, roleCosts };
}

export function getResourceSummary(gantt: ProjectGantt) {
  const rolesById = new Map(gantt.roles.map((role) => [role.id, role]));
  const tasksByResource = new Map<string, GanttTask[]>();

  gantt.tasks.forEach((task) => {
    if (!task.resourceId) {
      return;
    }

    tasksByResource.set(task.resourceId, [...(tasksByResource.get(task.resourceId) ?? []), task]);
  });

  return gantt.resources.map((resource) => {
    const tasks = tasksByResource.get(resource.id) ?? [];
    const scheduledDays = tasks.reduce((total, task) => total + getTaskSpanDays(task), 0);
    const role = resource.roleId ? rolesById.get(resource.roleId) ?? null : null;

    return {
      resource,
      role,
      assignedTasks: tasks.length,
      scheduledDays,
      progressAverage: tasks.length === 0
        ? 0
        : Math.round(tasks.reduce((total, task) => total + getTaskProgress(task), 0) / tasks.length),
    };
  });
}

export function getWeekLabel(date: Date): string {
  return format(startOfWeek(date, { weekStartsOn: WORKWEEK_STARTS_ON }), "'Wk' w");
}
