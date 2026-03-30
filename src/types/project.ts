export type ProjectStatus = 'completed' | 'in-progress' | 'pending' | 'delayed';

export interface Project {
  id: string;
  department: string;
  devision: string;
  field: string;
  title: string;
  description: string;
  status: ProjectStatus;
  isVisibleInGantt: boolean;
}

export interface ProjectFormData {
  department: string;
  devision: string;
  field: string;
  title: string;
  description: string;
}
