import { HugeiconsIcon } from '@hugeicons/react';
import {
  Bookmark01Icon,
  Home01Icon,
  Notification01Icon,
  PencilEdit01Icon,
  Search01Icon,
  Shield01Icon,
  UserIcon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
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
import { useCommunity } from './CommunityContext';

// The left rail is the primary navigation for the community, inspired by X (Twitter).
// It occupies the entire vertical screen (h-screen / h-[100dvh]) and stays frozen
// in place as the feed scrolls. On lg it renders a compact 88px icon-only column,
// and expands to 275px with labels on xl screens. Under lg, the mobile bar takes over.

interface CommunityLeftRailProps {
  section: CommunitySection;
  unreadCount: number;
  onCompose: () => void;
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
  onOpenModeration,
}: CommunityLeftRailProps) {
  const { t, formatNumber } = useLocale();
  const { isAuthenticated, profile, canModerate, navigate, requireAuth } = useCommunity();
  const { user, isAuthenticated: isAuthAuthenticated } = useAuth();

  const isLoggedIn = isAuthenticated || isAuthAuthenticated || Boolean(user) || Boolean(profile);
  const userHandle = profile?.handle || (user?.name ? user.name.toLowerCase().replace(/\s+/g, '') : (user?.email ? user.email.split('@')[0] : 'user'));
  const profilePath = profile?.handle ? communityProfilePath(profile.handle) : (userHandle ? communityProfilePath(userHandle) : '/community/profile');

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
      path: profilePath,
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
      <div className="flex w-full flex-col gap-2">
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
                'group flex size-12 shrink-0 items-center justify-center rounded-2xl transition-colors hover:bg-[var(--bg-card-hover)] xl:size-auto xl:w-full xl:justify-start xl:gap-4 xl:px-4 xl:py-3',
                isActive ? 'font-bold text-[var(--primary-accent)] bg-[var(--primary-accent)]/10' : 'font-medium text-[var(--text-primary)]',
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
                  className={cn("size-7 shrink-0", isActive ? "text-[var(--primary-accent)]" : "text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]")}
                  strokeWidth={isActive ? 2.5 : 1.75}
                />
                {item.badge && item.badge > 0 ? (
                  <span className="absolute -top-1 -end-1.5 min-w-[18px] h-[18px] rounded-full bg-[var(--primary-accent)] px-1 text-center text-[10px] font-bold leading-[18px] text-[var(--accent-contrast)]">
                    {item.badge > 99 ? '99+' : formatNumber(item.badge)}
                  </span>
                ) : null}
              </span>
              <span className="hidden text-[17px] xl:inline leading-none">{item.label}</span>
            </button>
          );
        })}

        {/* Post button */}
        <div className="w-full shrink-0">
          {/* Collapsed circle button on lg */}
          <button
            type="button"
            aria-label={t('community.composer.post')}
            title={t('community.composer.post')}
            className="flex size-12 items-center justify-center rounded-2xl bg-[var(--primary-accent)] text-[var(--accent-contrast)] shadow-lg transition-all hover:scale-105 active:scale-95 xl:hidden"
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
            className="hidden w-full rounded-full bg-[var(--primary-accent)] py-6 text-[16px] font-bold text-[var(--accent-contrast)] shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] xl:flex justify-center"
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

      {/* Signed-in users get their account menu from the app header instead. */}
      {!isLoggedIn ? (
        <div className="mt-3 w-full shrink-0 pb-1">
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
        </div>
      ) : null}
    </nav>
  );
}
