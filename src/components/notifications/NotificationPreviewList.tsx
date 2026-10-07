import { type ReactNode } from 'react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useLocale } from '@/contexts/LocaleContext';
import { useNotificationPreview } from '@/hooks/useNotificationPreview';
import { notificationMessageKey, notificationTarget } from '@/lib/notification-preview';
import { preloadRoute } from '@/lib/preload-route';
import { cn } from '@/lib/utils';
import { NotificationVisual } from './NotificationVisual';

export function NotificationPreviewList({ onNavigate, onClose, menu = false }: { onNavigate?: (action: () => void) => void; onClose: () => void; menu?: boolean }) {
  const { t, formatNumber, formatRelativeTime } = useLocale();
  const feed = useNotificationPreview();
  const navigate = (path: string) => {
    // Dismiss the high-z-index preview before an editor presents its save dialog.
    onClose();
    const go = () => { window.history.pushState({}, '', path); window.dispatchEvent(new Event('app:navigate')); };
    if (onNavigate) onNavigate(go); else go();
  };
  const item = (key: string, children: ReactNode) => menu ? <DropdownMenuItem key={key} asChild>{children}</DropdownMenuItem> : <div key={key}>{children}</div>;
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-notification-preview aria-busy={feed.loading}>
      <div className="min-h-0 max-h-[min(65dvh,520px)] overflow-y-auto overscroll-contain">
        {feed.loading ? <div role="status" className="space-y-3 p-4"><span className="sr-only">{t('community.feed.loadingMore')}</span>{[0, 1, 2].map(n => <div key={n} className="h-16 animate-pulse rounded-xl bg-[var(--bg-pill)]" />)}</div> : null}
        {feed.error ? <div role="alert" className="p-4 text-sm text-[var(--text-secondary)]"><p>{t('community.notifications.failed')}</p>{item('retry', <button type="button" className="mt-2 min-h-11 rounded-lg px-3 font-semibold text-[var(--primary-accent)]" onClick={() => void feed.refresh()}>{t('notifications.retry')}</button>)}</div> : null}
        {!feed.loading && !feed.error && !feed.groups.length ? <p className="p-6 text-center text-sm text-[var(--text-secondary)]">{t('community.notifications.empty')}</p> : null}
        {feed.groups.map(group => {
          const notification = group.latest;
          const names = group.actors.slice(0, 2).map(actor => actor.actorName || actor.actorHandle).join(', ');
          const path = notificationTarget(notification);
          const message = group.notifications.length > 1 && notification.kind !== 'newsletter'
            ? t('notifications.preview.grouped', { names: names || t('community.notifications.title'), count: formatNumber(group.notifications.length) })
            : t(notificationMessageKey(notification), { name: notification.actorName || notification.actorHandle });
          return item(group.key, <button
            type="button" data-notification-group={group.key}
            className={cn('flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-3 text-start text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-card-hover)] focus:bg-[var(--bg-card-hover)] focus:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary-accent)]', group.unreadIds.length > 0 && 'bg-[var(--primary-accent)]/8')}
            onPointerEnter={() => preloadRoute(path)} onFocus={() => preloadRoute(path)}
            onClick={() => { void feed.markRead(group); navigate(path); }}
          >
            <NotificationVisual notification={notification} actors={group.actors} />
            <span className="min-w-0 flex-1">
              {group.unreadIds.length ? <span className="sr-only">{t('notifications.unread')}. </span> : null}
              <span className="line-clamp-2 block text-sm font-semibold" dir="auto">{message}</span>
              {notification.preview ? <span className="mt-1 line-clamp-1 block text-xs text-[var(--text-secondary)]" dir="auto">{notification.preview}</span> : null}
              <time dateTime={notification.createdAt} className="mt-1 block text-xs text-[var(--text-muted)]">{formatRelativeTime(notification.createdAt)}</time>
            </span>
            {group.unreadIds.length ? <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-[var(--primary-accent)]" /> : null}
          </button>);
        })}
      </div>
      <div className="mt-1 shrink-0 border-t border-[var(--border-subtle)] pt-1">
        {item('see-more', <button type="button" onPointerEnter={() => preloadRoute('/community/notifications')} onFocus={() => preloadRoute('/community/notifications')} onClick={() => navigate('/community/notifications')} className="flex min-h-11 w-full cursor-pointer items-center justify-center rounded-xl text-sm font-semibold text-[var(--primary-accent)] hover:bg-[var(--bg-pill-hover)] focus:bg-[var(--bg-pill-hover)] focus:text-[var(--primary-accent)]">{t('notifications.preview.seeMore')}</button>)}
      </div>
    </div>
  );
}
