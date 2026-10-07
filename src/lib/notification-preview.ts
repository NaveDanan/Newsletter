import type { CommunityNotification } from '@/types/community';

export interface NotificationGroup {
  key: string;
  latest: CommunityNotification;
  notifications: CommunityNotification[];
  actors: CommunityNotification[];
  unreadIds: string[];
}

/** Article and community IDs are separate namespaces; publication stays separate from activity. */
function groupKey(notification: CommunityNotification): string {
  const article = notification.targetPath.match(/^\/article\/([^/?#]+)/)?.[1];
  if (notification.kind === 'newsletter') return 'newsletter:' + (article || notification.postId || notification.id);
  if (article) return 'article:' + article;
  const post = notification.targetPath.match(/^\/community\/post\/([^/?#]+)/)?.[1] || notification.rootId || notification.postId;
  return post ? 'post:' + post : 'notification:' + notification.id;
}

export function groupNotifications(notifications: CommunityNotification[], limit = 6): NotificationGroup[] {
  const groups = new Map<string, NotificationGroup>();
  const seen = new Set<string>();
  const sorted = [...notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  for (const notification of sorted) {
    if (seen.has(notification.id)) continue;
    seen.add(notification.id);
    const key = groupKey(notification);
    let group = groups.get(key);
    if (!group) {
      if (groups.size >= limit) continue;
      group = { key, latest: notification, notifications: [], actors: [], unreadIds: [] };
      groups.set(key, group);
    }
    group.notifications.push(notification);
    if (!notification.isRead) group.unreadIds.push(notification.id);
    if (notification.actorId && !group.actors.some(actor => actor.actorId === notification.actorId)) group.actors.push(notification);
  }
  return [...groups.values()];
}

export function notificationMessageKey(notification: CommunityNotification): string {
  if (notification.kind === 'mention' && notification.rootId && notification.rootId !== notification.postId) return 'community.notifications.mentionInComment';
  if (notification.kind === 'like') {
    if (notification.postId.includes(':')) return 'community.notifications.likeComment';
    if (notification.targetPath.startsWith('/article/')) return 'community.notifications.likeNewsletter';
    if (notification.rootId && notification.rootId !== notification.postId) return 'community.notifications.likeComment';
  }
  return 'community.notifications.' + notification.kind;
}

/** Only internal notification destinations may enter the SPA history. */
export function notificationTarget(notification: CommunityNotification): string {
  if (/^\/(article\/|community\/(post\/|profile\/))[^\\\s]+$/.test(notification.targetPath)) return notification.targetPath;
  if (notification.kind === 'follow' || !notification.postId) return notification.actorHandle ? '/community/profile/' + encodeURIComponent(notification.actorHandle) : '/community/notifications';
  return '/community/post/' + encodeURIComponent(notification.rootId || notification.postId);
}
