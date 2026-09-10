import { useCallback, useEffect, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Search01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocale } from '@/contexts/LocaleContext';
import { useCommunityEngagement } from '@/hooks/useCommunityEngagement';
import { useCommunityPosts } from '@/hooks/useCommunityPosts';
import { communitySearchPath } from '@/lib/community-routes';
import {
  getPocketBaseErrorMessage,
  searchCommunityHashtags,
  searchCommunityPeople,
  searchCommunityPosts,
} from '@/lib/pocketbase/community';
import { cn } from '@/lib/utils';
import { useCommunity } from './CommunityContext';
import { CommunityFeedList } from './CommunityFeedList';
import { CommunityProfileRow } from './CommunityProfileRow';
import {
  COMMUNITY_SEARCH_TYPES,
  type CommunityHashtag,
  type CommunityProfile,
  type CommunitySearchType,
} from '@/types/community';

// One screen, three result shapes. Posts reuse the shared pager; people and
// hashtags are short enough to page manually here rather than generalizing the
// pager over a second item type.

interface CommunitySearchScreenProps {
  query: string;
  type: CommunitySearchType;
}

export function CommunitySearchScreen({ query, type }: CommunitySearchScreenProps) {
  const { t, formatNumber } = useLocale();
  const { isAuthenticated, navigate, openHashtag, requireAuth } = useCommunity();
  const [term, setTerm] = useState(query);
  const [people, setPeople] = useState<CommunityProfile[]>([]);
  const [hashtags, setHashtags] = useState<CommunityHashtag[]>([]);
  const [isSideLoading, setIsSideLoading] = useState(false);
  const [sideError, setSideError] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    setTerm(query);
  }, [query]);

  const source = useCallback(
    (cursor: string) => searchCommunityPosts(query, { cursor: cursor || undefined }),
    [query],
  );

  const list = useCommunityPosts(source, {
    enabled: type === 'posts' && query.trim().length > 0,
    errorMessage: t('community.search.failed'),
  });

  const actions = useCommunityEngagement({
    patchPost: list.patchPost,
    removePost: list.removePost,
    isAuthenticated,
    onRequireAuth: requireAuth,
    translate: t,
  });

  useEffect(() => {
    if (type === 'posts' || !query.trim()) {
      setPeople([]);
      setHashtags([]);
      return;
    }

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setIsSideLoading(true);

    const request = type === 'people'
      ? searchCommunityPeople(query).then((page) => {
        if (requestRef.current === requestId) {
          setPeople(page.items);
          setHashtags([]);
        }
      })
      : searchCommunityHashtags(query).then((items) => {
        if (requestRef.current === requestId) {
          setHashtags(items);
          setPeople([]);
        }
      });

    void request
      .then(() => {
        if (requestRef.current === requestId) {
          setSideError(null);
        }
      })
      .catch((caught) => {
        if (requestRef.current === requestId) {
          setSideError(getPocketBaseErrorMessage(caught, t('community.search.failed')));
        }
      })
      .finally(() => {
        if (requestRef.current === requestId) {
          setIsSideLoading(false);
        }
      });
  }, [query, t, type]);

  const updateRow = (handle: string, isFollowing: boolean, followerCount: number) => {
    setPeople((current) => current.map((item) => (
      item.handle === handle
        ? { ...item, isFollowing, followerCount: followerCount >= 0 ? followerCount : item.followerCount }
        : item
    )));
  };

  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-[#E5E5E5] bg-white/85 backdrop-blur">
        <form
          role="search"
          className="relative px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            navigate(communitySearchPath(term.trim(), type));
          }}
        >
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute start-8 top-1/2 size-4 -translate-y-1/2 text-[#737373]"
          />
          <input
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={t('community.search.placeholder')}
            aria-label={t('community.search.placeholder')}
            className="w-full rounded-full border border-transparent bg-[#F5F5F5] py-2.5 pe-4 ps-11 text-[15px] outline-none transition-colors focus:border-[#D93A3A] focus:bg-white"
          />
        </form>

        <div role="tablist" aria-label={t('community.search.title')} className="flex">
          {COMMUNITY_SEARCH_TYPES.map((value) => {
            const isActive = value === type;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={isActive}
                className="relative flex-1 px-2 py-3 text-[15px] transition-colors hover:bg-[#FAFAFA]"
                onClick={() => navigate(communitySearchPath(query, value))}
              >
                <span className={cn(isActive ? 'font-bold text-[#171717]' : 'text-[#737373]')}>
                  {t('community.search.tab.' + value)}
                </span>
                {isActive ? (
                  <span className="absolute inset-x-0 bottom-0 mx-auto h-1 w-14 rounded-full bg-[#D93A3A]" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {!query.trim() ? (
        <p className="px-6 py-16 text-center text-[15px] text-[#737373]">{t('community.search.prompt')}</p>
      ) : null}

      {query.trim() && type === 'posts' ? (
        <CommunityFeedList
          posts={list.posts}
          actions={actions}
          isLoading={list.isLoading}
          isLoadingMore={list.isLoadingMore}
          hasMore={list.hasMore}
          error={list.error}
          onLoadMore={list.loadMore}
          onRetry={() => void list.refresh()}
          emptyMessage={t('community.search.empty')}
          onModerated={(postId, status) => list.patchPost(postId, { status })}
        />
      ) : null}

      {query.trim() && type !== 'posts' ? (
        <div>
          {isSideLoading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : null}

          {sideError ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <p className="text-[15px] text-[#737373]">{sideError}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(communitySearchPath(query, type))}
              >
                {t('community.feed.retry')}
              </Button>
            </div>
          ) : null}

          {!isSideLoading && !sideError && people.length === 0 && hashtags.length === 0 ? (
            <p className="px-6 py-16 text-center text-[15px] text-[#737373]">{t('community.search.empty')}</p>
          ) : null}

          {people.map((item) => (
            <CommunityProfileRow key={item.id} profile={item} onFollowChange={updateRow} />
          ))}

          <ul>
            {hashtags.map((item) => (
              <li key={item.tag}>
                <button
                  type="button"
                  className="w-full border-b border-[#E5E5E5] px-4 py-4 text-start transition-colors hover:bg-[#FAFAFA]"
                  onClick={() => openHashtag(item.tag)}
                >
                  <span className="block text-[15px] font-semibold text-[#171717]">
                    #{item.displayTag || item.tag}
                  </span>
                  <span className="block text-sm text-[#737373]">
                    {t('community.trends.postCount', { count: formatNumber(item.postCount) })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
