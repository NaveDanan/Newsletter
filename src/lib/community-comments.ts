import type { CommunityPost } from '@/types/community';

export type CommentSort = 'most-relevant' | 'newest' | 'all';

export interface CommentTreeNode {
  comment: CommunityPost;
  children: CommentTreeNode[];
}

// The thread route returns replies flat; nesting is rebuilt from parentId. The
// tree is capped at one level of indentation, so a reply to a reply is hoisted
// to sit beside its parent rather than indenting forever.
export function buildCommentTree(
  replies: CommunityPost[],
  rootPostId: string,
  sortMode: CommentSort = 'most-relevant',
): CommentTreeNode[] {
  const nodeMap = new Map<string, CommentTreeNode>();

  for (const reply of replies) {
    nodeMap.set(reply.id, { comment: reply, children: [] });
  }

  const byId = new Map(replies.map((reply) => [reply.id, reply]));

  // Walks up to the reply that hangs directly off the post being viewed.
  const topLevelIdOf = (reply: CommunityPost): string => {
    let current = reply;
    for (let hops = 0; hops < 64; hops += 1) {
      if (!current.parentId || current.parentId === rootPostId) {
        return current.id;
      }
      const parent = byId.get(current.parentId);
      if (!parent) {
        return current.id;
      }
      current = parent;
    }
    return current.id;
  };

  const roots: CommentTreeNode[] = [];

  for (const reply of replies) {
    const node = nodeMap.get(reply.id);
    if (!node) {
      continue;
    }
    const topLevelId = topLevelIdOf(reply);
    const parent = topLevelId === reply.id ? undefined : nodeMap.get(topLevelId);
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortChildren = (nodes: CommentTreeNode[]) => {
    nodes.sort((a, b) => Date.parse(a.comment.createdAt) - Date.parse(b.comment.createdAt));
  };
  roots.forEach((root) => sortChildren(root.children));

  if (sortMode === 'most-relevant') {
    roots.sort((a, b) => {
      const scoreA = a.comment.likeCount * 2 + a.children.length * 3;
      const scoreB = b.comment.likeCount * 2 + b.children.length * 3;
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      return Date.parse(b.comment.createdAt) - Date.parse(a.comment.createdAt);
    });
  } else if (sortMode === 'newest') {
    roots.sort((a, b) => Date.parse(b.comment.createdAt) - Date.parse(a.comment.createdAt));
  } else {
    roots.sort((a, b) => Date.parse(a.comment.createdAt) - Date.parse(b.comment.createdAt));
  }

  return roots;
}

// Comment timestamps are the terse "21h" style rather than the relative
// sentences Intl.RelativeTimeFormat produces, so they fit under a bubble.
export function formatCompactTime(value: string, isRTL: boolean): string {
  const elapsedMs = Math.max(0, Date.now() - Date.parse(value));
  const minutes = Math.floor(elapsedMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const years = Math.floor(days / 365);

  if (minutes < 1) {
    return isRTL ? 'עכשיו' : 'now';
  }
  if (minutes < 60) {
    return isRTL ? `${minutes} דק׳` : `${minutes}m`;
  }
  if (hours < 24) {
    return isRTL ? `${hours} שע׳` : `${hours}h`;
  }
  if (days < 7) {
    return isRTL ? `${days} ימ׳` : `${days}d`;
  }
  if (weeks < 52) {
    return isRTL ? `${weeks} שב׳` : `${weeks}w`;
  }
  return isRTL ? `${years} שנ׳` : `${years}y`;
}
