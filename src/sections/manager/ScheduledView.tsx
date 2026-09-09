import { HugeiconsIcon } from '@hugeicons/react';
import {
  Calendar01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  FileAttachmentIcon,
  Loading02Icon,
  Mail01Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { useLocale } from '@/contexts/LocaleContext';
import {
  fetchNewsletterDigestSchedule,
  runNewsletterDigestNow,
  updateNewsletterDigestSchedule,
  type NewsletterDigestSchedule,
} from '@/lib/pocketbase/scheduled';
import type { UserRole } from '@/lib/pocketbase/client';

interface ScheduledViewProps {
  currentUserRole: UserRole | null;
}

type IntervalUnit = 'hours' | 'days' | 'weeks';

function formatDateTime(value: string, locale: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getIntervalUnit(minutes: number): IntervalUnit {
  if (minutes % 10080 === 0) return 'weeks';
  if (minutes % 1440 === 0) return 'days';
  return 'hours';
}

function getIntervalValue(minutes: number, unit: IntervalUnit): number {
  if (unit === 'weeks') return Math.max(1, Math.round(minutes / 10080));
  if (unit === 'days') return Math.max(1, Math.round(minutes / 1440));
  return Math.max(1, Math.round(minutes / 60));
}

function toMinutes(value: number, unit: IntervalUnit): number {
  if (unit === 'weeks') return value * 10080;
  if (unit === 'days') return value * 1440;
  return value * 60;
}

function summarizeResult(schedule: NewsletterDigestSchedule | null, t: (key: string, params?: Record<string, string | number>) => string): string {
  const result = schedule?.lastResult;
  if (!result || Object.keys(result).length === 0) return '-';
  if (result.status === 'error') return result.message || schedule?.lastError || '-';
  if (result.reason === 'no_pending_newsletters') return t('scheduled.lastResultNoPending');

  const newsletterCount = result.newsletterCount ?? 0;
  const recipientCount = result.recipientCount ?? result.sentCount ?? 0;
  return t('scheduled.lastResultSent', {
    newsletters: newsletterCount,
    recipients: recipientCount,
  });
}

export function ScheduledView({ currentUserRole }: ScheduledViewProps) {
  const { formatNumber, locale, t } = useLocale();
  const [schedule, setSchedule] = useState<NewsletterDigestSchedule | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>('weeks');
  const [intervalValue, setIntervalValue] = useState(1);
  const [maxNewsletters, setMaxNewsletters] = useState(4);

  const intervalMinutes = useMemo(
    () => toMinutes(intervalValue, intervalUnit),
    [intervalUnit, intervalValue],
  );

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    fetchNewsletterDigestSchedule()
      .then((data) => {
        if (cancelled) return;
        setSchedule(data);
        const unit = getIntervalUnit(data.intervalMinutes);
        setIntervalUnit(unit);
        setIntervalValue(getIntervalValue(data.intervalMinutes, unit));
        setMaxNewsletters(data.maxNewsletters);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : t('scheduled.loadFailed');
        toast.error(message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  if (currentUserRole !== 'admin') {
    return (
      <div className="rounded-xl border border-[#E5E5E5] bg-white px-5 py-6 text-sm text-[#737373]">
        {t('scheduled.adminOnly')}
      </div>
    );
  }

  const handleToggleEnabled = async (enabled: boolean) => {
    if (!schedule || isSaving) return;

    setIsSaving(true);
    try {
      const updated = await updateNewsletterDigestSchedule({ enabled });
      setSchedule(updated);
      toast.success(enabled ? t('scheduled.enabled') : t('scheduled.disabled'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('scheduled.saveFailed');
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveInterval = async () => {
    if (!schedule || isSaving) return;

    setIsSaving(true);
    try {
      const updated = await updateNewsletterDigestSchedule({ intervalMinutes });
      setSchedule(updated);
      toast.success(t('scheduled.saved'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('scheduled.saveFailed');
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveMaxNewsletters = async () => {
    if (!schedule || isSaving) return;

    const nextMax = Math.min(50, Math.max(1, Math.floor(maxNewsletters || 1)));
    setIsSaving(true);
    try {
      const updated = await updateNewsletterDigestSchedule({ maxNewsletters: nextMax });
      setSchedule(updated);
      setMaxNewsletters(updated.maxNewsletters);
      toast.success(t('scheduled.countSaved'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('scheduled.saveFailed');
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRunNow = async () => {
    if (isRunning) return;

    setIsRunning(true);
    try {
      const updated = await runNewsletterDigestNow();
      setSchedule(updated);
      const result = updated.lastResult;
      if (result.reason === 'no_pending_newsletters') {
        toast.success(t('scheduled.runNoPending'));
      } else {
        toast.success(t('scheduled.runComplete', {
          newsletters: result.newsletterCount ?? 0,
          recipients: result.recipientCount ?? result.sentCount ?? 0,
        }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t('scheduled.runFailed');
      toast.error(message);
    } finally {
      setIsRunning(false);
    }
  };

  if (isLoading || !schedule) {
    return (
      <div className="rounded-xl border border-[#E5E5E5] bg-white px-5 py-10 text-sm text-[#737373]">
        {t('scheduled.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#171717]">{t('scheduled.title')}</h1>
          <p className="mt-1 text-sm text-[#737373]">{t('scheduled.description')}</p>
        </div>
        <button
          type="button"
          onClick={handleRunNow}
          disabled={isRunning}
          className="btn-primary flex items-center gap-2 self-start disabled:cursor-wait disabled:opacity-60"
        >
          <HugeiconsIcon icon={isRunning ? Loading02Icon : Mail01Icon} className={isRunning ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          {t('scheduled.runNow')}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <div className="dashboard-card">
          <p className="mb-1 flex items-center gap-2 text-sm text-[#737373]">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="h-4 w-4" />
            {t('scheduled.status')}
          </p>
          <p className={schedule.enabled ? 'text-2xl font-bold text-green-600' : 'text-2xl font-bold text-[#A3A3A3]'}>
            {schedule.enabled ? t('scheduled.on') : t('scheduled.off')}
          </p>
        </div>
        <div className="dashboard-card">
          <p className="mb-1 flex items-center gap-2 text-sm text-[#737373]">
            <HugeiconsIcon icon={FileAttachmentIcon} className="h-4 w-4" />
            {t('scheduled.pending')}
          </p>
          <p className="text-2xl font-bold text-[#171717]">{formatNumber(schedule.pendingNewsletterCount)}</p>
        </div>
        <div className="dashboard-card">
          <p className="mb-1 flex items-center gap-2 text-sm text-[#737373]">
            <HugeiconsIcon icon={Mail01Icon} className="h-4 w-4" />
            {t('scheduled.toSend')}
          </p>
          <p className="text-2xl font-bold text-[#171717]">{formatNumber(schedule.scheduledNewsletterCount)}</p>
        </div>
        <div className="dashboard-card">
          <p className="mb-1 flex items-center gap-2 text-sm text-[#737373]">
            <HugeiconsIcon icon={UserGroupIcon} className="h-4 w-4" />
            {t('scheduled.subscribers')}
          </p>
          <p className="text-2xl font-bold text-[#171717]">{formatNumber(schedule.activeSubscriberCount)}</p>
        </div>
        <div className="dashboard-card">
          <p className="mb-1 flex items-center gap-2 text-sm text-[#737373]">
            <HugeiconsIcon icon={Clock01Icon} className="h-4 w-4" />
            {t('scheduled.interval')}
          </p>
          <p className="text-2xl font-bold text-[#171717]">{formatNumber(schedule.intervalMinutes / 60)}h</p>
        </div>
      </div>

      <section className="rounded-xl border border-[#E5E5E5] bg-white p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#171717]">{t('scheduled.controls')}</h2>
            <p className="mt-1 text-sm text-[#737373]">{t('scheduled.controlsDescription')}</p>
          </div>
          <label className="flex items-center gap-3 text-sm font-medium text-[#171717]">
            <Switch
              checked={schedule.enabled}
              disabled={isSaving}
              onCheckedChange={handleToggleEnabled}
              className="data-[state=checked]:bg-[#D93A3A]"
            />
            {schedule.enabled ? t('scheduled.enabledLabel') : t('scheduled.disabledLabel')}
          </label>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-[#171717]">{t('scheduled.interval')}</label>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,140px)_minmax(0,180px)_auto]">
              <input
                type="number"
                min={1}
                step={1}
                value={intervalValue}
                onChange={(event) => setIntervalValue(Math.max(1, Number(event.target.value) || 1))}
                className="w-full"
              />
              <select
                value={intervalUnit}
                onChange={(event) => setIntervalUnit(event.target.value as IntervalUnit)}
                className="w-full rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#171717]"
              >
                <option value="hours">{t('scheduled.hours')}</option>
                <option value="days">{t('scheduled.days')}</option>
                <option value="weeks">{t('scheduled.weeks')}</option>
              </select>
              <button
                type="button"
                onClick={handleSaveInterval}
                disabled={isSaving}
                className="btn-secondary disabled:cursor-wait disabled:opacity-60"
              >
                {t('scheduled.saveInterval')}
              </button>
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-[#171717]">{t('scheduled.maxNewsletters')}</label>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,180px)_auto]">
              <input
                type="number"
                min={1}
                max={50}
                step={1}
                value={maxNewsletters}
                onChange={(event) => setMaxNewsletters(Math.min(50, Math.max(1, Number(event.target.value) || 1)))}
                className="w-full"
              />
              <button
                type="button"
                onClick={handleSaveMaxNewsletters}
                disabled={isSaving}
                className="btn-secondary disabled:cursor-wait disabled:opacity-60"
              >
                {t('scheduled.saveCount')}
              </button>
            </div>
            <p className="mt-2 text-xs text-[#737373]">{t('scheduled.maxNewslettersHint')}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <section className="rounded-xl border border-[#E5E5E5] bg-white">
          <div className="border-b border-[#E5E5E5] px-5 py-4">
            <h2 className="text-lg font-semibold text-[#171717]">{t('scheduled.pendingTitle')}</h2>
            <p className="text-sm text-[#737373]">{t('scheduled.pendingDescription')}</p>
          </div>
          {schedule.scheduledNewsletters.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-[#737373]">
              {t('scheduled.noPending')}
            </div>
          ) : (
            <div className="divide-y divide-[#E5E5E5]">
              {schedule.scheduledNewsletters.map((newsletter) => (
                <div key={newsletter.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-[#171717]" dir="auto">
                        {newsletter.title || t('manager.untitledDraft')}
                      </h3>
                      <p className="mt-1 line-clamp-1 text-sm text-[#737373]" dir="auto">
                        {newsletter.subtitle || t('manager.noSubtitleYet')}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#F3F4F6] px-2 py-1 text-xs font-medium text-[#737373]">
                      {newsletter.publishedAt || '-'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[#E5E5E5] bg-white p-5">
          <h2 className="text-lg font-semibold text-[#171717]">{t('scheduled.history')}</h2>
          <div className="mt-4 space-y-4 text-sm">
            <div>
              <p className="text-[#737373]">{t('scheduled.lastRun')}</p>
              <p className="font-medium text-[#171717]">{formatDateTime(schedule.lastRunAt, locale)}</p>
            </div>
            <div>
              <p className="text-[#737373]">{t('scheduled.lastSuccess')}</p>
              <p className="font-medium text-[#171717]">{formatDateTime(schedule.lastSuccessAt, locale)}</p>
            </div>
            <div>
              <p className="text-[#737373]">{t('scheduled.lastResult')}</p>
              <p className="font-medium text-[#171717]">{summarizeResult(schedule, t)}</p>
            </div>
            <div>
              <p className="text-[#737373]">{t('scheduled.lastError')}</p>
              <p className={schedule.lastError ? 'break-words font-medium text-red-600' : 'font-medium text-[#171717]'}>
                {schedule.lastError || '-'}
              </p>
            </div>
            <div>
              <p className="text-[#737373]">{t('scheduled.syncedUsers')}</p>
              <p className="font-medium text-[#171717]">{formatNumber(schedule.syncedRegisteredUsers)}</p>
            </div>
          </div>
          <div className="mt-5 rounded-lg bg-[#F9FAFB] px-3 py-3 text-xs text-[#737373]">
            <HugeiconsIcon icon={Calendar01Icon} className="mr-2 inline h-4 w-4 align-text-bottom" />
            {t('scheduled.cronHint')}
          </div>
        </section>
      </div>
    </div>
  );
}
