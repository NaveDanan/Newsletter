import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchNotificationPreview, peekNotificationPreview } from '@/lib/pocketbase/notification-preview';
import { markCommunityNotificationsRead } from '@/lib/pocketbase/community';
import { readScope } from '@/lib/pocketbase/read-cache';
import { notificationsChanged } from '@/lib/pocketbase/notifications';
import { groupNotifications, type NotificationGroup } from '@/lib/notification-preview';

export function useNotificationPreview() {
  const scope = readScope();
  const [state, setState] = useState(() => ({ scope, page: peekNotificationPreview(), error: false, loading: true }));
  const request = useRef(0);
  const marked = useRef(new Set<string>());
  const refresh = useCallback(async () => {
    const id = ++request.current;
    try {
      const page = await fetchNotificationPreview(true);
      if (id !== request.current || scope !== readScope()) return;
      setState({ scope, page: { ...page, items: page.items.map(item => marked.current.has(item.id) ? { ...item, isRead: true } : item) }, error: false, loading: false });
    } catch (error) {
      const denied = error && typeof error === 'object' && 'status' in error && [401, 403, 404].includes(Number(error.status));
      if (id === request.current && scope === readScope()) setState(current => ({ ...current, page: denied ? undefined : current.page, error: true, loading: false }));
    }
  }, [scope]);

  useEffect(() => {
    const generation = request;
    void refresh();
    const update = () => { if (!document.hidden) void refresh(); };
    window.addEventListener('notifications:changed', update);
    window.addEventListener('focus', update);
    return () => { generation.current++; window.removeEventListener('notifications:changed', update); window.removeEventListener('focus', update); };
  }, [refresh]);

  const markRead = async (group: NotificationGroup) => {
    const ids = group.unreadIds;
    if (!ids.length || scope !== readScope()) return;
    ids.forEach(id => marked.current.add(id));
    setState(current => ({ ...current, page: current.page && { ...current.page, items: current.page.items.map(item => marked.current.has(item.id) ? { ...item, isRead: true } : item) } }));
    try {
      for (let offset = 0; offset < ids.length; offset += 200) {
        if (scope !== readScope()) return;
        await markCommunityNotificationsRead(ids.slice(offset, offset + 200));
      }
      if (scope === readScope()) notificationsChanged();
    } catch {
      ids.forEach(id => marked.current.delete(id));
      if (scope === readScope()) { await refresh(); setState(current => ({ ...current, error: true })); }
    }
  };
  const page = state.scope === scope ? state.page : undefined;
  return { groups: groupNotifications(page?.items ?? []), loading: state.loading && !page, error: state.error, refresh, markRead };
}
