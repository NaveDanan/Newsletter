import { useEffect, useState } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
import { useAuth } from '@/contexts/AuthContext';
import { browserNotificationsEnabled, browserNotificationsSupported, enableBrowserNotifications, disableBrowserNotifications, syncBrowserNotificationOwner } from '@/lib/browser-notifications';
import { notificationsChanged } from '@/lib/pocketbase/notifications';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchNotificationPreferences, saveNotificationPreferences, NOTIFICATION_PREFERENCE_KEYS, type NotificationPreferenceKey, type NotificationPreferences as Preferences } from '@/lib/pocketbase/notifications';

export function NotificationPreferences() {
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [browserBusy, setBrowserBusy] = useState(false);
  const [browserEnabled, setBrowserEnabled] = useState(() => Boolean(user && browserNotificationsEnabled(user.id)));
  const [browserError, setBrowserError] = useState(false);
  useEffect(() => {
    let active = true;
    fetchNotificationPreferences().then((value) => { if (active) { setPreferences(value); setError(false); } }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [attempt]);
  const save = async (key: NotificationPreferenceKey, checked: boolean) => {
    if (saving) return;
    setSaving(true); setSaved(false); setError(false);
    try {
      if (key === 'background' && checked && browserEnabled && user) await enableBrowserNotifications(user.id, locale, true);
      const next = await saveNotificationPreferences({ [key]: checked });
      setPreferences(next); setSaved(true);
      if (user) await syncBrowserNotificationOwner(user.id, next);
      notificationsChanged();
    }
    catch { setError(true); }
    finally { setSaving(false); }
  };
  const toggleBrowser = async () => {
    if (!user || !preferences || browserBusy) return;
    setBrowserBusy(true); setBrowserError(false);
    try {
      if (browserEnabled) await disableBrowserNotifications();
      else await enableBrowserNotifications(user.id, locale, preferences.background);
      setBrowserEnabled(browserNotificationsEnabled(user.id));
      await syncBrowserNotificationOwner(user.id, preferences);
      notificationsChanged();
    } catch { setBrowserError(true); }
    finally { setBrowserBusy(false); }
  };
  return (
    <Card id="notification-preferences" className="border-[#E5E5E5] bg-white">
      <CardHeader>
        <CardTitle className="text-base text-[#171717]">{t('notifications.settings.title')}</CardTitle>
        <CardDescription className="text-[#737373]">{t('notifications.settings.hint')}</CardDescription>
      </CardHeader>
      <CardContent>
        {!preferences && !error ? <Skeleton className="h-32 w-full" /> : null}
        {preferences ? (
          <div className="divide-y divide-[#E5E5E5]">
            {(['enabled', ...NOTIFICATION_PREFERENCE_KEYS, 'browser', 'background'] as const).map((key) => (
              <div key={key} className="flex items-center justify-between gap-5 py-4 first:pt-0">
                <div className="min-w-0">
                  <label htmlFor={`notify-${key}`} className="cursor-pointer text-sm font-medium text-[#171717]">{t(`notifications.settings.${key}`)}</label>
                  <p id={`notify-${key}-hint`} className="mt-1 text-sm text-[#737373]">{t(`notifications.settings.${key}Hint`)}</p>
                </div>
                <Switch id={`notify-${key}`} aria-describedby={`notify-${key}-hint`} checked={preferences[key]} disabled={saving || browserBusy || (key !== 'enabled' && !preferences.enabled) || (key === 'background' && !preferences.browser)} onCheckedChange={(checked) => void save(key, checked)} className="data-[state=checked]:bg-[#D93A3A] focus-visible:ring-[#D93A3A]/50" />
              </div>
            ))}
          </div>
        ) : null}
        {preferences ? <div className="space-y-2 border-t border-[#E5E5E5] py-4">
          <p className="text-sm text-[#737373]">{!browserNotificationsSupported() ? t('notifications.browser.unsupported') : browserEnabled ? t('notifications.browser.enabled') : t('notifications.browser.hint')}</p>
          <Button variant="outline" size="sm" disabled={browserBusy || saving || !browserNotificationsSupported() || !preferences.enabled || !preferences.browser} onClick={() => void toggleBrowser()}>{browserBusy ? t('notifications.browser.waiting') : browserEnabled ? t('notifications.browser.disable') : t('notifications.browser.enable')}</Button>
          {browserError ? <p role="alert" className="text-sm text-[#B91C1C]">{typeof Notification !== 'undefined' && Notification.permission === 'denied' ? t('notifications.browser.denied') : t('notifications.browser.failed')}</p> : null}
        </div> : null}
        <div aria-live="polite" className="mt-2 min-h-5 text-sm text-[#737373]">
          {error ? <div role="alert" className="flex flex-wrap items-center gap-2 text-[#B91C1C]">{t('notifications.settings.failed')}{!preferences ? <Button variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>{t('notifications.retry')}</Button> : null}</div> : saving ? t('profile.saving') : saved ? t('profile.saved') : null}
        </div>
        <a href="/community/notifications" className="mt-3 inline-block text-sm font-medium text-[#D93A3A] underline underline-offset-4 focus-visible:outline focus-visible:outline-2">{t('notifications.open')}</a>
      </CardContent>
    </Card>
  );
}
