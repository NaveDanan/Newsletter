import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
import { QuickComposeCard } from '@/components/QuickComposeCard';
import { useCommunityEngagement } from '@/hooks/useCommunityEngagement';
import { useCommunityPosts } from '@/hooks/useCommunityPosts';
import { communityFeedPath } from '@/lib/community-routes';
import { fetchCommunityFeed } from '@/lib/pocketbase/community';
import { cn } from '@/lib/utils';
import { CommunityComposer } from './CommunityComposer';
import { useCommunity } from './CommunityContext';
import { CommunityFeedList } from './CommunityFeedList';
import {
  acknowledgeableComposeRequestId,
  consumeComposeRequest,
  type ComposeRequest,
} from './compose-request';
import { COMMUNITY_FEED_TABS, type CommunityFeedTab, type CommunityPost } from '@/types/community';

// The three feed tabs are three different server queries over the same shape,
// so switching tabs simply swaps the source function and lets
// useCommunityPosts restart its cursor.

interface CommunityFeedScreenProps {
  tab: CommunityFeedTab;
  onPostCreated?: (post: CommunityPost) => void;
  /** Set by the page while something elsewhere is waiting for the composer. */
  composeRequest?: ComposeRequest | null;
  /** Told which request the composer opened with, so the page can release it. */
  onComposeRequestHandled?: (requestId: number) => void;
}

export function CommunityFeedScreen({
  tab,
  onPostCreated,
  composeRequest,
  onComposeRequestHandled,
}: CommunityFeedScreenProps) {
  const { t } = useLocale();
  const { isAuthenticated, navigate, profile, requireAuth, selectedTags } = useCommunity();
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[] | undefined>(undefined);
  // Null until this feed instance opens the composer for a request. A fresh
  // mount therefore still sees a request the page is holding from before it
  // existed, instead of assuming anything older was already dealt with.
  const [handledRequestId, setHandledRequestId] = useState<number | null>(null);

  // Open on the render that observes the request rather than one commit later.
  const unhandled = consumeComposeRequest(composeRequest, handledRequestId);
  if (unhandled) {
    setHandledRequestId(unhandled.handledId);
    setPendingFiles(unhandled.files);
    setIsComposeOpen(true);
  }

  // Acknowledging after the commit is what makes a request one-shot: the page
  // drops it (and its files), so coming back to the feed later starts clean.
  const requestToAcknowledge = acknowledgeableComposeRequestId(composeRequest, handledRequestId);
  useEffect(() => {
    if (requestToAcknowledge === null) {
      return;
    }
    onComposeRequestHandled?.(requestToAcknowledge);
  }, [onComposeRequestHandled, requestToAcknowledge]);

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

  // Pills narrow the already-loaded page rather than refetching, so the filter
  // stays instant and keeps the cursor intact.
  const visiblePosts = useMemo(() => {
    if (selectedTags.length === 0) {
      return feed.posts;
    }
    return feed.posts.filter((post) => (
      post.hashtags.some((tag) => selectedTags.includes(tag.toLowerCase()))
    ));
  }, [feed.posts, selectedTags]);

  return (
    <div>
      <div className="sticky top-0 z-10 bg-[var(--bg-app)]/85 backdrop-blur-md">
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
                className="relative flex-1 px-4 py-3.5 text-[15px] transition-colors hover:bg-[var(--bg-card-hover)]"
                onClick={() => navigate(communityFeedPath(value))}
              >
                <span className={cn(isActive ? 'font-bold text-[var(--primary-accent)]' : 'font-medium text-[var(--text-secondary)]')}>
                  {t('community.tab.' + value)}
                </span>
                {isActive ? (
                  <span className="absolute inset-x-0 bottom-0 mx-auto h-1 w-14 rounded-full bg-[var(--primary-accent)] shadow-sm" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {isAuthenticated ? (
        <div className="px-4 py-4">
          {isComposeOpen ? (
            <div className="create-post-card !p-0 overflow-hidden">
              <CommunityComposer
                autoFocus
                compact
                initialFiles={pendingFiles}
                onPosted={(post) => {
                  setIsComposeOpen(false);
                  setPendingFiles(undefined);
                  feed.prependPost(post);
                  onPostCreated?.(post);
                }}
                onCancel={() => {
                  setIsComposeOpen(false);
                  setPendingFiles(undefined);
                }}
              />
            </div>
          ) : (
            <QuickComposeCard
              user={{ name: profile?.displayName, avatar: profile?.avatarUrl }}
              onCompose={(files) => {
                setPendingFiles(files);
                setIsComposeOpen(true);
              }}
            />
          )}
        </div>
      ) : null}

      <CommunityFeedList
        posts={visiblePosts}
        actions={actions}
        isLoading={feed.isLoading}
        isLoadingMore={feed.isLoadingMore}
        hasMore={feed.hasMore}
        error={feed.error}
        onLoadMore={feed.loadMore}
        onRetry={() => void feed.refresh()}
        emptyMessage={selectedTags.length > 0 ? t('community.trends.filterEmpty') : emptyMessage}
        onModerated={(postId, status) => feed.patchPost(postId, { status })}
      />
    </div>
  );
}
