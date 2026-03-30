export type GanttTaskStatus = 'completed' | 'in-progress' | 'pending' | 'delayed';

export type GanttZoom = 'day' | 'week';
export type GanttRoleBillingPeriod = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'one-time';
export type GanttCurrency = 'ILS' | 'USD' | 'EUR' | 'GBP';

export interface GanttTask {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  progress: number;
  status: GanttTaskStatus;
  indentLevel: number;
  predecessorIds: string[];
  resourceId: string | null;
  milestone: boolean;
}

export interface GanttResource {
  id: string;
  name: string;
  role: string;
  roleId: string | null;
  color: string;
  capacityPercent: number;
}

export interface GanttRole {
  id: string;
  name: string;
  budget: number;
  paidBy: GanttRoleBillingPeriod;
  currency: GanttCurrency;
}

export interface ProjectGantt {
  tasks: GanttTask[];
  resources: GanttResource[];
  roles: GanttRole[];
  zoom: GanttZoom;
  lastEditedAt: string | null;
}
