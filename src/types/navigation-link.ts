export interface NavigationLink {
  id: string;
  dropdownId: string;
  name: string;
  description: string;
  url: string;
  iconUrl: string;
  hidden: boolean;
  order: number;
  created?: string;
  updated?: string;
}

export interface NavigationLinkFormData {
  dropdownId: string;
  name: string;
  description: string;
  url: string;
  iconUrl: string;
  hidden: boolean;
  order: number;
}

export interface NavigationDropdown {
  id: string;
  label: string;
  dotColor: string;
  hidden: boolean;
  order: number;
}

export interface NavigationDropdownFormData {
  label: string;
  dotColor: string;
}

export const DEFAULT_DROPDOWN_IDS = {
  aiWorkflows: 'ai-workflows',
  caseStudies: 'case-studies',
  resources: 'resources',
} as const;

export const SEED_DROPDOWNS: NavigationDropdown[] = [
  { id: DEFAULT_DROPDOWN_IDS.aiWorkflows, label: 'AI Workflows', dotColor: '#171717', hidden: false, order: 0 },
  { id: DEFAULT_DROPDOWN_IDS.caseStudies, label: 'Case Studies', dotColor: '#D93A3A', hidden: false, order: 1 },
  { id: DEFAULT_DROPDOWN_IDS.resources, label: 'Resources', dotColor: '#A3A3A3', hidden: false, order: 2 },
];