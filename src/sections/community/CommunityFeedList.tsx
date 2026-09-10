import { useEffect, useRef } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert01Icon, Loading02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';
import { CommunityPostCard } from './CommunityPostCard';
import type { UseCommunityEngagementResult } from '@/hooks/useCommunityEngagement';
import type { CommunityPost } from '@/types/community';

// Every list of posts in the community — the feed, a profile tab, bookmarks, a
// hashtag page, search results — renders through here, so the skeleton, the
// empty state, the failure state and the infinite scroll behave identically
// everywhere.

interface CommunityFeedListProps {
  posts: CommunityPost[];
  actions: UseCommunityEngagementResult;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  onLoadMore: () => void;
  onRetry: () => void;
  emptyMessage: string;
  onModerated?: (postId: string, status: CommunityPost['status']) => void;
  className?: string;
}

function PostSkeleton() {
  return (
    <div className="flex gap-3 border-b border-[#E5E5E5] px-4 py-4">
      <Skeleton className="size-10 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

export function CommunityFeedList({
  posts,
  actions,
  isLoading,
  isLoadingMore,
  hasMore,
  error,
  onLoadMore,
  onRetry,
  emptyMessage,
  onModerated,
  className,
}: CommunityFeedListProps) {
  const { t } = useLocale();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef(onLoadMore);

  // The observer callback below is created once per hasMore/length change, so
  // the newest loader is parked on a ref instead of in the dependency list.
  useEffect(() => {
    loadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  // The sentinel sits one screen below the last card. Watching it with an
  // observer rather than a scroll listener keeps the feed off the main thread
  // while the reader flicks through it.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loadMoreRef.current();
      }
    }, { rootMargin: '600px 0px' });

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, posts.length]);

  if (isLoading && posts.length === 0) {
    return (
      <div className={className}>
        <PostSkeleton />
        <PostSkeleton />
        <PostSkeleton />
      </div>
    );
  }

  if (error && posts.length === 0) {
    return (
      <div className={cn('flex flex-col items-center gap-3 px-6 py-16 text-center', className)}>
        <HugeiconsIcon icon={Alert01Icon} className="size-8 text-[#D93A3A]" />
        <p className="text-[15px] text-[#737373]">{error}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t('community.feed.retry')}
        </Button>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className={cn('px-6 py-16 text-center text-[15px] text-[#737373]', className)}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={className}>
      {posts.map((post) => (
        <CommunityPostCard key={post.id} post={post} actions={actions} onModerated={onModerated} />
      ))}

      <div ref={sentinelRef} aria-hidden className="h-px" />

      {isLoadingMore ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-[#737373]">
          <HugeiconsIcon icon={Loading02Icon} className="size-4 animate-spin" />
          {t('community.feed.loadingMore')}
        </div>
      ) : null}

      {!hasMore && !isLoadingMore && posts.length > 0 ? <div className="h-16" /> : null}

      {hasMore && !isLoadingMore ? (
        <div className="flex justify-center py-6">
          <Button variant="outline" size="sm" onClick={onLoadMore}>
            {t('community.feed.loadMore')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
