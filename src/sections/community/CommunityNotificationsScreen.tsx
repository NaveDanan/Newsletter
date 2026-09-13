import { HugeiconsIcon } from '@hugeicons/react';
import {
  Bookmark01Icon,
  Comment01Icon,
  FavouriteIcon,
  QuoteUpIcon,
  RepeatIcon,
  UserAdd01Icon,
  Calendar03Icon,
  News01Icon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocale } from '@/contexts/LocaleContext';
import { useCommunityNotifications } from '@/hooks/useCommunityNotifications';
import { cn } from '@/lib/utils';
import { CommunityAvatar } from './CommunityAvatar';
import { useCommunity } from './CommunityContext';
import type { CommunityNotification, CommunityNotificationKind } from '@/types/community';

interface CommunityNotificationsScreenProps {
  onUnreadChange: (count: number) => void;
}

const ICON: Record<CommunityNotificationKind, typeof FavouriteIcon> = {
  like: FavouriteIcon,
  reply: Comment01Icon,
  repost: RepeatIcon,
  quote: QuoteUpIcon,
  follow: UserAdd01Icon,
  mention: Bookmark01Icon,
  comment: Comment01Icon,
  following_post: UserAdd01Icon,
  event: Calendar03Icon,
  newsletter: News01Icon,
};

const COLOR: Record<CommunityNotificationKind, string> = {
  like: 'text-[#D93A3A]',
  reply: 'text-[#1D9BF0]',
  repost: 'text-[#00BA7C]',
  quote: 'text-[#00BA7C]',
  follow: 'text-[#1D9BF0]',
  mention: 'text-[#D93A3A]',
  comment: 'text-[#D93A3A]',
  following_post: 'text-[#D93A3A]',
  event: 'text-[#D93A3A]',
  newsletter: 'text-[#D93A3A]',
};

export function CommunityNotificationsScreen({ onUnreadChange }: CommunityNotificationsScreenProps) {
  const { t, formatRelativeTime } = useLocale();
  const { openPost, openProfile } = useCommunity();
  const feed = useCommunityNotifications({ enabled: true, onUnreadChange });

  const open = (notification: CommunityNotification) => {
    void feed.markRead(notification.id);
    if (notification.targetPath && /^\/(article\/|community\/post\/)/.test(notification.targetPath)) {
      window.history.pushState({}, '', notification.targetPath);
      window.dispatchEvent(new Event('app:navigate'));
      return;
    }
    if (notification.kind === 'follow' || !notification.postId) {
      openProfile(notification.actorHandle);
      return;
    }
    openPost(notification.postId);
  };

  return (
    <div>
      <div className="sticky top-[104px] z-10 flex items-center justify-between gap-4 border-b border-[#E5E5E5] bg-white/85 px-4 py-3 backdrop-blur">
        <h1 className="text-xl font-bold text-[#171717]">{t('community.notifications.title')}</h1>
        <div className="flex flex-wrap items-center justify-end gap-2">
        <a href="/profile#notification-preferences" className="text-sm text-[#737373] underline underline-offset-4 hover:text-[#D93A3A]">{t('notifications.settings.link')}</a>
        {feed.unreadCount > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => void feed.markAllRead()}>
            {t('community.notifications.markAllRead')}
          </Button>
        ) : null}
        </div>
      </div>

      {feed.isLoading && feed.notifications.length === 0 ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : null}

      {feed.error && feed.notifications.length === 0 ? (
        <div role="alert" className="space-y-3 px-6 py-12 text-center text-sm text-[#737373]"><p>{t('community.notifications.failed')}</p><Button variant="outline" onClick={() => void feed.refresh()}>{t('notifications.retry')}</Button></div>
      ) : null}
      {feed.error && feed.notifications.length > 0 ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E5E5] p-4 text-sm text-[#B91C1C]">
          <p>{t('notifications.updateFailed')}</p>
          <Button variant="outline" size="sm" onClick={() => void feed.refresh()}>{t('notifications.retry')}</Button>
        </div>
      ) : null}

      {!feed.isLoading && !feed.error && feed.notifications.length === 0 ? (
        <p className="px-6 py-16 text-center text-[15px] text-[#737373]">{t('community.notifications.empty')}</p>
      ) : null}

      <ul>
        {feed.notifications.map((notification) => (
          <li key={notification.id}>
            <button
              type="button"
              className={cn(
                'flex w-full items-start gap-3 border-b border-[#E5E5E5] px-4 py-4 text-start transition-colors hover:bg-[#FAFAFA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D93A3A]',
                notification.isRead ? 'bg-white' : 'bg-[#D93A3A]/5',
              )}
              onClick={() => open(notification)}
            >
              {!notification.isRead ? <span className="sr-only">{t('notifications.unread')}. </span> : null}
              <HugeiconsIcon
                icon={ICON[notification.kind]}
                className={cn('mt-1 size-5 shrink-0', COLOR[notification.kind])}
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {notification.actorId ? <CommunityAvatar
                    handle={notification.actorHandle}
                    displayName={notification.actorName}
                    avatarUrl={notification.actorAvatarUrl}
                    size="sm"
                  /> : null}
                  <span className="text-[15px] text-[#171717]">
                    {t('community.notifications.' + notification.kind, {
                      name: notification.actorName || notification.actorHandle,
                    })}
                  </span>
                </div>

                {notification.preview ? (
                  <p className="mt-1 line-clamp-2 text-sm text-[#737373]">{notification.preview}</p>
                ) : null}

                <time className="mt-1 block text-xs text-[#737373]" dateTime={notification.createdAt}>
                  {formatRelativeTime(notification.createdAt)}
                </time>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {feed.hasMore ? (
        <div className="flex justify-center py-6">
          <Button variant="outline" size="sm" disabled={feed.isLoadingMore} onClick={feed.loadMore}>
            {feed.isLoadingMore ? t('community.feed.loadingMore') : t('community.feed.loadMore')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
