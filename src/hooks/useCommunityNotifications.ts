import { useAuth } from '@/contexts/AuthContext';
import { notificationsChanged } from '@/lib/pocketbase/notifications';
import { useLocale } from '@/contexts/LocaleContext';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchCommunityNotifications,
  getPocketBaseErrorMessage,
  markCommunityNotificationsRead,
} from '@/lib/pocketbase/community';
import type { CommunityNotification, CommunityNotificationKind } from '@/types/community';

export interface UseCommunityNotificationsResult {
  notifications: CommunityNotification[];
  unreadCount: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  refresh: () => Promise<void>;
  markAllRead: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
}

export function useCommunityNotifications(options: {
  enabled: boolean;
  kind?: CommunityNotificationKind;
  onUnreadChange?: (count: number) => void;
}): UseCommunityNotificationsResult {
  const { enabled, kind, onUnreadChange } = options;
  const { user } = useAuth();
  const { t } = useLocale();
  const userId = user?.id;
  const [notifications, setNotifications] = useState<CommunityNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const unreadChangeRef = useRef(onUnreadChange);
  unreadChangeRef.current = onUnreadChange;

  const load = useCallback(async (nextCursor: string, background = false) => {
    if (!userId) return;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    if (nextCursor) {
      setIsLoadingMore(true);
    } else if (!background) {
      setIsLoading(true);
    }

    try {
      const page = await fetchCommunityNotifications({ kind, cursor: nextCursor || undefined });
      if (requestRef.current !== requestId) {
        return;
      }
      setNotifications((current) => {
        if (!nextCursor) {
          if (background) {
            const seen = new Set(page.items.map((item) => item.id));
            return page.items.concat(current.filter((item) => !seen.has(item.id)));
          }
          return page.items;
        }
        const seen = new Set(current.map((item) => item.id));
        return current.concat(page.items.filter((item) => !seen.has(item.id)));
      });
      if (!background) {
        setCursor(page.cursor);
        setHasMore(page.hasMore);
      }
      setUnreadCount(page.unreadCount);
      unreadChangeRef.current?.(page.unreadCount);
      setError(null);
    } catch (caught) {
      if (requestRef.current === requestId) {
        setError(getPocketBaseErrorMessage(caught, 'Loading notifications failed'));
      }
    } finally {
      if (requestRef.current === requestId) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, [kind, userId]);

  useEffect(() => {
    if (!enabled) {
      requestRef.current += 1;
      setNotifications([]);
      setUnreadCount(0);
      setCursor('');
      setHasMore(false);
      setIsLoading(false);
      return;
    }
    void load('');
    return () => { requestRef.current += 1; };
  }, [enabled, load]);

  useEffect(() => {
    if (!enabled) return;
    const refresh = () => { if (!document.hidden && !isLoading && !isLoadingMore) void load('', true); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [enabled, load, isLoading, isLoadingMore]);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoading || isLoadingMore || !cursor) {
      return;
    }
    void load(cursor);
  }, [cursor, hasMore, isLoading, isLoadingMore, load]);

  const markAllRead = useCallback(async () => {
    const hadUnread = unreadCount > 0;
    if (!hadUnread) {
      return;
    }
    setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);
    unreadChangeRef.current?.(0);
    try {
      await markCommunityNotificationsRead([]);
      notificationsChanged();
    } catch {
      await load('');
      setError(t('notifications.updateFailed'));
    }
  }, [load, unreadCount, t]);

  const markRead = useCallback(async (id: string) => {
    const target = notifications.find((item) => item.id === id);
    if (!target || target.isRead) {
      return;
    }
    setNotifications((current) => current.map((item) => (item.id === id ? { ...item, isRead: true } : item)));
    setUnreadCount((current) => {
      const next = Math.max(0, current - 1);
      unreadChangeRef.current?.(next);
      return next;
    });
    try {
      await markCommunityNotificationsRead([id]);
      notificationsChanged();
    } catch {
      await load('');
      setError(t('notifications.updateFailed'));
    }
  }, [load, notifications, t]);

  return {
    notifications,
    unreadCount,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    refresh: () => load(''),
    markAllRead,
    markRead,
  };
}
