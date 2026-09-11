import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowLeft01Icon,
  Bookmark01Icon,
  Home01Icon,
  Logout01Icon,
  MoreHorizontalIcon,
  Notification01Icon,
  PencilEdit01Icon,
  Search01Icon,
  Shield01Icon,
  UserIcon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useLocale } from '@/contexts/LocaleContext';
import {
  communityBookmarksPath,
  communityFeedPath,
  communityNotificationsPath,
  communityProfilePath,
  communitySearchPath,
  type CommunitySection,
} from '@/lib/community-routes';
import { cn } from '@/lib/utils';
import { CommunityAvatar } from './CommunityAvatar';
import { useCommunity } from './CommunityContext';

// The left rail is the primary navigation for the community, inspired by X (Twitter).
// It occupies the entire vertical screen (h-screen / h-[100dvh]) and stays frozen
// in place as the feed scrolls. On lg it renders a compact 88px icon-only column,
// and expands to 275px with labels on xl screens. Under lg, the mobile bar takes over.

interface CommunityLeftRailProps {
  section: CommunitySection;
  unreadCount: number;
  onCompose: () => void;
  onLeave: () => void;
  onOpenModeration: () => void;
}

interface RailItem {
  key: string;
  label: string;
  icon: typeof Home01Icon;
  path: string;
  badge?: number;
}

