import type { GanttTaskStatus, ProjectGantt } from './gantt';

export type ProjectStatus = GanttTaskStatus;

export interface Project {
  id: string;
  department: string;
  devision: string;
  field: string;
  title: string;
  description: string;
  status: ProjectStatus;
  isVisibleInGantt: boolean;
  gantt: ProjectGantt;
}

export interface ProjectFormData {
  department: string;
  devision: string;
  field: string;
  title: string;
  description: string;
}
