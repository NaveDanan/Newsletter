import { useCallback, useEffect, useRef, useState } from 'react';
import { getPocketBaseErrorMessage } from '@/lib/pocketbase/community';
import type { CommunityPage, CommunityPost } from '@/types/community';
import { peekRead, readCache, readScope } from '@/lib/pocketbase/read-cache';

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
  options: { enabled?: boolean; errorMessage?: string; cacheKey?: string } = {},
): UseCommunityPostsResult {
  const { enabled = true, errorMessage = 'Loading posts failed' } = options;
  const cacheKey = options.cacheKey ? `community:list:${options.cacheKey}` : '';
  const scope = readScope();
  const cached = cacheKey && enabled ? peekRead<CommunityPage<CommunityPost>>(cacheKey, 300_000) : undefined;
  const [posts, setPosts] = useState<CommunityPost[]>(() => cached?.items ?? []);
  const [isLoading, setIsLoading] = useState(enabled && !cached);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(cached?.cursor ?? '');
  const [hasMore, setHasMore] = useState(cached?.hasMore ?? false);
  const [identity, setIdentity] = useState(scope + cacheKey);
  if (identity !== scope + cacheKey) {
    setIdentity(scope + cacheKey); setPosts(cached?.items ?? []);
    setCursor(cached?.cursor ?? ''); setHasMore(cached?.hasMore ?? false);
    setError(null); setIsLoading(enabled && !cached);
  }
  const requestRef = useRef(0);
  const pendingChangesRef = useRef<((items: CommunityPost[]) => CommunityPost[])[] | undefined>(undefined);
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const load = useCallback(async (nextCursor: string) => {
    const requestedScope = readScope();
    const requestId = requestRef.current + 1;
    const changes: ((items: CommunityPost[]) => CommunityPost[])[] = [];
    pendingChangesRef.current = changes;
    requestRef.current = requestId;

    if (nextCursor) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }

    try {
      const page = await sourceRef.current(nextCursor);
      // A newer request has already started, so this page is stale.
      if (requestRef.current !== requestId || requestedScope !== readScope()) {
        return;
      }
      setPosts((current) => {
        const items = changes.reduce((items, change) => change(items), page.items);
        if (!nextCursor) {
          return items;
        }
        const seen = new Set(current.map((post) => post.id));
        return current.concat(items.filter((post) => !seen.has(post.id)));
      });
      setCursor(page.cursor);
      setHasMore(page.hasMore);
      setError(null);
    } catch (caught) {
      if (requestRef.current === requestId && requestedScope === readScope()) {
        setError(getPocketBaseErrorMessage(caught, errorMessage));
      }
    } finally {
      if (requestRef.current === requestId && requestedScope === readScope()) {
        pendingChangesRef.current = undefined;
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

    void load('');
    return () => { requestRef.current += 1; };
  }, [enabled, load, source, scope, cacheKey]);

  useEffect(() => {
    if (cacheKey && enabled && !isLoading && !error && scope === readScope()) readCache.set(scope + cacheKey, { items: posts, cursor, hasMore });
  }, [cacheKey, cursor, enabled, error, hasMore, isLoading, posts, scope]);

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
    if (scope !== readScope()) return;
    const change = (current: CommunityPost[]) => [post, ...current.filter((item) => item.id !== post.id)];
    pendingChangesRef.current?.push(change);
    setPosts(change);
  }, [scope]);

  const replacePost = useCallback((post: CommunityPost) => {
    if (scope !== readScope()) return;
    const change = (current: CommunityPost[]) => current.map((item) => (item.id === post.id ? post : item));
    pendingChangesRef.current?.push(change);
    setPosts(change);
  }, [scope]);

  const removePost = useCallback((postId: string) => {
    if (scope !== readScope()) return;
    const change = (current: CommunityPost[]) => current.filter((item) => item.id !== postId);
    pendingChangesRef.current?.push(change);
    setPosts(change);
  }, [scope]);

  const patchPost = useCallback((postId: string, patch: Partial<CommunityPost>) => {
    if (scope !== readScope()) return;
    const change = (current: CommunityPost[]) => current.map((item) => applyPatch(item, postId, patch));
    pendingChangesRef.current?.push(change);
    setPosts(change);
  }, [scope]);

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
