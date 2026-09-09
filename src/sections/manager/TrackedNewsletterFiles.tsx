import { useEffect, useState, type FormEvent } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import { fetchTrackedNewsletterFiles, removeTrackedNewsletterFile, updateTrackedNewsletterFile, type TrackedNewsletterFile, type TrackedNewsletterFilesPage } from '@/lib/pocketbase/scheduled';

function filename(url: string) {
  try { return decodeURIComponent(new URL(url).pathname.split('/').at(-1) || url); }
  catch { return url; }
}

function TrackedFileRow({ file, disabled, onChanged }: { file: TrackedNewsletterFile; disabled: boolean; onChanged: () => void }) {
  const { t, formatDate } = useLocale();
  const [editing, setEditing] = useState(false);
  const [sourceUrl, setSourceUrl] = useState(file.sourceUrl);
  const [checksum, setChecksum] = useState(file.checksum);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try { await updateTrackedNewsletterFile(file.id, { sourceUrl, checksum }); setEditing(false); onChanged(); }
    catch (error) { setError(error instanceof Error ? error.message : t('scheduled.saveFailed')); }
    finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setError('');
    try { await removeTrackedNewsletterFile(file.id); onChanged(); }
    catch (error) { setError(error instanceof Error ? error.message : t('scheduled.saveFailed')); }
    finally { setBusy(false); }
  }

  return (
    <li className="min-w-0 space-y-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <p className="truncate text-sm font-medium" dir="auto" title={file.sourceUrl}>{filename(file.sourceUrl)}</p>
          <p className="mt-0.5 shrink-0 text-xs tabular-nums text-[#737373] sm:mt-0" title={formatDate(file.importedAt, { dateStyle: 'medium', timeStyle: 'short' })}>{formatDate(file.importedAt, { dateStyle: 'short' })} · {t('scheduled.import.files.articles', { count: file.newsletterIds.length })}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" aria-label={t(editing ? 'scheduled.import.files.cancel' : 'scheduled.import.files.edit')} title={t(editing ? 'scheduled.import.files.cancel' : 'scheduled.import.files.edit')} disabled={disabled || busy} className="flex h-11 w-11 items-center justify-center rounded-lg text-[#525252] hover:bg-[#F5F5F5] disabled:opacity-60 sm:h-9 sm:w-9" onClick={() => { setSourceUrl(file.sourceUrl); setChecksum(file.checksum); setEditing(!editing); setError(''); }}>{editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}</button>
          <button type="button" aria-label={t('scheduled.import.files.remove')} title={t('scheduled.import.files.remove')} disabled={disabled || busy} className="flex h-11 w-11 items-center justify-center rounded-lg text-red-700 hover:bg-red-50 disabled:opacity-60 sm:h-9 sm:w-9" onClick={remove}><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      {editing && (
        <form onSubmit={save} className="space-y-3">
          <fieldset disabled={disabled || busy} className="min-w-0 space-y-3 disabled:opacity-60">
            <legend className="sr-only">{t('scheduled.import.files.edit')}</legend>
            <div>
              <label htmlFor={`tracked-url-${file.id}`} className="mb-1 block text-sm font-medium">{t('scheduled.import.files.url')}</label>
              <input id={`tracked-url-${file.id}`} type="url" required dir="ltr" className="w-full" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} />
            </div>
            <div>
              <label htmlFor={`tracked-checksum-${file.id}`} className="mb-1 block text-sm font-medium">{t('scheduled.import.files.checksum')}</label>
              <input id={`tracked-checksum-${file.id}`} required pattern="[a-fA-F0-9]{40}" maxLength={40} dir="ltr" className="w-full" value={checksum} onChange={(event) => setChecksum(event.target.value)} />
            </div>
            <button type="submit" className="btn-primary">{t(busy ? 'scheduled.import.saving' : 'scheduled.import.files.save')}</button>
          </fieldset>
        </form>
      )}
      {error && <p role="alert" className="break-words text-sm text-red-700">{error}</p>}
    </li>
  );
}

export function TrackedNewsletterFiles({ disabled, revision }: { disabled: boolean; revision: string }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TrackedNewsletterFilesPage | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!open) return;
    let active = true;
    fetchTrackedNewsletterFiles(page).then((result) => {
      if (!active) return;
      if (page > 1 && result.items.length === 0) { setPage(page - 1); return; }
      setData(result); setError('');
    }).catch((error: unknown) => { if (active) setError(error instanceof Error ? error.message : t('scheduled.loadFailed')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, page, reload, revision, t]);

  return (
    <details className="rounded-xl border border-[#E5E5E5] bg-white p-5" onToggle={(event) => { setOpen(event.currentTarget.open); if (event.currentTarget.open && !data) setLoading(true); }}>
      <summary className="min-h-11 cursor-pointer content-center text-base font-semibold">{t('scheduled.import.files.title')}</summary>
      <p className="mt-2 max-w-3xl text-sm text-[#737373]">{t('scheduled.import.files.description')}</p>
      {disabled && <p role="status" className="mt-3 text-sm text-[#737373]">{t('scheduled.import.files.running')}</p>}
      {error && <div role="alert" className="mt-3 space-y-2 text-sm text-red-700"><p>{error}</p><button type="button" className="btn-secondary" onClick={() => { setLoading(true); setReload((value) => value + 1); }}>{t('scheduled.import.retry')}</button></div>}
      {loading && <p role="status" className="mt-3 text-sm text-[#737373]">{t('scheduled.loading')}</p>}
      {data && !loading && <>
        {data.items.length === 0 ? <p className="mt-4 text-sm text-[#737373]">{t('scheduled.import.files.empty')}</p> : <ul className="mt-3 divide-y divide-[#E5E5E5]">{data.items.map((file) => <TrackedFileRow key={`${file.id}:${file.sourceUrl}:${file.checksum}`} file={file} disabled={disabled} onChanged={() => setReload((value) => value + 1)} />)}</ul>}
        {(page > 1 || data.hasMore) && <div className="mt-3 flex gap-3">
          <button type="button" className="btn-secondary disabled:opacity-60" disabled={page === 1} onClick={() => { setLoading(true); setPage(page - 1); }}>{t('scheduled.import.files.previous')}</button>
          <button type="button" className="btn-secondary disabled:opacity-60" disabled={!data.hasMore} onClick={() => { setLoading(true); setPage(page + 1); }}>{t('scheduled.import.files.next')}</button>
        </div>}
      </>}
    </details>
  );
}