export function CommunityLeftRail({
  section,
  unreadCount,
  onCompose,
  onLeave,
  onOpenModeration,
}: CommunityLeftRailProps) {
  const { t, formatNumber, dir, isRTL } = useLocale();
  const { isAuthenticated, profile, canModerate, navigate, requireAuth } = useCommunity();
  const { user, isAuthenticated: isAuthAuthenticated, logout } = useAuth();

  const isLoggedIn = isAuthenticated || isAuthAuthenticated || Boolean(user) || Boolean(profile);
  const userAvatarUrl = profile?.avatarUrl || user?.avatar || '';
  const userDisplayName = profile?.displayName || user?.name || user?.email?.split('@')[0] || t('account.profile');
  const userHandle = profile?.handle || (user?.name ? user.name.toLowerCase().replace(/\s+/g, '') : (user?.email ? user.email.split('@')[0] : 'user'));

  const items: RailItem[] = [
    { key: 'feed', label: t('community.nav.feed'), icon: Home01Icon, path: communityFeedPath() },
    { key: 'search', label: t('community.nav.explore'), icon: Search01Icon, path: communitySearchPath('') },
    {
      key: 'notifications',
      label: t('community.nav.notifications'),
      icon: Notification01Icon,
      path: communityNotificationsPath(),
      badge: unreadCount,
    },
    { key: 'bookmarks', label: t('community.nav.bookmarks'), icon: Bookmark01Icon, path: communityBookmarksPath() },
  ];

  if (isLoggedIn) {
    items.push({
      key: 'profile',
      label: t('community.nav.profile'),
      icon: UserIcon,
      path: communityProfilePath(userHandle),
    });
  }

  if (canModerate) {
    items.push({
      key: 'moderation',
      label: t('community.nav.moderation'),
      icon: Shield01Icon,
      path: '/manager/community',
    });
  }

  return (
    <nav
      className="flex h-full w-full flex-col justify-between py-3 pe-2 overflow-y-auto overflow-x-hidden"
      aria-label={t('community.title')}
    >
      {/* Top action and navigation links */}
      <div className="flex flex-col gap-1 w-full">
        {/* Back to site / logo header */}
        <button
          type="button"
          aria-label={t('community.nav.backToSite')}
          title={t('community.nav.backToSite')}
          className="group flex size-12 items-center justify-center rounded-full text-[#171717] transition-colors hover:bg-[#F5F5F5] xl:size-auto xl:w-full xl:justify-start xl:gap-4 xl:px-4 xl:py-3 mb-1"
          onClick={onLeave}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-6 shrink-0 rtl:rotate-180" />
          <span className="hidden text-base font-medium xl:inline">{t('community.nav.backToSite')}</span>
        </button>

        {/* Primary nav buttons */}
        {items.map((item) => {
          const isActive = item.key === section
            || (item.key === 'feed' && section === 'feed')
            || (item.key === 'search' && (section === 'search' || section === 'hashtag'))
            || (item.key === 'profile' && (section === 'profile' || section === 'connections'));

          return (
            <button
              key={item.key}
              type="button"
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'group flex size-12 items-center justify-center rounded-full transition-colors hover:bg-[#F5F5F5] xl:size-auto xl:w-full xl:justify-start xl:gap-4 xl:px-4 xl:py-3',
                isActive ? 'font-bold text-[#171717]' : 'font-normal text-[#171717]',
              )}
              onClick={() => {
                if (item.key === 'moderation') {
                  onOpenModeration();
                  return;
                }
                if (!isLoggedIn && (item.key === 'notifications' || item.key === 'bookmarks' || item.key === 'profile')) {
                  requireAuth();
                  return;
                }
                navigate(item.path);
              }}
            >
              <span className="relative flex items-center justify-center">
                <HugeiconsIcon
                  icon={item.icon}
                  className="size-7 shrink-0 text-[#171717]"
                  strokeWidth={isActive ? 2.5 : 1.75}
                />
                {item.badge && item.badge > 0 ? (
                  <span className="absolute -top-1 -end-1.5 min-w-[18px] h-[18px] rounded-full bg-[#D93A3A] px-1 text-center text-[10px] font-bold leading-[18px] text-white">
                    {item.badge > 99 ? '99+' : formatNumber(item.badge)}
                  </span>
                ) : null}
              </span>
              <span className="hidden text-[19px] xl:inline leading-none">{item.label}</span>
            </button>
          );
        })}

        {/* Post button */}
        <div className="mt-4 w-full">
          {/* Collapsed circle button on lg */}
          <button
            type="button"
            aria-label={t('community.composer.post')}
            title={t('community.composer.post')}
            className="flex size-12 items-center justify-center rounded-full bg-[#D93A3A] text-white shadow-sm transition-all hover:bg-[#C13232] active:scale-[0.98] xl:hidden"
            onClick={() => {
              if (!isLoggedIn) {
                requireAuth();
                return;
              }
              onCompose();
            }}
          >
            <HugeiconsIcon icon={PencilEdit01Icon} className="size-5" />
          </button>

          {/* Full-width pill button on xl */}
          <Button
            type="button"
            className="hidden w-full rounded-full bg-[#D93A3A] py-6 text-[17px] font-bold text-white shadow-sm transition-all hover:bg-[#C13232] active:scale-[0.98] xl:flex justify-center"
            onClick={() => {
              if (!isLoggedIn) {
                requireAuth();
                return;
              }
              onCompose();
            }}
          >
            {t('community.composer.post')}
          </Button>
        </div>
      </div>

      {/* Bottom user profile card pinned to bottom of the screen */}
      <div className="mt-auto pt-4 pb-1 w-full">
        {isLoggedIn ? (
          <DropdownMenu dir={dir}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={userDisplayName || userHandle}
                className={cn(
                  'group flex items-center gap-3 rounded-full transition-colors hover:bg-[#F5F5F5] outline-none focus-visible:ring-2 focus-visible:ring-[#D93A3A]',
                  'size-12 p-1 justify-center xl:size-auto xl:w-full xl:justify-start xl:p-2.5',
                )}
              >
                <CommunityAvatar
                  handle={userHandle}
                  displayName={userDisplayName}
                  avatarUrl={userAvatarUrl}
                  size="md"
                />
                <div className="hidden min-w-0 flex-1 flex-col text-start leading-tight xl:flex">
                  <span className="truncate text-[15px] font-bold text-[#171717]">
                    {userDisplayName}
                  </span>
                  <span className="truncate text-[14px] text-[#737373]">
                    @{userHandle}
                  </span>
                </div>
                <HugeiconsIcon
                  icon={MoreHorizontalIcon}
                  className="hidden size-5 shrink-0 text-[#171717] ms-auto xl:block"
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align={isRTL ? 'end' : 'start'}
              side="top"
              sideOffset={12}
              className="w-64 rounded-2xl border border-[#E5E5E5] bg-white p-2 shadow-xl"
            >
              <DropdownMenuItem
                className="flex items-center gap-3 rounded-xl p-2.5 cursor-pointer hover:bg-[#F5F5F5] focus:bg-[#F5F5F5]"
                onSelect={() => navigate(communityProfilePath(userHandle))}
              >
                <CommunityAvatar
                  handle={userHandle}
                  displayName={userDisplayName}
                  avatarUrl={userAvatarUrl}
                  size="sm"
                />
                <div className="flex min-w-0 flex-1 flex-col text-start leading-tight">
                  <span className="truncate text-sm font-bold text-[#171717]">
                    {userDisplayName}
                  </span>
                  <span className="truncate text-xs text-[#737373]">
                    @{userHandle}
                  </span>
                </div>
              </DropdownMenuItem>

              <DropdownMenuSeparator className="my-1 bg-[#E5E5E5]" />

              <DropdownMenuItem
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-[#171717] cursor-pointer hover:bg-[#F5F5F5] focus:bg-[#F5F5F5]"
                onSelect={() => navigate(communityProfilePath(userHandle))}
              >
                <HugeiconsIcon icon={UserIcon} className="size-4 text-[#737373]" />
                <span>{t('community.nav.profile')}</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-[#171717] cursor-pointer hover:bg-[#F5F5F5] focus:bg-[#F5F5F5]"
                onSelect={onLeave}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4 text-[#737373] rtl:rotate-180" />
                <span>{t('community.nav.backToSite')}</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator className="my-1 bg-[#E5E5E5]" />

              <DropdownMenuItem
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-[#D93A3A] cursor-pointer hover:bg-[#FEF2F2] focus:bg-[#FEF2F2] focus:text-[#D93A3A]"
                onSelect={logout}
              >
                <HugeiconsIcon icon={Logout01Icon} className="size-4 text-[#D93A3A]" />
                <span>{t('nav.signOut')} @{userHandle}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div>
            <button
              type="button"
              aria-label={t('community.signIn.action')}
              className="flex size-12 items-center justify-center rounded-full bg-[#171717] text-white hover:bg-neutral-800 xl:hidden"
              onClick={requireAuth}
            >
              <HugeiconsIcon icon={UserIcon} className="size-5" />
            </button>
            <Button
              type="button"
              variant="outline"
              className="hidden w-full rounded-full border-[#E5E5E5] font-bold text-[#171717] hover:bg-[#F5F5F5] xl:flex py-5 justify-center"
              onClick={requireAuth}
            >
              {t('community.signIn.action')}
            </Button>
          </div>
        )}
      </div>
    </nav>
  );
}
