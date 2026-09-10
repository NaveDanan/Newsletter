import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  deleteCommunityPost,
  getPocketBaseErrorMessage,
  toggleCommunityBookmark,
  toggleCommunityLike,
  toggleCommunityRepost,
} from '@/lib/pocketbase/community';
import type { CommunityEngagementResult, CommunityPost } from '@/types/community';

// Likes, reposts and bookmarks apply optimistically and revert on failure. The
// server owns the true counter, so the response value always overwrites the
// guessed one.

type PostPatcher = (postId: string, patch: Partial<CommunityPost>) => void;

interface UseCommunityEngagementOptions {
  patchPost: PostPatcher;
  removePost?: (postId: string) => void;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  translate: (key: string) => string;
}

export interface UseCommunityEngagementResult {
  toggleLike: (post: CommunityPost) => Promise<void>;
  toggleRepost: (post: CommunityPost) => Promise<void>;
  toggleBookmark: (post: CommunityPost) => Promise<void>;
  deletePost: (post: CommunityPost) => Promise<void>;
}

export function useCommunityEngagement({
  patchPost,
  removePost,
  isAuthenticated,
  onRequireAuth,
  translate,
}: UseCommunityEngagementOptions): UseCommunityEngagementResult {
  // One in-flight toggle per post and action. A double click would otherwise
  // race two opposite writes against the same UNIQUE row.
  const pendingRef = useRef<Set<string>>(new Set());

  const run = useCallback(async (
    post: CommunityPost,
    action: 'like' | 'repost' | 'bookmark',
    activeField: 'liked' | 'reposted' | 'bookmarked',
    countField: 'likeCount' | 'repostCount' | 'bookmarkCount',
    request: (postId: string) => Promise<CommunityEngagementResult>,
    failureKey: string,
  ) => {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }

    const key = `${action}:${post.id}`;
    if (pendingRef.current.has(key)) {
      return;
    }
    pendingRef.current.add(key);

    const wasActive = post[activeField];
    const previousCount = post[countField];
    const nextCount = Math.max(0, previousCount + (wasActive ? -1 : 1));

    patchPost(post.id, { [activeField]: !wasActive, [countField]: nextCount } as Partial<CommunityPost>);

    try {
      const result = await request(post.id);
      const serverCount = result[countField];
      patchPost(post.id, {
        [activeField]: result.active,
        [countField]: typeof serverCount === 'number' ? serverCount : nextCount,
      } as Partial<CommunityPost>);
    } catch (caught) {
      patchPost(post.id, { [activeField]: wasActive, [countField]: previousCount } as Partial<CommunityPost>);
      toast.error(getPocketBaseErrorMessage(caught, translate(failureKey)));
    } finally {
      pendingRef.current.delete(key);
    }
  }, [isAuthenticated, onRequireAuth, patchPost, translate]);

  const toggleLike = useCallback((post: CommunityPost) => (
    run(post, 'like', 'liked', 'likeCount', toggleCommunityLike, 'community.errors.like')
  ), [run]);

  const toggleRepost = useCallback((post: CommunityPost) => (
    run(post, 'repost', 'reposted', 'repostCount', toggleCommunityRepost, 'community.errors.repost')
  ), [run]);

  const toggleBookmark = useCallback((post: CommunityPost) => (
    run(post, 'bookmark', 'bookmarked', 'bookmarkCount', toggleCommunityBookmark, 'community.errors.bookmark')
  ), [run]);

  const deletePost = useCallback(async (post: CommunityPost) => {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }

    try {
      await deleteCommunityPost(post.id);
      // A post with replies is tombstoned server-side rather than erased, but
      // either way it leaves the caller's list.
      removePost?.(post.id);
      toast.success(translate('community.post.deleted'));
    } catch (caught) {
      toast.error(getPocketBaseErrorMessage(caught, translate('community.errors.delete')));
    }
  }, [isAuthenticated, onRequireAuth, removePost, translate]);

  return { toggleLike, toggleRepost, toggleBookmark, deletePost };
}
