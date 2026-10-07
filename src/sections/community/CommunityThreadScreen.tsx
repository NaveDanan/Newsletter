import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert01Icon, ArrowDown01Icon, ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocale } from '@/contexts/LocaleContext';
import { useCommunityEngagement } from '@/hooks/useCommunityEngagement';
import { fetchCommunityThread, getPocketBaseErrorMessage, peekCommunityPost, peekCommunityThread } from '@/lib/pocketbase/community';
import { buildCommentTree, type CommentSort } from '@/lib/community-comments';
import { CommunityCommentItem } from './CommunityCommentItem';
import { lazyComponent } from '@/lib/lazy-component';
import { DeferredContent } from '@/components/DeferredContent';
import { readScope } from '@/lib/pocketbase/read-cache';
import { useCommunity } from './CommunityContext';
import { CommunityPostCard } from './CommunityPostCard';
import type { CommunityPost, CommunityThread } from '@/types/community';

// A thread is one request: the post, its ancestors up to the root, and the
// first page of replies. Replies come back flat and are assembled into a
// nested tree here so the conversation renders as indented comment threads.

interface CommunityThreadScreenProps {
  postId: string;
}

const CommunityComposer = lazyComponent(() => import('./CommunityComposer').then((module) => ({ default: module.CommunityComposer })));

function patchIn(posts: CommunityPost[], postId: string, patch: Partial<CommunityPost>): CommunityPost[] {
  return posts.map((post) => {
    const quoted = post.quotedPost && post.quotedPost.id === postId
      ? { ...post.quotedPost, ...patch }
      : post.quotedPost;
    if (post.id !== postId) {
      return quoted === post.quotedPost ? post : { ...post, quotedPost: quoted };
    }
    return { ...post, ...patch, quotedPost: quoted };
  });
}

function initialThread(postId: string): CommunityThread | null {
  const thread = peekCommunityThread(postId);
  if (thread) return thread;
  const post = peekCommunityPost(postId);
  return post ? { post, ancestors: [], replies: [], hasMore: false, cursor: '' } : null;
}

