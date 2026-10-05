import type { UserRole } from '@/lib/pocketbase/client';

/** A person an admin placed in the homepage "Our Writers" row. */
export interface SiteWriter {
  id: string;
  name: string;
  /** Community handle, or '' when the writer has never opened the community. */
  handle: string;
  avatarUrl: string;
}

/** A user row in the admin curation list, with its current membership state. */
export interface WriterCandidate {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl: string;
  featured: boolean;
}
