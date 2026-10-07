import type { RecordModel, SendOptions } from 'pocketbase';
import { getPocketBase } from './client';
import { cachedRead, peekRead, readCache, readScope } from './read-cache';
import { normalizeProjectGantt } from '../gantt';
import type { Project, ProjectFormData, ProjectStatus } from '../../types/project';
import type { GanttTask, ProjectGantt } from '../../types/gantt';

export const PROJECTS_COLLECTION = 'projects';
const LIST_KEY = 'projects:list';

export function getCachedProjects(): Project[] | undefined {
  return peekRead<Project[]>(LIST_KEY, 300_000);
}

export function rememberProjects(projects: Project[]): void {
  if (getCachedProjects() !== projects) readCache.set(readScope() + LIST_KEY, projects);
}

function invalidateProjects(scope: string): void {
  readCache.invalidate(scope + 'projects:');
}

function discardDeniedReads(error: unknown, scope: string): void {
  if (error && typeof error === 'object' && 'status' in error && [401, 403, 404].includes(Number(error.status))) invalidateProjects(scope);
}

async function projectRequest<T>(path: string, options: SendOptions): Promise<T> {
  if (!options.method || options.method === 'GET') {
    const scope = readScope();
    return cachedRead('projects:' + path, () => getPocketBase().send<T>(path, options).catch((error: unknown) => {
      discardDeniedReads(error, scope); throw error;
    }));
  }
  const scope = readScope();
  invalidateProjects(scope);
  try { return await getPocketBase().send<T>(path, options); }
  finally { invalidateProjects(scope); }
}

interface ApiListResponse<T> {
  items?: T[];
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

export function mapPBRecordToProject(record: RecordModel): Project {
  const rawGantt = record['gantt'];
  const gantt = typeof rawGantt === 'object' && rawGantt !== null
    ? normalizeProjectGantt(rawGantt as Partial<ProjectGantt>)
    : normalizeProjectGantt({});

  return {
    id: record.id,
    title: typeof record['title'] === 'string' ? record['title'] : '',
    description: typeof record['description'] === 'string' ? record['description'] : '',
    department: typeof record['department'] === 'string' ? record['department'] : '',
    devision: typeof record['devision'] === 'string' ? record['devision'] : '',
    field: typeof record['field'] === 'string' ? record['field'] : '',
    status: (record['status'] as ProjectStatus) ?? 'pending',
    isVisibleInGantt: typeof record['isVisibleInGantt'] === 'boolean' ? record['isVisibleInGantt'] : true,
    gantt,
    createdBy: typeof record['createdBy'] === 'string' ? record['createdBy'] : '',
    allowedUserIds: Array.isArray(record['allowedUserIds']) ? record['allowedUserIds'] as string[] : [],
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function fetchProjects({ force = false } = {}): Promise<Project[]> {
  const scope = readScope();
  return cachedRead(LIST_KEY, async () => {
    try {
      const response = await getPocketBase().send<ApiListResponse<RecordModel>>('/api/projects', {
        method: 'GET', requestKey: null,
      });
      return (response.items ?? []).map(mapPBRecordToProject);
    } catch (error) { discardDeniedReads(error, scope); throw error; }
  }, { force });
}

export function prefetchProjects(): void {
  void fetchProjects().catch(() => { /* The destination handles a failed read. */ });
}

export async function createProject(
  data: ProjectFormData,
  gantt?: ProjectGantt,
): Promise<Project> {
  const pb = getPocketBase();
  const record = await projectRequest<RecordModel>('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
    title: data.title,
    description: data.description,
    department: data.department,
    devision: data.devision,
    field: data.field,
    status: 'pending',
    isVisibleInGantt: true,
    gantt: gantt ?? { tasks: [], resources: [], roles: [], zoom: 'week', lastEditedAt: null },
    createdBy: pb.authStore.record?.id ?? '',
    allowedUserIds: [],
    }),
    requestKey: null,
  });
  return mapPBRecordToProject(record);
}

export async function updateProject(
  id: string,
  data: Partial<ProjectFormData & { status: ProjectStatus; isVisibleInGantt: boolean; gantt: ProjectGantt }>,
): Promise<Project> {
  const record = await projectRequest<RecordModel>(`/api/projects/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
    requestKey: null,
  });
  return mapPBRecordToProject(record);
}

export async function deleteProject(id: string): Promise<void> {
  const scope = readScope();
  invalidateProjects(scope);
  try { await getPocketBase().collection(PROJECTS_COLLECTION).delete(id); }
  finally { invalidateProjects(scope); }
}

export async function updateProjectStatusOnly(id: string, status: ProjectStatus): Promise<Project> {
  const record = await projectRequest<RecordModel>(`/api/projects/${id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
    requestKey: null,
  });
  return mapPBRecordToProject(record);
}

export async function fetchProjectTasks(projectId: string): Promise<GanttTask[]> {
  const response = await projectRequest<ApiListResponse<GanttTask>>(`/api/projects/${projectId}/tasks`, {
    method: 'GET',
    requestKey: null,
  });
  return response.items ?? [];
}

export async function createProjectTask(projectId: string, task: Partial<GanttTask>): Promise<GanttTask> {
  return projectRequest<GanttTask>(`/api/projects/${projectId}/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(task),
    requestKey: null,
  });
}

export async function updateProjectTask(
  projectId: string,
  taskId: string,
  task: Partial<GanttTask>,
): Promise<GanttTask> {
  return projectRequest<GanttTask>(`/api/projects/${projectId}/tasks/${taskId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(task),
    requestKey: null,
  });
}

export async function updateProjectTaskStatus(
  projectId: string,
  taskId: string,
  status: ProjectStatus,
): Promise<GanttTask> {
  return projectRequest<GanttTask>(`/api/projects/${projectId}/tasks/${taskId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
    requestKey: null,
  });
}

export async function deleteProjectTask(
  projectId: string,
  taskId: string,
): Promise<{ status: string; deletedTaskIds: string[] }> {
  return projectRequest<{ status: string; deletedTaskIds: string[] }>(`/api/projects/${projectId}/tasks/${taskId}`, {
    method: 'DELETE',
    requestKey: null,
  });
}

export async function fetchProjectSubtasks(projectId: string, taskId: string): Promise<GanttTask[]> {
  const response = await projectRequest<ApiListResponse<GanttTask>>(`/api/projects/${projectId}/tasks/${taskId}/subtasks`, {
    method: 'GET',
    requestKey: null,
  });
  return response.items ?? [];
}

export async function createProjectSubtask(
  projectId: string,
  taskId: string,
  task: Partial<GanttTask>,
): Promise<GanttTask> {
  return projectRequest<GanttTask>(`/api/projects/${projectId}/tasks/${taskId}/subtasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(task),
    requestKey: null,
  });
}

export async function fetchProjectMilestones(projectId: string): Promise<GanttTask[]> {
  const response = await projectRequest<ApiListResponse<GanttTask>>(`/api/projects/${projectId}/milestones`, {
    method: 'GET',
    requestKey: null,
  });
  return response.items ?? [];
}

export async function createProjectMilestone(projectId: string, task: Partial<GanttTask>): Promise<GanttTask> {
  return projectRequest<GanttTask>(`/api/projects/${projectId}/milestones`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(task),
    requestKey: null,
  });
}
