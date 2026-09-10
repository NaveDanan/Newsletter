import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowLeft01Icon,
  Bookmark01Icon,
  Home01Icon,
  Notification01Icon,
  PencilEdit01Icon,
  Search01Icon,
  Shield01Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
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

// The left rail is the primary navigation for the community. It collapses to a
// bottom bar under lg, which is where the mobile layout in CommunityPage takes
// over, so this component only ever renders the wide form.

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
  const { t, formatNumber } = useLocale();
  const { isAuthenticated, profile, canModerate, navigate, requireAuth } = useCommunity();

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

  if (profile) {
    items.push({
      key: 'profile',
      label: t('community.nav.profile'),
      icon: UserGroupIcon,
      path: communityProfilePath(profile.handle),
    });
  }

  return (
    <nav className="sticky top-4 flex h-[calc(100vh-2rem)] flex-col gap-1 pe-2" aria-label={t('community.title')}>
      <button
        type="button"
        className="mb-2 flex items-center gap-2 self-start rounded-full px-3 py-2 text-sm text-[#737373] transition-colors hover:bg-[#F5F5F5] hover:text-[#171717]"
        onClick={onLeave}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4 rtl:rotate-180" />
        {t('community.nav.backToSite')}
      </button>

      {items.map((item) => {
        const isActive = item.key === section
          || (item.key === 'feed' && section === 'feed')
          || (item.key === 'search' && (section === 'search' || section === 'hashtag'))
          || (item.key === 'profile' && (section === 'profile' || section === 'connections'));

        return (
          <button
            key={item.key}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex items-center gap-4 rounded-full px-4 py-3 text-[19px] transition-colors hover:bg-[#F5F5F5]',
              isActive ? 'font-bold text-[#171717]' : 'text-[#404040]',
            )}
            onClick={() => {
              if (!isAuthenticated && (item.key === 'notifications' || item.key === 'bookmarks' || item.key === 'profile')) {
                requireAuth();
                return;
              }
              navigate(item.path);
            }}
          >
            <span className="relative">
              <HugeiconsIcon icon={item.icon} className="size-6" strokeWidth={isActive ? 2 : 1.5} />
              {item.badge && item.badge > 0 ? (
                <span className="absolute -end-1.5 -top-1 min-w-4 rounded-full bg-[#D93A3A] px-1 text-center text-[10px] font-bold leading-4 text-white">
                  {item.badge > 99 ? '99+' : formatNumber(item.badge)}
                </span>
              ) : null}
            </span>
            <span className="hidden xl:inline">{item.label}</span>
          </button>
        );
      })}

      {canModerate ? (
        <button
          type="button"
          className="flex items-center gap-4 rounded-full px-4 py-3 text-[19px] text-[#404040] transition-colors hover:bg-[#F5F5F5]"
          onClick={onOpenModeration}
        >
          <HugeiconsIcon icon={Shield01Icon} className="size-6" strokeWidth={1.5} />
          <span className="hidden xl:inline">{t('community.nav.moderation')}</span>
        </button>
      ) : null}

      <Button
        type="button"
        className="mt-4 rounded-full bg-[#D93A3A] py-6 text-base font-bold text-white hover:bg-[#C13232]"
        onClick={() => {
          if (!isAuthenticated) {
            requireAuth();
            return;
          }
          onCompose();
        }}
      >
        <HugeiconsIcon icon={PencilEdit01Icon} className="size-5 xl:hidden" />
        <span className="hidden xl:inline">{t('community.composer.post')}</span>
      </Button>

      {profile ? (
        <button
          type="button"
          className="mt-auto mb-4 flex items-center gap-3 rounded-full p-2 transition-colors hover:bg-[#F5F5F5]"
          onClick={() => navigate(communityProfilePath(profile.handle))}
        >
          <CommunityAvatar
            handle={profile.handle}
            displayName={profile.displayName}
            avatarUrl={profile.avatarUrl}
          />
          <span className="hidden min-w-0 flex-1 text-start xl:block">
            <span className="block truncate text-sm font-semibold text-[#171717]">
              {profile.displayName || profile.handle}
            </span>
            <span className="block truncate text-sm text-[#737373]">@{profile.handle}</span>
          </span>
        </button>
      ) : null}
    </nav>
  );
}
