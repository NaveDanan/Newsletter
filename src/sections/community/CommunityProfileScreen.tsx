import { useCallback, useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Alert01Icon,
  ArrowLeft01Icon,
  Calendar01Icon,
  Globe02Icon,
  Location01Icon,
  MoreHorizontalIcon,
  Shield01Icon,
} from '@hugeicons/core-free-icons';
import { toast } from 'sonner';
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
import { useCommunityPosts } from '@/hooks/useCommunityPosts';
import { communityConnectionsPath, communityProfilePath } from '@/lib/community-routes';
import {
  fetchCommunityProfile,
  fetchCommunityProfilePosts,
  getPocketBaseErrorMessage,
  moderateCommunityProfile,
  resolveCommunityFileUrl,
  toggleCommunityBlock,
} from '@/lib/pocketbase/community';
import { cn } from '@/lib/utils';
import { CommunityAvatar } from './CommunityAvatar';
import { useCommunity } from './CommunityContext';
import { CommunityFeedList } from './CommunityFeedList';
import { CommunityFollowButton } from './CommunityFollowButton';
import {
  COMMUNITY_PROFILE_TABS,
  type CommunityProfile,
  type CommunityProfileTab,
} from '@/types/community';

interface CommunityProfileScreenProps {
  handle: string;
  tab: CommunityProfileTab;
  onEditProfile: () => void;
}

const EMPTY_KEY: Record<CommunityProfileTab, string> = {
  posts: 'community.profile.emptyPosts',
  replies: 'community.profile.emptyReplies',
  media: 'community.profile.emptyMedia',
  likes: 'community.profile.emptyLikes',
};

