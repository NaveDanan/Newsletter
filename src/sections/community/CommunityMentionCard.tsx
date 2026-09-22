import { useEffect, useState, type ReactNode } from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocale } from '@/contexts/LocaleContext';
import { fetchCommunityProfile } from '@/lib/pocketbase/community';
import { CommunityAvatar } from './CommunityAvatar';
import { CommunityFollowButton } from './CommunityFollowButton';
import { useCommunity } from './CommunityContext';
import type { CommunityProfile } from '@/types/community';

// One post can repeat the same handle many times, so resolved profiles are
// shared process-wide rather than refetched per hover.
const cache = new Map<string, CommunityProfile>();

interface CommunityMentionCardProps {
  handle: string;
  children: ReactNode;
}

export function CommunityMentionCard({ handle, children }: CommunityMentionCardProps) {
  const { t, formatNumber } = useLocale();
  const { openProfile } = useCommunity();
  const key = handle.toLowerCase();
  const [profile, setProfile] = useState<CommunityProfile | null>(cache.get(key) ?? null);
  const [isOpen, setIsOpen] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    if (!isOpen || profile || hasFailed) {
      return;
    }

    let cancelled = false;
    void fetchCommunityProfile(handle)
      .then((found) => {
        cache.set(key, found);
        if (!cancelled) {
          setProfile(found);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [handle, hasFailed, isOpen, key, profile]);

  return (
    <HoverCard open={isOpen} onOpenChange={setIsOpen} openDelay={250} closeDelay={120}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="w-72 rounded-2xl border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        {hasFailed ? (
          <p className="text-sm text-[var(--text-muted)]">{t('community.profile.notFound')}</p>
        ) : !profile ? (
          <div className="space-y-2">
            <Skeleton className="size-12 rounded-full" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <button type="button" onClick={() => openProfile(profile.handle)}>
                <CommunityAvatar
                  handle={profile.handle}
                  displayName={profile.displayName}
                  avatarUrl={profile.avatarUrl}
                  size="lg"
                />
              </button>

              {!profile.isSelf ? (
                <CommunityFollowButton
                  handle={profile.handle}
                  isFollowing={profile.isFollowing}
                  onChange={(isFollowing, followerCount) => {
                    const next = { ...profile, isFollowing, followerCount };
                    cache.set(key, next);
                    setProfile(next);
                  }}
                />
              ) : null}
            </div>

            <div>
              <button
                type="button"
                onClick={() => openProfile(profile.handle)}
                className="block text-start text-[15px] font-bold text-[var(--text-primary)] hover:underline"
              >
                {profile.displayName || profile.handle}
              </button>
              <p className="text-xs text-[var(--text-muted)]">@{profile.handle}</p>
              {profile.isFollowedBy ? (
                <span className="mt-1 inline-block rounded bg-[var(--bg-pill)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                  {t('community.profile.followsYou')}
                </span>
              ) : null}
            </div>

            {profile.bio ? (
              <p className="line-clamp-3 text-[13px] leading-relaxed text-[var(--text-secondary)]" dir="auto">
                {profile.bio}
              </p>
            ) : null}

            <div className="flex gap-4 text-[13px] text-[var(--text-secondary)]">
              <span>
                <b className="text-[var(--text-primary)]">{formatNumber(profile.followingCount)}</b>{' '}
                {t('community.profile.following')}
              </span>
              <span>
                <b className="text-[var(--text-primary)]">{formatNumber(profile.followerCount)}</b>{' '}
                {t('community.profile.followers')}
              </span>
            </div>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
