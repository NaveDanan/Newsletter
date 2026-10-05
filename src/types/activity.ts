export const ACTIVITY_KINDS = ['joined', 'posted', 'published'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** One entry in the homepage "Recent Activity" list. */
export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  actorName: string;
  actorHandle: string;
  avatarUrl: string;
  /** Post id for 'posted', newsletter id for 'published', '' for 'joined'. */
  subjectId: string;
  subjectTitle: string;
  createdAt: string;
}