export function CommunityProfileScreen({ handle, tab, onEditProfile }: CommunityProfileScreenProps) {
  const { t, formatDate, formatNumber } = useLocale();
  const { isAuthenticated, navigate, openReport, requireAuth, canModerate } = useCommunity();
  const [profile, setProfile] = useState<CommunityProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The screen is keyed on the handle in CommunityPage, so a different profile
  // mounts a fresh component with the loading state already set. The effect only
  // has to fetch, which keeps it from writing state during its own render pass.
  useEffect(() => {
    let cancelled = false;

    void fetchCommunityProfile(handle)
      .then((result) => {
        if (!cancelled) {
          setProfile(result);
          setError(null);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(getPocketBaseErrorMessage(caught, t('community.profile.failed')));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [handle, t]);

  const source = useCallback(
    (cursor: string) => fetchCommunityProfilePosts(handle, { tab, cursor: cursor || undefined }),
    [handle, tab],
  );

  const list = useCommunityPosts(source, {
    enabled: Boolean(profile) && !profile?.isSuspended,
    errorMessage: t('community.profile.failed'),
  });

  const actions = useCommunityEngagement({
    patchPost: list.patchPost,
    removePost: list.removePost,
    isAuthenticated,
    onRequireAuth: requireAuth,
    translate: t,
  });

  const block = async () => {
    if (!profile) {
      return;
    }
    try {
      const result = await toggleCommunityBlock(profile.handle);
      setProfile((current) => (current ? { ...current, isFollowing: false } : current));
      toast.success(t(result.isBlocked ? 'community.profile.blocked' : 'community.profile.unblock'));
    } catch (caught) {
      toast.error(getPocketBaseErrorMessage(caught, t('community.profile.blockFailed')));
    }
  };

  const suspend = async (shouldSuspend: boolean) => {
    if (!profile) {
      return;
    }
    try {
      const result = await moderateCommunityProfile(profile.handle, { suspend: shouldSuspend });
      setProfile((current) => (current ? { ...current, isSuspended: result.isSuspended } : current));
      toast.success(t('community.moderation.actionDone'));
    } catch (caught) {
      toast.error(getPocketBaseErrorMessage(caught, t('community.moderation.actionFailed')));
    }
  };

  if (isLoading && !profile) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-40 w-full rounded-none" />
        <Skeleton className="size-24 rounded-full" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <HugeiconsIcon icon={Alert01Icon} className="size-8 text-[#D93A3A]" />
        <p className="text-[15px] text-[#737373]">{error || t('community.profile.notFound')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-4 border-b border-[#E5E5E5] bg-white/85 px-4 py-2 backdrop-blur">
        <button
          type="button"
          aria-label={t('community.thread.back')}
          className="rounded-full p-2 text-[#171717] transition-colors hover:bg-[#F5F5F5]"
          onClick={() => window.history.back()}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-5 rtl:rotate-180" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold text-[#171717]">
            {profile.displayName || profile.handle}
          </h1>
          <p className="truncate text-sm text-[#737373]">
            {t('community.profile.postCount', { count: formatNumber(profile.postCount) })}
          </p>
        </div>
      </div>

      <div className="h-40 w-full bg-[#F5F5F5]">
        {profile.bannerUrl ? (
          <img
            src={resolveCommunityFileUrl(profile.bannerUrl)}
            alt=""
            className="h-40 w-full object-cover"
          />
        ) : null}
      </div>

      <div className="px-4 pb-3">
        <div className="flex items-start justify-between">
          <div className="-mt-12">
            <CommunityAvatar
              handle={profile.handle}
              displayName={profile.displayName}
              avatarUrl={profile.avatarUrl}
              size="xl"
            />
          </div>

          <div className="mt-3 flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t('community.post.moreActions')}
                  className="rounded-full border border-[#E5E5E5] p-2 text-[#171717] transition-colors hover:bg-[#F5F5F5]"
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!profile.isSelf ? (
                  <DropdownMenuItem onSelect={() => void block()}>
                    {t('community.profile.block')}
                  </DropdownMenuItem>
                ) : null}
                {!profile.isSelf ? (
                  <DropdownMenuItem onSelect={() => openReport({ handle: profile.handle })}>
                    {t('community.profile.report')}
                  </DropdownMenuItem>
                ) : null}
                {canModerate ? (
                  <DropdownMenuItem onSelect={() => void suspend(!profile.isSuspended)}>
                    <HugeiconsIcon icon={Shield01Icon} className="size-4" />
                    {t(profile.isSuspended ? 'community.moderation.restoreAccount' : 'community.moderation.suspendAccount')}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>

            {profile.isSelf ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-full font-semibold"
                onClick={onEditProfile}
              >
                {t('community.profile.editProfile')}
              </Button>
            ) : (
              <CommunityFollowButton
                handle={profile.handle}
                isFollowing={profile.isFollowing}
                size="default"
                onChange={(isFollowing, followerCount) => setProfile((current) => (current
                  ? {
                    ...current,
                    isFollowing,
                    followerCount: followerCount >= 0 ? followerCount : current.followerCount,
                  }
                  : current))}
              />
            )}
          </div>
        </div>

        <div className="mt-3">
          <h2 className="text-xl font-bold text-[#171717]">{profile.displayName || profile.handle}</h2>
          <p className="text-[15px] text-[#737373]">@{profile.handle}</p>
          {profile.isFollowedBy && !profile.isSelf ? (
            <span className="mt-1 inline-block rounded bg-[#F5F5F5] px-1.5 py-0.5 text-xs text-[#737373]">
              {t('community.profile.followsYou')}
            </span>
          ) : null}
        </div>

        {profile.bio ? (
          <p className="mt-3 whitespace-pre-wrap text-[15px] text-[#171717]">{profile.bio}</p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-4 text-[15px] text-[#737373]">
          {profile.location ? (
            <span className="flex items-center gap-1">
              <HugeiconsIcon icon={Location01Icon} className="size-4" />
              {profile.location}
            </span>
          ) : null}
          {profile.website ? (
            <a
              href={profile.website}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              className="flex items-center gap-1 text-[#D93A3A] hover:underline"
            >
              <HugeiconsIcon icon={Globe02Icon} className="size-4" />
              {profile.website.replace(/^https?:[/][/]/, '')}
            </a>
          ) : null}
          <span className="flex items-center gap-1">
            <HugeiconsIcon icon={Calendar01Icon} className="size-4" />
            {t('community.profile.joined', {
              date: formatDate(profile.createdAt, { month: 'long', year: 'numeric' }),
            })}
          </span>
        </div>

        <div className="mt-3 flex gap-5 text-[15px]">
          <button
            type="button"
            className="hover:underline"
            onClick={() => navigate(communityConnectionsPath(profile.handle, 'following'))}
          >
            <span className="font-bold text-[#171717]">{formatNumber(profile.followingCount)}</span>{' '}
            <span className="text-[#737373]">{t('community.profile.following')}</span>
          </button>
          <button
            type="button"
            className="hover:underline"
            onClick={() => navigate(communityConnectionsPath(profile.handle, 'followers'))}
          >
            <span className="font-bold text-[#171717]">{formatNumber(profile.followerCount)}</span>{' '}
            <span className="text-[#737373]">{t('community.profile.followers')}</span>
          </button>
        </div>
      </div>

      {profile.isSuspended ? (
        <p className="border-y border-[#E5E5E5] bg-[#FAFAFA] px-4 py-6 text-center text-[15px] text-[#737373]">
          {t('community.profile.suspended')}
        </p>
      ) : (
        <>
          <div role="tablist" aria-label={t('community.profile.tab.posts')} className="flex border-b border-[#E5E5E5]">
            {COMMUNITY_PROFILE_TABS.map((value) => {
              const isActive = value === tab;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className="relative flex-1 px-2 py-4 text-[15px] transition-colors hover:bg-[#FAFAFA]"
                  onClick={() => navigate(communityProfilePath(profile.handle, value))}
                >
                  <span className={cn(isActive ? 'font-bold text-[#171717]' : 'text-[#737373]')}>
                    {t('community.profile.tab.' + value)}
                  </span>
                  {isActive ? (
                    <span className="absolute inset-x-0 bottom-0 mx-auto h-1 w-14 rounded-full bg-[#D93A3A]" />
                  ) : null}
                </button>
              );
            })}
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
            emptyMessage={t(EMPTY_KEY[tab])}
            onModerated={(postId, status) => list.patchPost(postId, { status })}
          />
        </>
      )}
    </div>
  );
}
