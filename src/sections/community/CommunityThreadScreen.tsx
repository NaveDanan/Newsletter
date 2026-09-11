import { useCallback, useEffect, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert01Icon, ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocale } from '@/contexts/LocaleContext';
import { useCommunityEngagement } from '@/hooks/useCommunityEngagement';
import { fetchCommunityThread, getPocketBaseErrorMessage } from '@/lib/pocketbase/community';
import { CommunityComposer } from './CommunityComposer';
import { useCommunity } from './CommunityContext';
import { CommunityPostCard } from './CommunityPostCard';
import type { CommunityPost, CommunityThread } from '@/types/community';

// A thread is one request: the post, its ancestors up to the root, and the
// first page of replies. Paging replies reuses the same route with a cursor,
// so nothing here needs the generic post pager.

interface CommunityThreadScreenProps {
  postId: string;
}

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

export function CommunityThreadScreen({ postId }: CommunityThreadScreenProps) {
  const { t } = useLocale();
  const { isAuthenticated, navigate, requireAuth } = useCommunity();
  const [thread, setThread] = useState<CommunityThread | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async (cursor: string) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    if (cursor) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }

    try {
      const next = await fetchCommunityThread(postId, { cursor: cursor || undefined });
      if (requestRef.current !== requestId) {
        return;
      }
      setThread((current) => {
        if (!cursor || !current) {
          return next;
        }
        const seen = new Set(current.replies.map((reply) => reply.id));
        return {
          ...next,
          post: current.post,
          ancestors: current.ancestors,
          replies: current.replies.concat(next.replies.filter((reply) => !seen.has(reply.id))),
        };
      });
      setError(null);
    } catch (caught) {
      if (requestRef.current === requestId) {
        setError(getPocketBaseErrorMessage(caught, t('community.thread.failed')));
      }
    } finally {
      if (requestRef.current === requestId) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, [postId, t]);

  useEffect(() => {
    setThread(null);
    void load('');
  }, [load]);

  const patchPost = useCallback((id: string, patch: Partial<CommunityPost>) => {
    setThread((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        post: patchIn([current.post], id, patch)[0],
        ancestors: patchIn(current.ancestors, id, patch),
        replies: patchIn(current.replies, id, patch),
      };
    });
  }, []);

  const removePost = useCallback((id: string) => {
    setThread((current) => {
      if (!current) {
        return current;
      }
      if (current.post.id === id) {
        // Deleting the post you are looking at leaves nothing to read.
        navigate('/community');
        return current;
      }
      return { ...current, replies: current.replies.filter((reply) => reply.id !== id) };
    });
  }, [navigate]);

  const actions = useCommunityEngagement({
    patchPost,
    removePost,
    isAuthenticated,
    onRequireAuth: requireAuth,
    translate: t,
  });

  return (
    <div>
      <div className="sticky top-[104px] z-10 flex items-center gap-4 border-b border-[#E5E5E5] bg-white/85 px-4 py-3 backdrop-blur">
        <button
          type="button"
          aria-label={t('community.thread.back')}
          className="rounded-full p-2 text-[#171717] transition-colors hover:bg-[#F5F5F5]"
          onClick={() => window.history.back()}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-5 rtl:rotate-180" />
        </button>
        <h1 className="text-xl font-bold text-[#171717]">{t('community.thread.title')}</h1>
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
          <HugeiconsIcon icon={Alert01Icon} className="size-8 text-[#D93A3A]" />
          <p className="text-[15px] text-[#737373]">{error}</p>
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
          />

          {isAuthenticated ? (
            <div className="border-b border-[#E5E5E5]">
              <CommunityComposer
                parent={thread.post}
                compact
                onPosted={(reply) => {
                  setThread((current) => (current
                    ? {
                      ...current,
                      post: { ...current.post, replyCount: current.post.replyCount + 1 },
                      replies: [reply, ...current.replies],
                    }
                    : current));
                }}
              />
            </div>
          ) : null}

          <h2 className="sr-only">{t('community.thread.replies')}</h2>

          {thread.replies.length === 0 ? (
            <p className="px-6 py-12 text-center text-[15px] text-[#737373]">{t('community.thread.noReplies')}</p>
          ) : null}

          {thread.replies.map((reply) => (
            <CommunityPostCard
              key={reply.id}
              post={reply}
              actions={actions}
              onModerated={(id, status) => patchPost(id, { status })}
            />
          ))}

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
