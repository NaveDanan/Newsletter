import { getPocketBase } from './client';
import { resolveCommunityFileUrl } from './community';
import { ACTIVITY_KINDS, type ActivityItem, type ActivityKind } from '@/types/activity';

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isActivityKind(value: unknown): value is ActivityKind {
  return typeof value === 'string' && (ACTIVITY_KINDS as readonly string[]).includes(value);
}

/**
 * Recent signups, community posts and published newsletters, newest first.
 * Merged server-side by /api/site/activity so anonymous visitors see real
 * signups without the users collection ever being publicly listable.
 */
export async function fetchRecentActivity(limit: number): Promise<ActivityItem[]> {
  const response: unknown = await getPocketBase().send('/api/site/activity', {
    method: 'GET',
    query: { limit },
    requestKey: null,
  });
  const list = response && typeof response === 'object' ? (response as { items?: unknown }).items : null;
  if (!Array.isArray(list)) {
    return [];
  }

  return list.flatMap((raw): ActivityItem[] => {
    const item = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    if (!isActivityKind(item.kind) || !str(item.id)) {
      return [];
    }
    return [{
      id: str(item.id),
      kind: item.kind,
      actorName: str(item.actorName).trim(),
      actorHandle: str(item.actorHandle),
      avatarUrl: resolveCommunityFileUrl(str(item.avatarUrl)),
      subjectId: str(item.subjectId),
      subjectTitle: str(item.subjectTitle),
      createdAt: str(item.createdAt),
    }];
  });
}
