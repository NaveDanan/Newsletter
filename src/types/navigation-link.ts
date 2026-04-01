export interface NavigationLink {
  id: string;
  name: string;
  description: string;
  url: string;
  iconUrl: string;
  created?: string;
  updated?: string;
}

export interface NavigationLinkFormData {
  name: string;
  description: string;
  url: string;
  iconUrl: string;
}