export function CommunityThreadScreen({ postId }: CommunityThreadScreenProps) {
  const { t } = useLocale();
  const { isAuthenticated, navigate, requireAuth } = useCommunity();
  const [thread, setThread] = useState<CommunityThread | null>(() => initialThread(postId));
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<CommentSort>('most-relevant');
  const requestRef = useRef(0);
  const pendingChangesRef = useRef<((thread: CommunityThread | null) => CommunityThread | null)[] | undefined>(undefined);
  const scope = readScope();
  const composerRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (cursor: string) => {
    const requestId = requestRef.current + 1;
    const changes: ((thread: CommunityThread | null) => CommunityThread | null)[] = [];
    pendingChangesRef.current = changes;
    requestRef.current = requestId;

    if (cursor) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }

    try {
      const next = await fetchCommunityThread(postId, { cursor: cursor || undefined, tree: true });
      if (requestRef.current !== requestId || scope !== readScope()) {
        return;
      }
      setThread((current) => {
        const merged = changes.reduce<CommunityThread | null>((value, change) => change(value), next);
        if (!cursor || !current || !merged) {
          return merged;
        }
        const seen = new Set(current.replies.map((reply) => reply.id));
        return {
          ...merged,
          post: current.post,
          ancestors: current.ancestors,
          replies: current.replies.concat(merged.replies.filter((reply) => !seen.has(reply.id))),
        };
      });
      setError(null);
    } catch (caught) {
      if (requestRef.current === requestId && scope === readScope()) {
        if (caught && typeof caught === 'object' && 'status' in caught && (caught.status === 403 || caught.status === 404)) setThread(null);
        setError(getPocketBaseErrorMessage(caught, t('community.thread.failed')));
      }
    } finally {
      if (requestRef.current === requestId && scope === readScope()) {
        pendingChangesRef.current = undefined;
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, [postId, scope, t]);

  useEffect(() => {
    void load('');
    return () => { requestRef.current += 1; };
  }, [load]);

  const patchPost = useCallback((id: string, patch: Partial<CommunityPost>) => {
    if (scope !== readScope()) return;
    const change = (current: CommunityThread | null): CommunityThread | null => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        post: patchIn([current.post], id, patch)[0],
        ancestors: patchIn(current.ancestors, id, patch),
        replies: patchIn(current.replies, id, patch),
      };
    };
    pendingChangesRef.current?.push(change);
    setThread(change);
  }, [scope]);

  const removePost = useCallback((id: string) => {
    if (scope !== readScope()) return;
    if (id === postId) navigate('/community');
    const change = (current: CommunityThread | null): CommunityThread | null => {
      if (!current) {
        return current;
      }
      if (current.post.id === id) {
        // Deleting the post you are looking at leaves nothing to read.
        return null;
      }
      return { ...current, replies: current.replies.filter((reply) => reply.id !== id) };
    };
    pendingChangesRef.current?.push(change);
    setThread(change);
  }, [navigate, postId, scope]);

  const actions = useCommunityEngagement({
    patchPost,
    removePost,
    isAuthenticated,
    onRequireAuth: requireAuth,
    translate: t,
  });

  // Replies arrive flat; the nesting is rebuilt from parentId on the client.
  const commentTree = useMemo(
    () => (thread ? buildCommentTree(thread.replies, thread.post.id, sortMode) : []),
    [sortMode, thread],
  );

  const addReply = useCallback((reply: CommunityPost) => {
    if (scope !== readScope()) return;
    const change = (current: CommunityThread | null): CommunityThread | null => {
      if (!current || current.replies.some((item) => item.id === reply.id)) {
        return current;
      }
      const isDirect = reply.parentId === current.post.id;
      return {
        ...current,
        post: isDirect
          ? { ...current.post, replyCount: current.post.replyCount + 1 }
          : current.post,
        replies: current.replies
          .map((item) => (item.id === reply.parentId
            ? { ...item, replyCount: item.replyCount + 1 }
            : item))
          .concat(reply),
      };
    };
    pendingChangesRef.current?.push(change);
    setThread(change);
  }, [scope]);

  const sortLabels: Record<CommentSort, string> = {
    'most-relevant': t('community.comments.mostRelevant'),
    newest: t('community.comments.newest'),
    all: t('community.comments.allComments'),
  };

  const focusComposer = useCallback(() => {
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    composerRef.current?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus();
  }, []);

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-4 border-b border-[var(--border-subtle)] bg-[var(--bg-app)]/85 px-4 py-3 backdrop-blur-md">
        <button
          type="button"
          aria-label={t('community.thread.back')}
          className="rounded-full p-2 text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-card-hover)]"
          onClick={() => window.history.back()}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-5 rtl:rotate-180" />
        </button>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">{t('community.thread.title')}</h1>
      </div>

      {isLoading && !thread ? (
        <div className="space-y-3 px-4 py-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : null}

      {error && !thread ? (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <HugeiconsIcon icon={Alert01Icon} className="size-8 text-[var(--primary-accent)]" />
          <p className="text-[15px] text-[var(--text-secondary)]">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void load('')}>
            {t('community.feed.retry')}
          </Button>
        </div>
      ) : null}

      {thread ? (
        <>
          {thread.ancestors.map((ancestor) => (
            <CommunityPostCard
              key={ancestor.id}
              post={ancestor}
              actions={actions}
              showThreadLine
              onModerated={(id, status) => patchPost(id, { status })}
            />
          ))}

          <CommunityPostCard
            post={thread.post}
            actions={actions}
            variant="detail"
            onModerated={(id, status) => patchPost(id, { status })}
            onReplyClick={isAuthenticated ? focusComposer : requireAuth}
          />

          {isAuthenticated ? (
            <div ref={composerRef} className="border-b border-[var(--border-subtle)]">
              <DeferredContent>
              <CommunityComposer
                parent={thread.post}
                compact
                onPosted={addReply}
              />
              </DeferredContent>
            </div>
          ) : null}

          <div className="px-4 pb-10 pt-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                {thread.post.replyCount === 1
                  ? t('community.comments.commentsCountSingle')
                  : t('community.comments.commentsCount', { count: thread.post.replyCount })}
              </h2>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-pill-hover)] hover:text-[var(--text-primary)]"
                  >
                    {sortLabels[sortMode]}
                    <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-[var(--bg-card)] border-[var(--border-subtle)]">
                  {(['most-relevant', 'newest', 'all'] as CommentSort[]).map((mode) => (
                    <DropdownMenuItem key={mode} onSelect={() => setSortMode(mode)}>
                      {sortLabels[mode]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {commentTree.length === 0 ? (
              <p className="py-10 text-center text-[15px] text-[var(--text-muted)]">
                {t('community.thread.noReplies')}
              </p>
            ) : (
              <div className="space-y-4">
                {commentTree.map((node) => (
                  <CommunityCommentItem
                    key={node.comment.id}
                    node={node}
                    postAuthorId={thread.post.author?.userId}
                    actions={actions}
                    onModerated={(id, status) => patchPost(id, { status })}
                    onReplyAdded={addReply}
                  />
                ))}
              </div>
            )}
          </div>

          {thread.hasMore ? (
            <div className="flex justify-center py-6">
              <Button
                variant="outline"
                size="sm"
                disabled={isLoadingMore}
                onClick={() => void load(thread.cursor)}
              >
                {isLoadingMore ? t('community.feed.loadingMore') : t('community.feed.loadMore')}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
