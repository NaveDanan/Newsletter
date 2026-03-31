import type { RecordModel } from 'pocketbase';
import { getPocketBase } from './client';
import { normalizeProjectGantt } from '../gantt';
import type { Project, ProjectFormData, ProjectStatus } from '../../types/project';
import type { ProjectGantt } from '../../types/gantt';

export const PROJECTS_COLLECTION = 'projects';

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
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function fetchProjects(): Promise<Project[]> {
  const pb = getPocketBase();
  const records = await pb.collection(PROJECTS_COLLECTION).getFullList({ sort: '-created' });
  return records.map(mapPBRecordToProject);
}

export async function createProject(
  data: ProjectFormData,
  gantt?: ProjectGantt,
): Promise<Project> {
  const pb = getPocketBase();
  const record = await pb.collection(PROJECTS_COLLECTION).create({
    title: data.title,
    description: data.description,
    department: data.department,
    devision: data.devision,
    field: data.field,
    status: 'pending',
    isVisibleInGantt: true,
    gantt: gantt ?? { tasks: [], resources: [], roles: [], zoom: 'week', lastEditedAt: null },
  });
  return mapPBRecordToProject(record);
}

export async function updateProject(
  id: string,
  data: Partial<ProjectFormData & { status: ProjectStatus; isVisibleInGantt: boolean; gantt: ProjectGantt }>,
): Promise<Project> {
  const pb = getPocketBase();
  const record = await pb.collection(PROJECTS_COLLECTION).update(id, data);
  return mapPBRecordToProject(record);
}

export async function deleteProject(id: string): Promise<void> {
  const pb = getPocketBase();
  await pb.collection(PROJECTS_COLLECTION).delete(id);
}
