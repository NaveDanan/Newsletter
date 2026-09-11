import { useCallback } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { useLocale } from '@/contexts/LocaleContext';
import { useCommunityEngagement } from '@/hooks/useCommunityEngagement';
import { useCommunityPosts } from '@/hooks/useCommunityPosts';
import { fetchCommunityHashtagPosts } from '@/lib/pocketbase/community';
import { useCommunity } from './CommunityContext';
import { CommunityFeedList } from './CommunityFeedList';

interface CommunityHashtagScreenProps {
  tag: string;
}

export function CommunityHashtagScreen({ tag }: CommunityHashtagScreenProps) {
  const { t } = useLocale();
  const { isAuthenticated, requireAuth } = useCommunity();

  const source = useCallback(
    (cursor: string) => fetchCommunityHashtagPosts(tag, { cursor: cursor || undefined }),
    [tag],
  );

  const list = useCommunityPosts(source, { errorMessage: t('community.hashtag.failed') });

  const actions = useCommunityEngagement({
    patchPost: list.patchPost,
    removePost: list.removePost,
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
        <h1 className="truncate text-xl font-bold text-[#171717]">#{tag}</h1>
      </div>

      <CommunityFeedList
        posts={list.posts}
        actions={actions}
        isLoading={list.isLoading}
        isLoadingMore={list.isLoadingMore}
        hasMore={list.hasMore}
        error={list.error}
        onLoadMore={list.loadMore}
        onRetry={() => void list.refresh()}
        emptyMessage={t('community.hashtag.empty')}
        onModerated={(postId, status) => list.patchPost(postId, { status })}
      />
    </div>
  );
}
