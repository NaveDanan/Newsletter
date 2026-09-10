import { useCallback, useMemo } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
import { useCommunityEngagement } from '@/hooks/useCommunityEngagement';
import { useCommunityPosts } from '@/hooks/useCommunityPosts';
import { communityFeedPath } from '@/lib/community-routes';
import { fetchCommunityFeed } from '@/lib/pocketbase/community';
import { cn } from '@/lib/utils';
import { CommunityComposer } from './CommunityComposer';
import { useCommunity } from './CommunityContext';
import { CommunityFeedList } from './CommunityFeedList';
import { COMMUNITY_FEED_TABS, type CommunityFeedTab, type CommunityPost } from '@/types/community';

// The three feed tabs are three different server queries over the same shape,
// so switching tabs simply swaps the source function and lets
// useCommunityPosts restart its cursor.

interface CommunityFeedScreenProps {
  tab: CommunityFeedTab;
  onPostCreated?: (post: CommunityPost) => void;
}

export function CommunityFeedScreen({ tab, onPostCreated }: CommunityFeedScreenProps) {
  const { t } = useLocale();
  const { isAuthenticated, navigate, requireAuth } = useCommunity();

  const source = useCallback(
    (cursor: string) => fetchCommunityFeed({ tab, cursor: cursor || undefined }),
    [tab],
  );

  const feed = useCommunityPosts(source, { errorMessage: t('community.feed.failed') });
  const actions = useCommunityEngagement({
    patchPost: feed.patchPost,
    removePost: feed.removePost,
    isAuthenticated,
    onRequireAuth: requireAuth,
    translate: t,
  });

  const emptyMessage = useMemo(() => (
    tab === 'following' ? t('community.feed.emptyFollowing') : t('community.feed.empty')
  ), [t, tab]);

  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-[#E5E5E5] bg-white/85 backdrop-blur">
        <h1 className="sr-only">{t('community.title')}</h1>
        <div role="tablist" aria-label={t('community.title')} className="flex">
          {COMMUNITY_FEED_TABS.map((value) => {
            const isActive = value === tab;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={isActive}
                className="relative flex-1 px-4 py-4 text-[15px] transition-colors hover:bg-[#FAFAFA]"
                onClick={() => navigate(communityFeedPath(value))}
              >
                <span className={cn(isActive ? 'font-bold text-[#171717]' : 'text-[#737373]')}>
                  {t('community.tab.' + value)}
                </span>
                {isActive ? (
                  <span className="absolute inset-x-0 bottom-0 mx-auto h-1 w-14 rounded-full bg-[#D93A3A]" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {isAuthenticated ? (
        <div className="border-b border-[#E5E5E5]">
          <CommunityComposer
            onPosted={(post) => {
              feed.prependPost(post);
              onPostCreated?.(post);
            }}
          />
        </div>
      ) : null}

      <CommunityFeedList
        posts={feed.posts}
        actions={actions}
        isLoading={feed.isLoading}
        isLoadingMore={feed.isLoadingMore}
        hasMore={feed.hasMore}
        error={feed.error}
        onLoadMore={feed.loadMore}
        onRetry={() => void feed.refresh()}
        emptyMessage={emptyMessage}
        onModerated={(postId, status) => feed.patchPost(postId, { status })}
      />
    </div>
  );
}
