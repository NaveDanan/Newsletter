import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { getPocketBase } from '@/lib/pocketbase/client';
import {
  deleteCommunityPost,
  getPocketBaseErrorMessage,
  rsvpCommunityEvent,
  toggleCommunityBookmark,
  toggleCommunityLike,
  toggleCommunityRepost,
  updateCommunityPost,
  voteCommunityPoll,
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
  votePoll: (post: CommunityPost, optionId: string) => Promise<void>;
  rsvpEvent: (post: CommunityPost) => Promise<void>;
  deletePost: (post: CommunityPost) => Promise<void>;
  editPost: (
    post: CommunityPost,
    patch: { body: string; mediaIds?: string[]; sensitive?: boolean } | string,
  ) => Promise<boolean>;
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

  const votePoll = useCallback(async (post: CommunityPost, optionId: string) => {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    if (!post.poll || post.poll.closed) return;

    const currentUserId = getPocketBase().authStore.model?.id || '';
    if (!currentUserId) {
      onRequireAuth();
      return;
    }

    const previousPoll = post.poll;
    const existingVoted = previousPoll.options.find((opt) => opt.voterUserIds.includes(currentUserId));
    const isUnvoting = existingVoted?.id === optionId;

    const nextOptions = previousPoll.options.map((opt) => {
      const filteredVoters = opt.voterUserIds.filter((uid) => uid !== currentUserId);
      if (!isUnvoting && opt.id === optionId) {
        filteredVoters.push(currentUserId);
      }
      return {
        ...opt,
        voterUserIds: filteredVoters,
        votes: filteredVoters.length,
      };
    });

    const optimisticPoll = { ...previousPoll, options: nextOptions };
    patchPost(post.id, { poll: optimisticPoll });

    try {
      const response = await voteCommunityPoll(post.id, optionId);
      patchPost(post.id, { poll: response.poll });
    } catch (caught) {
      patchPost(post.id, { poll: previousPoll });
      toast.error(getPocketBaseErrorMessage(caught, translate('viewer.pollClosed')));
    }
  }, [isAuthenticated, onRequireAuth, patchPost, translate]);

  const rsvpEvent = useCallback(async (post: CommunityPost) => {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    if (!post.event) return;

    const authModel = getPocketBase().authStore.model as { id?: string; name?: string; avatar?: string } | null;
    const currentUserId = authModel?.id || '';
    if (!currentUserId) {
      onRequireAuth();
      return;
    }

    const previousEvent = post.event;
    const isAttending = previousEvent.attendees.some((a) => a.userId === currentUserId);
    const nextAttendees = isAttending
      ? previousEvent.attendees.filter((a) => a.userId !== currentUserId)
      : [
          ...previousEvent.attendees,
          {
            userId: currentUserId,
            name: authModel?.name || 'User',
            avatar: authModel?.avatar,
            rsvpAt: new Date().toISOString(),
          },
        ];

    const optimisticEvent = { ...previousEvent, attendees: nextAttendees };
    patchPost(post.id, { event: optimisticEvent });

    try {
      const response = await rsvpCommunityEvent(post.id);
      patchPost(post.id, { event: response.event });
      toast.success(response.attending ? translate('viewer.rsvpSuccess') : translate('viewer.rsvpCancelled'));
    } catch (caught) {
      patchPost(post.id, { event: previousEvent });
      toast.error(getPocketBaseErrorMessage(caught, 'Failed to update RSVP'));
    }
  }, [isAuthenticated, onRequireAuth, patchPost, translate]);

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

  const editPost = useCallback(async (
    post: CommunityPost,
    patch: { body: string; mediaIds?: string[]; sensitive?: boolean } | string,
  ): Promise<boolean> => {
    if (!isAuthenticated) {
      onRequireAuth();
      return false;
    }

    const payload = typeof patch === 'string' ? { body: patch } : patch;

    try {
      const updated = await updateCommunityPost(post.id, payload);
      patchPost(post.id, updated);
      toast.success(translate('community.post.editedSuccess'));
      return true;
    } catch (caught) {
      toast.error(getPocketBaseErrorMessage(caught, translate('community.post.editFailed')));
      return false;
    }
  }, [isAuthenticated, onRequireAuth, patchPost, translate]);

  return { toggleLike, toggleRepost, toggleBookmark, votePoll, rsvpEvent, deletePost, editPost };
}
