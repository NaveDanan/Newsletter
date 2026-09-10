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

  const load = useCallback(async (nextCursor: string) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    if (nextCursor) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }

    try {
      const page = await fetchCommunityNotifications({ kind, cursor: nextCursor || undefined });
      if (requestRef.current !== requestId) {
        return;
      }
      setNotifications((current) => {
        if (!nextCursor) {
          return page.items;
        }
        const seen = new Set(current.map((item) => item.id));
        return current.concat(page.items.filter((item) => !seen.has(item.id)));
      });
      setCursor(page.cursor);
      setHasMore(page.hasMore);
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
  }, [kind]);

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
  }, [enabled, load]);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoading || isLoadingMore || !cursor) {
      return;
    }
    void load(cursor);
  }, [cursor, hasMore, isLoading, isLoadingMore, load]);

  const markAllRead = useCallback(async () => {
    const hadUnread = notifications.some((item) => !item.isRead);
    if (!hadUnread) {
      return;
    }
    setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);
    unreadChangeRef.current?.(0);
    try {
      await markCommunityNotificationsRead([]);
    } catch {
      await load('');
    }
  }, [load, notifications]);

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
    } catch {
      await load('');
    }
  }, [load, notifications]);

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
