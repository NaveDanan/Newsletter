import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocale } from '@/contexts/LocaleContext';
import { useCommunityNotifications } from '@/hooks/useCommunityNotifications';
import { cn } from '@/lib/utils';
import { NotificationVisual } from '@/components/notifications/NotificationVisual';
import { notificationMessageKey } from '@/lib/notification-preview';
import { useCommunity } from './CommunityContext';
import type { CommunityNotification } from '@/types/community';

interface CommunityNotificationsScreenProps {
  onUnreadChange: (count: number) => void;
}

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
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] bg-[var(--bg-app)]/85 px-4 py-3 backdrop-blur-md">
        <h1 className="text-xl font-bold text-[var(--text-primary)]">{t('community.notifications.title')}</h1>
        <div className="flex flex-wrap items-center justify-end gap-2">
        <a href="/profile#notification-preferences" className="text-sm text-[var(--text-secondary)] underline underline-offset-4 hover:text-[var(--primary-accent)]">{t('notifications.settings.link')}</a>
        {feed.unreadCount > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => void feed.markAllRead()} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
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
        <div role="alert" className="space-y-3 px-6 py-12 text-center text-sm text-[var(--text-secondary)]"><p>{t('community.notifications.failed')}</p><Button variant="outline" onClick={() => void feed.refresh()}>{t('notifications.retry')}</Button></div>
      ) : null}
      {feed.error && feed.notifications.length > 0 ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] p-4 text-sm text-[var(--primary-accent)]">
          <p>{t('notifications.updateFailed')}</p>
          <Button variant="outline" size="sm" onClick={() => void feed.refresh()}>{t('notifications.retry')}</Button>
        </div>
      ) : null}

      {!feed.isLoading && !feed.error && feed.notifications.length === 0 ? (
        <p className="px-6 py-16 text-center text-[15px] text-[var(--text-secondary)]">{t('community.notifications.empty')}</p>
      ) : null}

      <ul>
        {feed.notifications.map((notification) => (
          <li key={notification.id}>
            <button
              type="button"
              className={cn(
                'flex w-full items-start gap-3 border-b border-[var(--border-subtle)] px-4 py-4 text-start transition-colors hover:bg-[var(--bg-card-hover)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary-accent)]',
                notification.isRead ? 'bg-[var(--bg-app)]' : 'bg-[var(--primary-accent)]/8',
              )}
              onClick={() => open(notification)}
            >
              {!notification.isRead ? <span className="sr-only">{t('notifications.unread')}. </span> : null}
              <NotificationVisual notification={notification} />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] text-[var(--text-primary)]">
                    {t(notificationMessageKey(notification), {
                      name: notification.actorName || notification.actorHandle,
                    })}
                  </span>
                </div>

                {notification.preview ? (
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">{notification.preview}</p>
                ) : null}

                <time className="mt-1 block text-xs text-[var(--text-secondary)]" dateTime={notification.createdAt}>
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
