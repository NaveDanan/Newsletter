import { useCallback, useEffect, useRef, useState } from 'react';
import { getPocketBaseErrorMessage } from '@/lib/pocketbase/community';
import type { CommunityPage, CommunityPost } from '@/types/community';

// One paging engine behind every list of posts: the feed, a profile tab,
// bookmarks, a hashtag page and search results all page the same way, so they
// share the cursor bookkeeping and the optimistic update helpers.

export type CommunityPostSource = (cursor: string) => Promise<CommunityPage<CommunityPost>>;

export interface UseCommunityPostsResult {
  posts: CommunityPost[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => Promise<void>;
  prependPost: (post: CommunityPost) => void;
  replacePost: (post: CommunityPost) => void;
  removePost: (postId: string) => void;
  patchPost: (postId: string, patch: Partial<CommunityPost>) => void;
}

// A quoted post is a copy of another post, so an engagement change has to reach
// both the top-level card and any card quoting it.
function applyPatch(post: CommunityPost, postId: string, patch: Partial<CommunityPost>): CommunityPost {
  const quoted = post.quotedPost ? applyPatch(post.quotedPost, postId, patch) : null;
  const quotedChanged = quoted !== post.quotedPost;

  if (post.id !== postId) {
    return quotedChanged ? { ...post, quotedPost: quoted } : post;
  }

  return { ...post, ...patch, quotedPost: quoted };
}

export function useCommunityPosts(
  source: CommunityPostSource,
  options: { enabled?: boolean; errorMessage?: string } = {},
): UseCommunityPostsResult {
  const { enabled = true, errorMessage = 'Loading posts failed' } = options;
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const requestRef = useRef(0);
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const load = useCallback(async (nextCursor: string) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    if (nextCursor) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }

    try {
      const page = await sourceRef.current(nextCursor);
      // A newer request has already started, so this page is stale.
      if (requestRef.current !== requestId) {
        return;
      }
      setPosts((current) => {
        if (!nextCursor) {
          return page.items;
        }
        const seen = new Set(current.map((post) => post.id));
        return current.concat(page.items.filter((post) => !seen.has(post.id)));
      });
      setCursor(page.cursor);
      setHasMore(page.hasMore);
      setError(null);
    } catch (caught) {
      if (requestRef.current === requestId) {
        setError(getPocketBaseErrorMessage(caught, errorMessage));
      }
    } finally {
      if (requestRef.current === requestId) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, [errorMessage]);

  useEffect(() => {
    if (!enabled) {
      requestRef.current += 1;
      setPosts([]);
      setCursor('');
      setHasMore(false);
      setIsLoading(false);
      setError(null);
      return;
    }

    setPosts([]);
    setCursor('');
    setHasMore(false);
    void load('');
  }, [enabled, load]);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoading || isLoadingMore || !cursor) {
      return;
    }
    void load(cursor);
  }, [cursor, hasMore, isLoading, isLoadingMore, load]);

  const refresh = useCallback(async () => {
    await load('');
  }, [load]);

  const prependPost = useCallback((post: CommunityPost) => {
    setPosts((current) => [post, ...current.filter((item) => item.id !== post.id)]);
  }, []);

  const replacePost = useCallback((post: CommunityPost) => {
    setPosts((current) => current.map((item) => (item.id === post.id ? post : item)));
  }, []);

  const removePost = useCallback((postId: string) => {
    setPosts((current) => current.filter((item) => item.id !== postId));
  }, []);

  const patchPost = useCallback((postId: string, patch: Partial<CommunityPost>) => {
    setPosts((current) => current.map((item) => applyPatch(item, postId, patch)));
  }, []);

  return {
    posts,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
    prependPost,
    replacePost,
    removePost,
    patchPost,
  };
}
