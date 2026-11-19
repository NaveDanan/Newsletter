import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { createApiAccessToken, fetchApiAccessTokens, revokeApiAccessToken, type ApiAccessToken, type ApiTokenAccess, type ApiTokenScope } from '@/lib/pocketbase/access-tokens';

const fieldClass = 'h-10 w-full rounded-full border-[var(--border-subtle)] bg-[var(--bg-input)] px-4 text-[var(--text-primary)]';
const buttonClass = 'rounded-full border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--bg-pill-hover)]';

export function ApiTokensSettings({ canCreateGanttToken }: { canCreateGanttToken: boolean }) {
  const { t, formatDate } = useLocale();
  const [tokens, setTokens] = useState<ApiAccessToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<ApiTokenScope>('site');
  const [access, setAccess] = useState<ApiTokenAccess>('read');
  const [expiresInDays, setExpiresInDays] = useState(90);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ token: string; id: string } | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const tokenInputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef(false);

  useEffect(() => {
    activeRef.current = true;
    let active = true;
    void fetchApiAccessTokens().then(items => {
      if (active) { setTokens(items); setError(''); }
    }).catch(() => { if (active) setError('apiTokens.loadFailed'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; activeRef.current = false; };
  }, [attempt]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || loading || issued || !name.trim()) return;
    setBusy(true); setError(''); setNotice(''); setIssued(null);
    try {
      const result = await createApiAccessToken({ name: name.trim(), scope, access, expiresInDays });
      if (!activeRef.current) return;
      setTokens(current => [result.item, ...current]);
      setIssued({ token: result.token, id: result.item.id }); setName('');
    } catch { if (activeRef.current) setError('apiTokens.createFailed'); }
    finally { if (activeRef.current) setBusy(false); }
  };

  const revoke = async (id: string) => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await revokeApiAccessToken(id);
      if (!activeRef.current) return;
      setTokens(current => current.filter(item => item.id !== id));
      setConfirmRevoke(null); setIssued(current => current?.id === id ? null : current); setNotice('apiTokens.revoked');
    } catch { if (activeRef.current) setError('apiTokens.revokeFailed'); }
    finally { if (activeRef.current) setBusy(false); }
  };

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(issued?.token ?? '');
      else {
        tokenInputRef.current?.select();
        if (!document.execCommand('copy')) throw new Error('Manual copy required');
      }
      if (activeRef.current) setNotice('apiTokens.copied');
    } catch {
      if (activeRef.current) { tokenInputRef.current?.select(); setNotice('apiTokens.copyManually'); }
    }
  };

  return (
    <Card className="rounded-3xl border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-[var(--shadow-card)]">
      <CardHeader>
        <CardTitle className="text-base font-bold text-[var(--text-primary)]">{t('apiTokens.title')}</CardTitle>
        <CardDescription className="text-[var(--text-secondary)]">{t('apiTokens.hint')}</CardDescription>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-[var(--primary-accent)]">
          <a href="/docs/site-api.html" target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">{t('apiTokens.siteDocs')}</a>
          {canCreateGanttToken ? <a href="/docs/gantt-api.html" target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">{t('apiTokens.ganttDocs')}</a> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={event => { void create(event); }} className="space-y-3">
          <div className={canCreateGanttToken ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-3 sm:grid-cols-3'}>
            <div className="space-y-2">
              <Label htmlFor="api-token-name" className="text-[var(--text-primary)]">{t('apiTokens.name')}</Label>
              <Input id="api-token-name" value={name} onChange={event => setName(event.target.value)} maxLength={80} required disabled={busy} autoComplete="off" placeholder={t('apiTokens.namePlaceholder')} className={fieldClass} />
            </div>
            {canCreateGanttToken ? (
              <div className="space-y-2">
                <Label htmlFor="api-token-scope" className="text-[var(--text-primary)]">{t('apiTokens.scope')}</Label>
                <Select value={scope} onValueChange={value => setScope(value === 'gantt' ? 'gantt' : 'site')} disabled={busy}>
                  <SelectTrigger id="api-token-scope" className={fieldClass}><SelectValue /></SelectTrigger>
                  <SelectContent className="border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)]">
                    <SelectItem value="site">{t('apiTokens.site')}</SelectItem>
                    <SelectItem value="gantt">{t('apiTokens.gantt')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="api-token-access" className="text-[var(--text-primary)]">{t('apiTokens.access')}</Label>
              <Select value={access} onValueChange={value => setAccess(value === 'read' ? 'read' : 'write')} disabled={busy}>
                <SelectTrigger id="api-token-access" className={fieldClass}><SelectValue /></SelectTrigger>
                <SelectContent className="border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)]">
                  <SelectItem className="focus:bg-[var(--bg-pill-hover)] focus:text-[var(--text-primary)]" value="write">{t('apiTokens.write')}</SelectItem>
                  <SelectItem className="focus:bg-[var(--bg-pill-hover)] focus:text-[var(--text-primary)]" value="read">{t('apiTokens.read')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-token-expiry" className="text-[var(--text-primary)]">{t('apiTokens.expiry')}</Label>
              <Select value={String(expiresInDays)} onValueChange={value => setExpiresInDays(Number(value))} disabled={busy}>
                <SelectTrigger id="api-token-expiry" className={fieldClass}><SelectValue /></SelectTrigger>
                <SelectContent className="border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)]">
                  {[30, 90, 365].map(days => <SelectItem className="focus:bg-[var(--bg-pill-hover)] focus:text-[var(--text-primary)]" key={days} value={String(days)}>{t('apiTokens.days', { days })}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button type="submit" size="sm" className="rounded-full bg-[var(--primary-accent)] text-[var(--accent-contrast)] hover:bg-[var(--primary-accent)]/90" disabled={busy || loading || Boolean(issued) || error === 'apiTokens.loadFailed' || !name.trim() || tokens.length >= 20}>
            {busy ? t('apiTokens.working') : t('apiTokens.create')}
          </Button>
          {tokens.length >= 20 ? <p className="text-sm text-[var(--text-secondary)]">{t('apiTokens.limit')}</p> : null}
        </form>

        {issued ? (
          <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
            <p className="text-sm text-[var(--text-secondary)]">{t('apiTokens.copyHint')}</p>
            <Input ref={tokenInputRef} value={issued.token} readOnly dir="ltr" autoComplete="off" onFocus={event => event.currentTarget.select()} aria-label={t('apiTokens.secret')} className={fieldClass + ' font-mono text-sm'} />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className={buttonClass} onClick={() => { void copy(); }}>{t('apiTokens.copy')}</Button>
              <Button type="button" variant="ghost" size="sm" className={buttonClass} onClick={() => { setIssued(null); setNotice(''); }}>{t('apiTokens.done')}</Button>
            </div>
          </div>
        ) : null}

        {loading ? <Skeleton className="h-16 w-full" /> : tokens.length ? (
          <ul className="divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
            {tokens.map(item => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 space-y-1">
                  <p className="break-words text-sm font-semibold text-[var(--text-primary)]">{item.name}</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    <span dir="ltr" className="font-mono">{item.prefix}…</span>{' · '}
                    {t(item.scope === 'site' ? 'apiTokens.site' : 'apiTokens.gantt')}{' · '}
                    {t(item.access === 'read' ? 'apiTokens.read' : 'apiTokens.write')}{' · '}
                    {t(item.expired ? 'apiTokens.expired' : 'apiTokens.expires', { date: formatDate(item.expiresAt) })}
                  </p>
                </div>
                {confirmRevoke === item.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-[var(--text-secondary)]">{t('apiTokens.revokeConfirm')}</span>
                    <Button type="button" variant="outline" size="sm" className={buttonClass} disabled={busy} onClick={() => { void revoke(item.id); }}>{t('apiTokens.revoke')}</Button>
                    <Button type="button" variant="ghost" size="sm" className={buttonClass} disabled={busy} onClick={() => setConfirmRevoke(null)}>{t('common.cancel')}</Button>
                  </div>
                ) : <Button type="button" variant="ghost" size="sm" className={buttonClass} disabled={busy} onClick={() => setConfirmRevoke(item.id)}>{t('apiTokens.revoke')}</Button>}
              </li>
            ))}
          </ul>
        ) : error !== 'apiTokens.loadFailed' ? <p className="text-sm text-[var(--text-secondary)]">{t('apiTokens.empty')}</p> : null}
        {error ? <p role="alert" className="text-sm text-[var(--text-primary)]">{t(error)}{error === 'apiTokens.loadFailed' ? <Button type="button" variant="ghost" size="sm" className={buttonClass} onClick={() => { setLoading(true); setAttempt(current => current + 1); }}>{t('common.tryAgain')}</Button> : null}</p> : null}
        {notice ? <p role="status" className="text-sm text-[var(--text-secondary)]">{t(notice)}</p> : null}
      </CardContent>
    </Card>
  );
}
