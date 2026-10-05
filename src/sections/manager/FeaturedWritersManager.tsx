import { useCallback, useEffect, useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Pen01Icon } from '@hugeicons/core-free-icons';
import { toast } from 'sonner';
import { UserAvatarCircle } from '@/components/UserAvatarCircle';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useLocale } from '@/contexts/LocaleContext';
import { getPocketBaseErrorMessage } from '@/lib/pocketbase/community';
import { fetchWriterCandidates, setWriterFeatured } from '@/lib/pocketbase/writers';
import type { WriterCandidate } from '@/types/writer';

/**
 * Admin-only curation of the homepage "Our Writers" row. Every user is listed
 * unticked by default, managers and admins included: a writing role on its own
 * never puts anybody in the row.
 */
export function FeaturedWritersManager() {
  const { t } = useLocale();
  const [candidates, setCandidates] = useState<WriterCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setCandidates(await fetchWriterCandidates());
      setError('');
    } catch (caught) {
      setError(getPocketBaseErrorMessage(caught, t('manager.writers.loadFailed')));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const setFeatured = (candidate: WriterCandidate, featured: boolean) => {
    setCandidates((current) => current.map((item) => (item.id === candidate.id ? { ...item, featured } : item)));
  };

  const toggle = async (candidate: WriterCandidate, featured: boolean) => {
    const name = candidate.name || candidate.email;
    setBusyId(candidate.id);
    setFeatured(candidate, featured);
    try {
      await setWriterFeatured(candidate.id, featured);
      toast.success(t(featured ? 'manager.writers.added' : 'manager.writers.removed', { name }));
    } catch (caught) {
      setFeatured(candidate, !featured);
      toast.error(getPocketBaseErrorMessage(caught, t('manager.writers.updateFailed')));
    } finally {
      setBusyId('');
    }
  };

  const featuredCount = candidates.filter((candidate) => candidate.featured).length;

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return candidates;
    }
    return candidates.filter((candidate) => (
      `${candidate.name} ${candidate.email} ${t(`role.${candidate.role}`)}`.toLowerCase().includes(term)
    ));
  }, [candidates, search, t]);

  return (
    <section className="dashboard-card space-y-4" aria-labelledby="featured-writers-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="featured-writers-title" className="flex items-center gap-2 text-lg font-bold text-[#171717]">
            <HugeiconsIcon icon={Pen01Icon} className="size-5" />
            {t('manager.writers.title')}
          </h2>
          <p className="mt-1 max-w-prose text-sm text-[#737373]">{t('manager.writers.description')}</p>
        </div>
        <span className="rounded-full bg-[#F5F5F5] px-3 py-1 text-xs font-medium text-[#404040]">
          {t('manager.writers.count', { count: featuredCount })}
        </span>
      </header>

      <Input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t('manager.writers.search')}
        aria-label={t('manager.writers.search')}
      />

      {error ? (
        <div className="space-y-3">
          <p className="text-sm text-[#D93A3A]">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            {t('community.feed.retry')}
          </Button>
        </div>
      ) : null}

      {isLoading ? <p className="text-sm text-[#737373]">{t('manager.writers.loading')}</p> : null}

      {!isLoading && !error && visible.length === 0 ? (
        <p className="text-sm text-[#737373]">{t('manager.writers.noMatches')}</p>
      ) : null}

      {!isLoading && !error && visible.length > 0 ? (
        <ul className="max-h-96 space-y-2 overflow-y-auto">
          {visible.map((candidate) => {
            const checkboxId = `featured-writer-${candidate.id}`;
            const name = candidate.name || candidate.email;
            return (
              <li key={candidate.id} className="flex items-center gap-3 rounded-xl border border-[#E5E5E5] px-3 py-2">
                <UserAvatarCircle name={name} email={candidate.email} src={candidate.avatarUrl || null} size={36} />
                <label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer">
                  <span className="block truncate text-sm font-semibold text-[#171717]">{name}</span>
                  <span className="block truncate text-xs text-[#737373]">
                    {t(`role.${candidate.role}`)}
                    {candidate.name && candidate.email ? ` · ${candidate.email}` : ''}
                  </span>
                </label>
                <Checkbox
                  id={checkboxId}
                  checked={candidate.featured}
                  disabled={busyId === candidate.id}
                  aria-label={t('manager.writers.toggle', { name })}
                  onCheckedChange={(checked) => { void toggle(candidate, checked === true); }}
                />
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
