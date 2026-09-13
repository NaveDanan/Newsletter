import { useCallback, useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Alert01Icon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Calendar01Icon,
  Globe02Icon,
  Location01Icon,
  MoreHorizontalIcon,
  Search01Icon,
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
import { useAuth } from '@/contexts/AuthContext';
import { useLocale } from '@/contexts/LocaleContext';
import { useCommunityEngagement } from '@/hooks/useCommunityEngagement';
import { useCommunityPosts } from '@/hooks/useCommunityPosts';
import {
  communityConnectionsPath,
  communityFeedPath,
  communityProfilePath,
  communitySearchPath,
} from '@/lib/community-routes';
import {
  fetchCommunityProfile,
  fetchCommunityProfilePosts,
  fetchCommunityTrends,
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
import type { CommunityProfile, CommunityProfileTab } from '@/types/community';

interface CommunityProfileScreenProps {
  handle: string;
  tab: CommunityProfileTab;
  onEditProfile: () => void;
}

const DISPLAY_TABS: CommunityProfileTab[] = ['posts', 'replies', 'reposts', 'media'];

const EMPTY_KEY: Record<CommunityProfileTab, string> = {
  posts: 'community.profile.emptyPosts',
  replies: 'community.profile.emptyReplies',
  reposts: 'community.profile.emptyReposts',
  media: 'community.profile.emptyMedia',
  likes: 'community.profile.emptyLikes',
};

function VerifiedBadge({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-label="Verified"
      className={cn('inline-block shrink-0 fill-current text-[#1D9BF0]', className)}
    >
      <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.92 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z" />
    </svg>
  );
}

const DEFAULT_SUGGESTIONS: CommunityProfile[] = [
  {
    id: 'sug-1',
    userId: 'u-1',
    handle: 'aibreak',
    displayName: 'AI-BREAK',
    bio: 'הניוזלטר המוביל לבינה מלאכותית, עדכונים, כלים ומדריכים מעשיים.',
    location: 'Israel',
    website: '',
    avatarUrl: '',
    bannerUrl: '',
    pinnedPostId: '',
    followerCount: 1420,
    followingCount: 12,
    postCount: 84,
    isSuspended: false,
    suspendedReason: '',
    createdAt: '2025-01-01T00:00:00Z',
    isFollowing: false,
    isFollowedBy: false,
    isSelf: false,
  },
  {
    id: 'sug-2',
    userId: 'u-2',
    handle: 'navedanan',
    displayName: 'Nave Danan',
    bio: 'Product Designer & Full-stack Engineer. Building AI experiences.',
    location: 'Tel Aviv',
    website: '',
    avatarUrl: '',
    bannerUrl: '',
    pinnedPostId: '',
    followerCount: 520,
    followingCount: 38,
    postCount: 42,
    isSuspended: false,
    suspendedReason: '',
    createdAt: '2025-03-01T00:00:00Z',
    isFollowing: false,
    isFollowedBy: false,
    isSelf: false,
  },
  {
    id: 'sug-3',
    userId: 'u-3',
    handle: 'techlead',
    displayName: 'Tech Lead',
    bio: 'כל מה שחם בפיתוח, ארכיטקטורה וחדשנות דיגיטלית.',
    location: '',
    website: '',
    avatarUrl: '',
    bannerUrl: '',
    pinnedPostId: '',
    followerCount: 890,
    followingCount: 45,
    postCount: 128,
    isSuspended: false,
    suspendedReason: '',
    createdAt: '2025-02-01T00:00:00Z',
    isFollowing: false,
    isFollowedBy: false,
    isSelf: false,
  },
];

export function CommunityProfileScreen({ handle, tab, onEditProfile }: CommunityProfileScreenProps) {
  const { t, formatDate, formatNumber } = useLocale();
  const { isAuthenticated, navigate, openReport, requireAuth, canModerate } = useCommunity();
  const { user } = useAuth();
  const [profile, setProfile] = useState<CommunityProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<CommunityProfile[]>([]);

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

  useEffect(() => {
    let cancelled = false;
    void fetchCommunityTrends()
      .then((res) => {
        if (!cancelled) {
          setSuggestions(res.suggestions);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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

  const updateSuggestion = (sugHandle: string, isFollowing: boolean, followerCount: number) => {
    setSuggestions((current) => {
      const list = current.length > 0 ? current : DEFAULT_SUGGESTIONS;
      return list.map((item) => (
        item.handle === sugHandle
          ? { ...item, isFollowing, followerCount: followerCount >= 0 ? followerCount : item.followerCount }
          : item
      ));
    });
  };

  if (isLoading && !profile) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-48 sm:h-52 w-full rounded-none" />
        <div className="flex items-start justify-between px-4">
          <Skeleton className="size-28 sm:size-36 rounded-full -mt-14" />
          <Skeleton className="h-9 w-28 rounded-full mt-3" />
        </div>
        <div className="space-y-2 px-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-64 mt-3" />
        </div>
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

  const repostedByLabel = profile.isSelf
    ? t('community.post.youReposted')
    : `${profile.displayName || profile.handle} ${t('community.post.reposted')}`;

  const renderWhoToFollow = () => {
    const filtered = suggestions.filter((s) => s.handle !== profile.handle);
    const displayedSuggestions = (filtered.length > 0 ? filtered : DEFAULT_SUGGESTIONS.filter((s) => s.handle !== profile.handle)).slice(0, 3);
    if (displayedSuggestions.length === 0) {
      return null;
    }

    return (
      <div className="border-t border-[#E5E5E5] bg-white">
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-xl font-bold text-[#171717]">{t('community.profile.whoToFollow')}</h3>
        </div>
        <div className="divide-y divide-[#F0F0F0]">
          {displayedSuggestions.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-[#FAFAFA] cursor-pointer"
              onClick={() => navigate(communityProfilePath(item.handle))}
            >
              <div className="flex items-start gap-3 min-w-0">
                <CommunityAvatar
                  handle={item.handle}
                  displayName={item.displayName}
                  avatarUrl={item.avatarUrl}
                  size="md"
                  onClick={() => navigate(communityProfilePath(item.handle))}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="truncate text-[15px] font-bold text-[#171717] hover:underline">
                      {item.displayName || item.handle}
                    </span>
                    <VerifiedBadge className="size-4" />
                  </div>
                  <p className="truncate text-sm text-[#737373]">@{item.handle}</p>
                  {item.bio ? (
                    <p className="mt-1 line-clamp-2 text-sm text-[#171717]">{item.bio}</p>
                  ) : null}
                </div>
              </div>
              <div className="shrink-0 pt-0.5" onClick={(e) => e.stopPropagation()}>
                <CommunityFollowButton
                  handle={item.handle}
                  isFollowing={item.isFollowing}
                  size="sm"
                  onChange={(isFollowing, followerCount) => updateSuggestion(item.handle, isFollowing, followerCount)}
                />
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="w-full px-4 py-3 text-start text-sm font-semibold text-[#D93A3A] transition-colors hover:bg-[#FAFAFA]"
          onClick={() => navigate(communitySearchPath(''))}
        >
          {t('community.profile.showMore')}
        </button>
      </div>
    );
  };

  return (
    <div>
      {/* Top sticky header bar */}
      <div className="sticky top-[104px] z-10 flex items-center justify-between border-b border-[#E5E5E5] bg-white/85 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-6 min-w-0">
          <button
            type="button"
            aria-label={t('community.thread.back')}
            className="rounded-full p-2 text-[#171717] transition-colors hover:bg-[#F5F5F5]"
            onClick={() => {
              if (window.history.length > 1) {
                window.history.back();
              } else {
                navigate(communityFeedPath());
              }
            }}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-5 rtl:rotate-180" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <h1 className="truncate text-xl font-bold text-[#171717]">
                {profile.displayName || profile.handle}
              </h1>
              <VerifiedBadge className="size-4" />
            </div>
            <p className="truncate text-xs sm:text-sm text-[#737373]">
              {profile.postCount === 1
                ? t('community.profile.postCountOne')
                : t('community.profile.postCount', { count: formatNumber(profile.postCount) })}
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label={t('community.nav.explore')}
          className="rounded-full p-2 text-[#171717] transition-colors hover:bg-[#F5F5F5]"
          onClick={() => navigate(communitySearchPath(''))}
        >
          <HugeiconsIcon icon={Search01Icon} className="size-5" />
        </button>
      </div>

      {/* Header cover banner */}
      <div className="relative h-48 sm:h-52 w-full bg-[#333639] overflow-hidden">
        {profile.bannerUrl ? (
          <img
            src={resolveCommunityFileUrl(profile.bannerUrl)}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-r from-[#202327] via-[#2f3336] to-[#202327]" />
        )}
      </div>

      {/* Profile info section */}
      <div className="px-4 pb-3">
        <div className="flex items-start justify-between">
          <div className="-mt-14 sm:-mt-18 shrink-0">
            <CommunityAvatar
              handle={profile.handle}
              displayName={profile.displayName || (profile.isSelf ? user?.name : '') || ''}
              avatarUrl={profile.avatarUrl || (profile.isSelf ? user?.avatar : '') || ''}
              size="2xl"
            />
          </div>

          <div className="mt-3 flex items-center gap-2">
            {!profile.isSelf ? (
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
                  <DropdownMenuItem onSelect={() => void block()}>
                    {t('community.profile.block')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => openReport({ handle: profile.handle })}>
                    {t('community.profile.report')}
                  </DropdownMenuItem>
                  {canModerate ? (
                    <DropdownMenuItem onSelect={() => void suspend(!profile.isSuspended)}>
                      <HugeiconsIcon icon={Shield01Icon} className="size-4" />
                      {t(profile.isSuspended ? 'community.moderation.restoreAccount' : 'community.moderation.suspendAccount')}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            {profile.isSelf ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-full border border-[#CFD9DE] px-4 py-1.5 text-sm font-bold text-[#171717] transition-colors hover:bg-[#F5F5F5]"
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

        {/* Name, verified badge and get verified pill */}
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <h2 className="text-xl sm:text-2xl font-bold text-[#171717]">
                {profile.displayName || profile.handle}
              </h2>
              <VerifiedBadge className="size-5" />
            </div>
            {profile.isSelf ? (
              <button
                type="button"
                onClick={() => toast.info('Verified badges are awarded to recognized contributors.')}
                className="rounded-full border border-[#CFD9DE] px-3 py-0.5 text-xs font-bold text-[#171717] transition-colors hover:bg-[#F5F5F5]"
              >
                {t('community.profile.getVerified')}
              </button>
            ) : null}
          </div>
          <p className="text-[15px] text-[#737373]">@{profile.handle}</p>
          {profile.isFollowedBy && !profile.isSelf ? (
            <span className="mt-1 inline-block rounded bg-[#EFF3F4] px-1.5 py-0.5 text-xs font-medium text-[#536471]">
              {t('community.profile.followsYou')}
            </span>
          ) : null}
        </div>

        {profile.bio ? (
          <p className="mt-3 whitespace-pre-wrap text-[15px] text-[#171717]">{profile.bio}</p>
        ) : null}

        {/* Metadata row */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[15px] text-[#737373]">
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
            <span>
              {t('community.profile.joined', {
                date: formatDate(profile.createdAt, { month: 'long', year: 'numeric' }),
              })}
            </span>
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5 rtl:rotate-180 text-[#737373]" />
          </span>
        </div>

        {/* Follow counts */}
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
          {/* Tabs row */}
          <div role="tablist" aria-label={t('community.profile.tab.posts')} className="flex border-b border-[#E5E5E5]">
            {DISPLAY_TABS.map((value) => {
              const isActive = value === tab;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className="relative flex-1 px-2 py-3.5 text-[15px] transition-colors hover:bg-[#F5F5F5]/60"
                  onClick={() => navigate(communityProfilePath(profile.handle, value))}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span className={cn(isActive ? 'font-bold text-[#171717]' : 'font-medium text-[#737373]')}>
                      {t('community.profile.tab.' + value)}
                    </span>
                    {value === 'posts' ? (
                      <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 text-[#737373] opacity-75" />
                    ) : null}
                  </div>
                  {isActive ? (
                    <span className="absolute inset-x-0 bottom-0 mx-auto h-1 w-14 rounded-full bg-[#D93A3A]" />
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* Posts feed */}
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
            repostedBy={tab === 'reposts' ? repostedByLabel : undefined}
            afterFeedContent={tab === 'posts' && list.posts.length <= 2 ? renderWhoToFollow() : null}
            emptyContent={
              tab === 'posts' ? (
                <div>
                  <div className="px-6 py-12 text-center text-[15px] text-[#737373]">
                    {t(EMPTY_KEY[tab])}
                  </div>
                  {renderWhoToFollow()}
                </div>
              ) : undefined
            }
          />
        </>
      )}
    </div>
  );
}
