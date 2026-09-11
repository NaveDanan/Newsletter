import { useCallback } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
import { useCommunityEngagement } from '@/hooks/useCommunityEngagement';
import { useCommunityPosts } from '@/hooks/useCommunityPosts';
import { fetchCommunityBookmarks } from '@/lib/pocketbase/community';
import { useCommunity } from './CommunityContext';
import { CommunityFeedList } from './CommunityFeedList';

// Bookmarks are private to the caller, so the route is authenticated and there
// is no anonymous variant of this screen.
export function CommunityBookmarksScreen() {
  const { t } = useLocale();
  const { isAuthenticated, requireAuth } = useCommunity();

  const source = useCallback(
    (cursor: string) => fetchCommunityBookmarks({ cursor: cursor || undefined }),
    [],
  );

  const list = useCommunityPosts(source, {
    enabled: isAuthenticated,
    errorMessage: t('community.feed.failed'),
  });

  const actions = useCommunityEngagement({
    patchPost: list.patchPost,
    removePost: list.removePost,
    isAuthenticated,
    onRequireAuth: requireAuth,
    translate: t,
  });

  return (
    <div>
      <div className="sticky top-[104px] z-10 border-b border-[#E5E5E5] bg-white/85 px-4 py-3 backdrop-blur">
        <h1 className="text-xl font-bold text-[#171717]">{t('community.bookmarks.title')}</h1>
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
        emptyMessage={t('community.bookmarks.empty')}
        onModerated={(postId, status) => list.patchPost(postId, { status })}
      />
    </div>
  );
}
