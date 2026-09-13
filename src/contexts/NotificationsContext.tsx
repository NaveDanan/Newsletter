import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { getPocketBase } from '@/lib/pocketbase/client';
import { useLocale } from './LocaleContext';
import type { NotificationPreferences } from '@/lib/pocketbase/notifications';
import { browserNotificationsEnabled, ensureBackgroundNotifications, showBrowserNotification, syncBrowserNotificationOwner, type BrowserNotificationMessage } from '@/lib/browser-notifications';

const NotificationsContext = createContext(0);
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { locale } = useLocale();
  const userId = user?.id;
  const [state, setState] = useState({ userId, count: 0 });
  useEffect(() => {
    if (!userId) return;
    let active = true;
    let pending = false;
    let cursor = '';
    let backgroundReady = false;
    const refresh = async () => {
      if (pending || (document.hidden && !browserNotificationsEnabled(userId))) return;
      pending = true;
      try {
        const openedNotification = new URLSearchParams(window.location.search).get('notification');
        if (openedNotification) {
          await getPocketBase().send('/api/community/notifications/read', { method: 'POST', body: { ids: [openedNotification] }, requestKey: null });
          const url = new URL(window.location.href);
          url.searchParams.delete('notification');
          window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
        }
        const result = await getPocketBase().send<{ unreadCount: number; preferences: NotificationPreferences; cursor: string; items: BrowserNotificationMessage[] }>('/api/notifications/browser', { query: { cursor, locale }, requestKey: null });
        if (!active) return;
        setState({ userId, count: result.unreadCount });
        cursor = result.cursor;
        if (browserNotificationsEnabled(userId) && result.preferences.background && !backgroundReady) {
          try { backgroundReady = await ensureBackgroundNotifications(userId, locale); }
          catch { /* Keep open-site delivery until background registration succeeds. */ }
        } else if (!result.preferences.background) backgroundReady = false;
        await syncBrowserNotificationOwner(userId, result.preferences);
        if (active && browserNotificationsEnabled(userId) && result.preferences.enabled && result.preferences.browser && (!result.preferences.background || !backgroundReady)) {
          for (const item of result.items) await showBrowserNotification(item);
        }
      } catch { /* Keep the last count while offline; retry on focus or the next tick. */ }
      finally { pending = false; }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30000);
    window.addEventListener('focus', refresh);
    window.addEventListener('notifications:changed', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('notifications:changed', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [userId, locale]);
  return <NotificationsContext.Provider value={state.userId === userId ? state.count : 0}>{children}</NotificationsContext.Provider>;
}
// Kept with its small provider so every header shares one poller.
// eslint-disable-next-line react-refresh/only-export-components
export function useNotificationCount() { return useContext(NotificationsContext); }
