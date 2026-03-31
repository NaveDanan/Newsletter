import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useState } from 'react';
import { LanguageToggleButton } from '@/components/LanguageToggleButton';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';
import { getPocketBase } from '@/lib/pocketbase/client';
import { extractExcerpt, calculateReadTime } from '@/lib/newsletters';
import type { Project } from '@/types/project';
import type { Newsletter } from '@/types/newsletter';

const PROJECTS_LS_KEY = 'pulse_ai_projects';
const NEWSLETTERS_LS_KEY = 'pulse_ai_newsletters';

type MigrationStatus = 'idle' | 'running' | 'done' | 'error';

interface MigrationResult {
  projectsFound: number;
  newslettersFound: number;
  projectsMigrated: number;
  newslettersMigrated: number;
  errors: string[];
}

function readFromLocalStorage<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

export function MigratePage({ onBack }: { onBack: () => void }) {
  const { formatNumber, isRTL, t } = useLocale();
  const [status, setStatus] = useState<MigrationStatus>('idle');
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [hasCleared, setHasCleared] = useState(false);

  const localProjects = readFromLocalStorage<Project>(PROJECTS_LS_KEY);
  const localNewsletters = readFromLocalStorage<Newsletter>(NEWSLETTERS_LS_KEY);
  const hasData = localProjects.length > 0 || localNewsletters.length > 0;

  async function runMigration() {
    setStatus('running');
    const pb = getPocketBase();

    if (!pb.authStore.isValid) {
      setStatus('error');
      setResult({
        projectsFound: localProjects.length,
        newslettersFound: localNewsletters.length,
        projectsMigrated: 0,
        newslettersMigrated: 0,
        errors: [t('migrate.signInRequired')],
      });
      return;
    }

    const errors: string[] = [];
    let projectsMigrated = 0;
    let newslettersMigrated = 0;

    // ── Migrate Projects ──────────────────────────────────────────────────
    for (const project of localProjects) {
      try {
        await pb.collection('projects').create({
          title: project.title ?? '',
          description: project.description ?? '',
          department: project.department ?? '',
          devision: project.devision ?? '',
          field: project.field ?? '',
          status: project.status ?? 'pending',
          isVisibleInGantt: project.isVisibleInGantt ?? true,
          gantt: project.gantt ?? { tasks: [], resources: [], roles: [], zoom: 'week', lastEditedAt: null },
        });
        projectsMigrated++;
      } catch (err) {
        let msg = err instanceof Error ? err.message : String(err);
        if (err && typeof err === 'object' && 'response' in err) {
          const resp = (err as any).response;
          if (resp?.data && Object.keys(resp.data).length > 0) {
            msg += ' - ' + JSON.stringify(resp.data);
          }
        }
        errors.push(`Project "${project.title}": ${msg}`);
      }
    }

    // ── Migrate Newsletters ───────────────────────────────────────────────
    for (const newsletter of localNewsletters) {
      try {
        const content = newsletter.content ?? '';
        await pb.collection('newsletters').create({
          title: newsletter.title ?? '',
          subtitle: newsletter.subtitle ?? '',
          content,
          excerpt: extractExcerpt(content),
          author: newsletter.author ?? '',
          authorAvatar: newsletter.authorAvatar ?? '',
          createdById: newsletter.createdById ?? '',
          publishedAt: newsletter.publishedAt ?? new Date().toISOString().split('T')[0],
          readTime: calculateReadTime(content),
          coverImage: newsletter.coverImage ?? '',
          likes: newsletter.likes ?? 0,
          comments: newsletter.comments ?? 0,
          shares: newsletter.shares ?? 0,
          tags: newsletter.tags ?? [],
          status: newsletter.status ?? 'draft',
          likedByUserIds: newsletter.likedByUserIds ?? [],
          commentItems: newsletter.commentItems ?? [],
        });
        newslettersMigrated++;
      } catch (err) {
        let msg = err instanceof Error ? err.message : String(err);
        if (err && typeof err === 'object' && 'response' in err) {
          const resp = (err as any).response;
          if (resp?.data && Object.keys(resp.data).length > 0) {
            msg += ' - ' + JSON.stringify(resp.data);
          }
        }
        errors.push(`Newsletter "${newsletter.title}": ${msg}`);
      }
    }

    // Removed automatic localStorage clearing here.

    setResult({
      projectsFound: localProjects.length,
      newslettersFound: localNewsletters.length,
      projectsMigrated,
      newslettersMigrated,
      errors,
    });
    setStatus(errors.length === 0 ? 'done' : 'error');
  }

  function handleClearLocalData() {
    window.localStorage.removeItem(PROJECTS_LS_KEY);
    window.localStorage.removeItem(NEWSLETTERS_LS_KEY);
    setHasCleared(true);
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-start justify-center pt-16 px-4">
      <div className="w-full max-w-xl">
        <div className="mb-4 flex justify-end">
          <LanguageToggleButton compact />
        </div>
        {/* Header */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-[#737373] hover:text-[#171717] mb-8 transition-colors"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className={cn('h-4 w-4', isRTL && 'rtl-rotate-180')} />
          {t('common.back')}
        </button>

        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[#D93A3A]/10 flex items-center justify-center text-xl">
              🗄️
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#171717]">{t('migrate.title')}</h1>
              <p className="text-sm text-[#737373]">{t('migrate.subtitle')}</p>
            </div>
          </div>

          {/* What was found */}
          <div className="rounded-xl border border-[#E5E5E5] divide-y divide-[#E5E5E5] mb-6">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-[#525252]">📁 {t('migrate.projectsInStorage')}</span>
              <span className={`text-sm font-semibold ${localProjects.length > 0 ? 'text-[#D93A3A]' : 'text-[#A3A3A3]'}`}>
                {t('migrate.itemsFound', { count: formatNumber(localProjects.length) })}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-[#525252]">📰 {t('migrate.newslettersInStorage')}</span>
              <span className={`text-sm font-semibold ${localNewsletters.length > 0 ? 'text-[#D93A3A]' : 'text-[#A3A3A3]'}`}>
                {t('migrate.itemsFound', { count: formatNumber(localNewsletters.length) })}
              </span>
            </div>
          </div>

          {/* State: idle / no data */}
          {status === 'idle' && !hasData && (
            <div className="text-center py-6">
              <p className="text-2xl mb-2">✅</p>
              <p className="font-semibold text-[#171717]">{t('migrate.nothing')}</p>
              <p className="text-sm text-[#737373] mt-1">
                {t('migrate.emptyDescription')}
              </p>
            </div>
          )}

          {/* State: idle / has data */}
          {status === 'idle' && hasData && (
            <>
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 mb-6">
                ⚠️ {t('migrate.warning')}
              </div>
              <button
                onClick={runMigration}
                className="w-full py-3 bg-[#D93A3A] hover:bg-[#B91C1C] text-white font-semibold rounded-xl transition-colors"
              >
                {t('migrate.run', { count: formatNumber(localProjects.length + localNewsletters.length) })}
              </button>
            </>
          )}

          {/* State: running */}
          {status === 'running' && (
            <div className="text-center py-6">
              <p className="text-2xl mb-2 animate-pulse">⏳</p>
              <p className="font-semibold text-[#171717]">{t('migrate.runningTitle')}</p>
              <p className="text-sm text-[#737373] mt-1">{t('migrate.runningDescription')}</p>
            </div>
          )}

          {/* State: done */}
          {status === 'done' && result && (
            <div className="text-center py-4">
              <p className="text-3xl mb-3">🎉</p>
              <p className="font-bold text-[#171717] text-lg">{t('migrate.complete')}</p>
              <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 text-left space-y-1">
                <p>✅ {t('migrate.projectsMigrated', { done: formatNumber(result.projectsMigrated), total: formatNumber(result.projectsFound) })}</p>
                <p>✅ {t('migrate.newslettersMigrated', { done: formatNumber(result.newslettersMigrated), total: formatNumber(result.newslettersFound) })}</p>
                {hasCleared && <p className="text-xs text-green-700 mt-2">{t('migrate.cleared')}</p>}
              </div>
              
              {!hasCleared ? (
                <div className="mt-6 p-5 border border-amber-200 bg-amber-50 rounded-xl text-left">
                  <p className="font-bold text-amber-900 mb-2">{t('migrate.deleteTitle')}</p>
                  <p className="text-sm text-amber-800 mb-4">
                    {t('migrate.deleteDescription')}
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={handleClearLocalData}
                      className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg transition-colors"
                    >
                      {t('migrate.deleteButton')}
                    </button>
                    <button
                      onClick={onBack}
                      className="flex-1 py-2.5 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 font-semibold rounded-lg transition-colors"
                    >
                      {t('common.keepIt')}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={onBack}
                  className="mt-6 w-full py-3 bg-[#171717] hover:bg-[#525252] text-white font-semibold rounded-xl transition-colors"
                >
                  {t('common.backToApp')}
                </button>
              )}
            </div>
          )}

          {/* State: error */}
          {status === 'error' && result && (
            <div className="py-2">
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-4 space-y-1">
                <p className="font-semibold">{t('migrate.errorTitle')}</p>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs font-mono">{e}</p>
                ))}
              </div>
              {(result.projectsMigrated > 0 || result.newslettersMigrated > 0) && (
                <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 mb-4">
                  ✅ {t('migrate.partialSuccess', {
                    projects: formatNumber(result.projectsMigrated),
                    newsletters: formatNumber(result.newslettersMigrated),
                  })}
                </div>
              )}
              <button
                onClick={() => setStatus('idle')}
                className="w-full py-3 border border-[#E5E5E5] hover:bg-[#F3F4F6] text-[#171717] font-semibold rounded-xl transition-colors"
              >
                {t('common.tryAgain')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
