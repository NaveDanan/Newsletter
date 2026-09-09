import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { useLocale } from '@/contexts/LocaleContext';
import { fetchNewsletterImportSchedule, updateNewsletterImportSchedule, runNewsletterImportNow, type NewsletterImportSchedule } from '@/lib/pocketbase/scheduled';

export function ScheduledNewsletterUpdates() {
  const { t, formatDate, formatNumber } = useLocale();
  const [schedule, setSchedule] = useState<NewsletterImportSchedule | null>(null);
  const [loadError, setLoadError] = useState('');
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  const [hours, setHours] = useState('24');
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState<'save' | 'run' | null>(null);
  const [reload, setReload] = useState(0);
  const applySettings = useCallback((data: NewsletterImportSchedule) => {
    setSchedule(data);
    setRepositoryUrl(data.repositoryUrl);
    setUsername(data.username);
    setHours(String(data.intervalMinutes / 60));
    setEnabled(data.enabled);
    setToken('');
  }, []);

  useEffect(() => {
    let active = true;
    fetchNewsletterImportSchedule().then((data) => {
      if (active) { applySettings(data); setLoadError(''); }
    }).catch((error: unknown) => {
      if (active) setLoadError(error instanceof Error ? error.message : t('scheduled.loadFailed'));
    });
    return () => { active = false; };
  }, [applySettings, t, reload]);

  useEffect(() => {
    if (!schedule?.isRunning) return;
    const timer = window.setInterval(() => {
      fetchNewsletterImportSchedule().then(setSchedule).catch(() => { /* Keep the last known status. */ });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [schedule?.isRunning]);

  const dirty = Boolean(schedule && (repositoryUrl !== schedule.repositoryUrl || username !== schedule.username || token || Number(hours) * 60 !== schedule.intervalMinutes || enabled !== schedule.enabled));
  const disabled = Boolean(busy || schedule?.isRunning);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('save');
    try {
      applySettings(await updateNewsletterImportSchedule({ repositoryUrl, username, token, intervalMinutes: Number(hours) * 60, enabled }));
      toast.success(t('scheduled.saved'));
    } catch (error) { toast.error(error instanceof Error ? error.message : t('scheduled.saveFailed')); }
    finally { setBusy(null); }
  }

  async function run() {
    setBusy('run');
    try {
      const data = await runNewsletterImportNow();
      setSchedule(data);
      if (data.lastResult.status === 'error' || data.lastResult.status === 'partial') toast.error(t('scheduled.import.reviewErrors'));
      else if (!data.isRunning) toast.success(t('scheduled.import.result', { files: data.lastResult.importedFiles ?? 0, articles: data.lastResult.articleCount ?? 0 }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('scheduled.runFailed'));
      try { setSchedule(await fetchNewsletterImportSchedule()); } catch { /* A disconnected request may still be running. */ }
    } finally { setBusy(null); }
  }

  return (
    <section aria-labelledby="scheduled-updates-title" className="space-y-5">
      <div>
        <h2 id="scheduled-updates-title" className="text-xl font-bold text-[#171717]">{t('scheduled.import.title')}</h2>
        <p className="mt-1 max-w-3xl text-sm text-[#737373]">{t('scheduled.import.description')}</p>
      </div>
      {loadError ? (
        <div role="alert" className="dashboard-card space-y-3 text-sm">
          <p className="text-red-700">{loadError}</p>
          <button type="button" className="btn-secondary" onClick={() => setReload((value) => value + 1)}>{t('scheduled.import.retry')}</button>
        </div>
      ) : !schedule ? <p role="status" className="text-sm text-[#737373]">{t('scheduled.loading')}</p> : (
        <div className="rounded-xl border border-[#E5E5E5] bg-white p-5">
          <form onSubmit={save} className="space-y-5">
            <fieldset disabled={disabled} className="min-w-0 space-y-5 disabled:opacity-60">
              <legend className="sr-only">{t('scheduled.import.connection')}</legend>
              <div>
                <label htmlFor="artifactory-url" className="mb-2 block text-sm font-medium text-[#171717]">{t('scheduled.import.url')}</label>
                <input id="artifactory-url" type="url" required dir="ltr" value={repositoryUrl} onChange={(e) => setRepositoryUrl(e.target.value)} className="w-full" placeholder="https://artifactory.example.com/artifactory/generic-local/newsletters" aria-describedby="artifactory-url-hint" />
                <p id="artifactory-url-hint" className="mt-2 text-xs text-[#737373]">{t('scheduled.import.urlHint')}</p>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label htmlFor="artifactory-username" className="mb-2 block text-sm font-medium text-[#171717]">{t('scheduled.import.username')}</label>
                  <input id="artifactory-username" required autoComplete="off" dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full" />
                </div>
                <div>
                  <label htmlFor="artifactory-token" className="mb-2 block text-sm font-medium text-[#171717]">{t('scheduled.import.token')}</label>
                  <input id="artifactory-token" type="password" required={!schedule.hasToken} autoComplete="new-password" dir="ltr" value={token} onChange={(e) => setToken(e.target.value)} className="w-full" aria-describedby="artifactory-token-hint" />
                  <p id="artifactory-token-hint" className="mt-2 text-xs text-[#737373]">{t(schedule.hasToken ? 'scheduled.import.tokenSaved' : 'scheduled.import.tokenHint')}</p>
                </div>
              </div>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div className="sm:max-w-52">
                  <label htmlFor="import-hours" className="mb-2 block text-sm font-medium text-[#171717]">{t('scheduled.import.interval')}</label>
                  <input id="import-hours" type="number" min="1" max="8760" step="1" required value={hours} onChange={(e) => setHours(e.target.value)} className="w-full" />
                </div>
                <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-[#171717]">
                  <Switch checked={enabled} onCheckedChange={setEnabled} disabled={disabled} className="data-[state=checked]:bg-[#D93A3A]" />
                  {t('scheduled.import.enable')}
                </label>
              </div>
            </fieldset>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={disabled || !dirty} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60">{t(busy === 'save' ? 'scheduled.import.saving' : 'scheduled.import.save')}</button>
              <button type="button" onClick={run} disabled={disabled || dirty || !schedule.hasToken || !schedule.repositoryUrl || !schedule.username} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60">{t(busy === 'run' || schedule.isRunning ? 'scheduled.import.running' : 'scheduled.import.run')}</button>
              {dirty && <p className="text-xs text-[#737373]">{t('scheduled.import.unsaved')}</p>}
            </div>
          </form>
          <div className="mt-6 border-t border-[#E5E5E5] pt-5" aria-live="polite">
            <dl className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div><dt className="text-[#737373]">{t('scheduled.status')}</dt><dd className="mt-1 font-medium">{t(schedule.isRunning ? 'scheduled.import.running' : schedule.enabled ? 'scheduled.on' : 'scheduled.off')}</dd></div>
              <div><dt className="text-[#737373]">{t('scheduled.lastRun')}</dt><dd className="mt-1 font-medium">{schedule.lastRunAt ? formatDate(schedule.lastRunAt, { dateStyle: 'medium', timeStyle: 'short' }) : t('scheduled.import.never')}</dd></div>
              <div><dt className="text-[#737373]">{t('scheduled.lastSuccess')}</dt><dd className="mt-1 font-medium">{schedule.lastSuccessAt ? formatDate(schedule.lastSuccessAt, { dateStyle: 'medium', timeStyle: 'short' }) : t('scheduled.import.never')}</dd></div>
              <div><dt className="text-[#737373]">{t('scheduled.lastResult')}</dt><dd className="mt-1 font-medium">{schedule.lastResult.status ? t('scheduled.import.result', { files: formatNumber(schedule.lastResult.importedFiles ?? 0), articles: formatNumber(schedule.lastResult.articleCount ?? 0) }) : t('scheduled.import.never')}</dd></div>
            </dl>
            {Boolean(schedule.lastResult.skipped) && <p className="mt-3 text-sm text-[#737373]">{t('scheduled.import.skipped', { count: schedule.lastResult.skipped ?? 0 })}</p>}
            {Boolean(schedule.lastResult.deferred) && <p className="mt-3 text-sm text-[#737373]">{t('scheduled.import.deferred', { count: schedule.lastResult.deferred ?? 0 })}</p>}
            {schedule.lastError && <p role="alert" dir="auto" className="mt-3 whitespace-pre-wrap break-words text-sm text-red-700">{schedule.lastError}</p>}
            <p className="mt-4 max-w-3xl text-xs leading-relaxed text-[#737373]">{t('scheduled.import.formatHint')}</p>
          </div>
        </div>
      )}
    </section>
  );
}
