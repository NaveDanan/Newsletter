import { useCallback, useEffect, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocale } from '@/contexts/LocaleContext';
import { fetchCommunityConnections, getPocketBaseErrorMessage } from '@/lib/pocketbase/community';
import { CommunityProfileRow } from './CommunityProfileRow';
import type { CommunityProfile } from '@/types/community';

// Followers and following are the same list in two directions, so one screen
// serves both and only the heading changes.

interface CommunityConnectionsScreenProps {
  handle: string;
  direction: 'followers' | 'following';
}

export function CommunityConnectionsScreen({ handle, direction }: CommunityConnectionsScreenProps) {
  const { t } = useLocale();
  const [profiles, setProfiles] = useState<CommunityProfile[]>([]);
  const [cursor, setCursor] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async (nextCursor: string) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setIsLoading(true);

    try {
      const page = await fetchCommunityConnections(handle, direction, { cursor: nextCursor || undefined });
      if (requestRef.current !== requestId) {
        return;
      }
      setProfiles((current) => {
        if (!nextCursor) {
          return page.items;
        }
        const seen = new Set(current.map((item) => item.id));
        return current.concat(page.items.filter((item) => !seen.has(item.id)));
      });
      setCursor(page.cursor);
      setHasMore(page.hasMore);
      setError(null);
    } catch (caught) {
      if (requestRef.current === requestId) {
        setError(getPocketBaseErrorMessage(caught, t('community.profile.failed')));
      }
    } finally {
      if (requestRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [direction, handle, t]);

  useEffect(() => {
    setProfiles([]);
    setCursor('');
    void load('');
  }, [load]);

  const updateRow = (target: string, isFollowing: boolean, followerCount: number) => {
    setProfiles((current) => current.map((item) => (
      item.handle === target
        ? { ...item, isFollowing, followerCount: followerCount >= 0 ? followerCount : item.followerCount }
        : item
    )));
  };

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-4 border-b border-[#E5E5E5] bg-white/85 px-4 py-3 backdrop-blur">
        <button
          type="button"
          aria-label={t('community.thread.back')}
          className="rounded-full p-2 text-[#171717] transition-colors hover:bg-[#F5F5F5]"
          onClick={() => window.history.back()}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-5 rtl:rotate-180" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-[#171717]">
            {t(direction === 'followers' ? 'community.profile.followersTitle' : 'community.profile.followingTitle')}
          </h1>
          <p className="text-sm text-[#737373]">@{handle}</p>
        </div>
      </div>

      {isLoading && profiles.length === 0 ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : null}

      {error && profiles.length === 0 ? (
        <div className="px-6 py-16 text-center text-[15px] text-[#737373]">{error}</div>
      ) : null}

      {!isLoading && !error && profiles.length === 0 ? (
        <p className="px-6 py-16 text-center text-[15px] text-[#737373]">
          {t('community.profile.connectionsEmpty')}
        </p>
      ) : null}

      {profiles.map((item) => (
        <CommunityProfileRow key={item.id} profile={item} onFollowChange={updateRow} />
      ))}

      {hasMore ? (
        <div className="flex justify-center py-6">
          <Button variant="outline" size="sm" disabled={isLoading} onClick={() => void load(cursor)}>
            {isLoading ? t('community.feed.loadingMore') : t('community.feed.loadMore')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
