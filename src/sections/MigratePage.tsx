import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { LanguageToggleButton } from '@/components/LanguageToggleButton';
import { useAuth } from '@/contexts/AuthContext';
import { useLocale } from '@/contexts/LocaleContext';
import { getPocketBase } from '@/lib/pocketbase/client';
import { cn } from '@/lib/utils';

type MigrationStatus = 'idle' | 'running' | 'done' | 'error';
type CountKey = 'projects' | 'newsletters' | 'users' | 'links' | 'navigationLinks' | 'dropdowns' | 'subscribers';

interface CountMap {
  projects: number;
  newsletters: number;
  users: number;
  links: number;
  navigationLinks: number;
  dropdowns: number;
  subscribers: number;
}

interface NullableCountMap {
  projects: number | null;
  newsletters: number | null;
  users: number | null;
  links: number | null;
  navigationLinks: number | null;
  dropdowns: number | null;
  subscribers: number | null;
}

interface TargetCountState {
  count: number | null;
  error: string | null;
}

interface InspectResponse {
  counts: CountMap;
  usersWithAdminRole: number;
}

interface ImportResponse {
  beforeCounts: CountMap;
  sourceCounts: CountMap;
  importedCounts: CountMap;
  clearedCounts: CountMap;
  issues: string[];
  usersWithAdminRole: number;
  requiresReauth: boolean;
}

const COUNT_LABEL_KEYS: Record<CountKey, string> = {
  projects: 'migrate.projects',
  newsletters: 'migrate.newsletters',
  users: 'migrate.users',
  links: 'migrate.links',
  navigationLinks: 'migrate.navigationLinks',
  dropdowns: 'migrate.dropdowns',
  subscribers: 'migrate.subscribers',
};

const TARGET_COLLECTIONS: Array<{ key: CountKey; collection: string }> = [
  { key: 'projects', collection: 'projects' },
  { key: 'newsletters', collection: 'newsletters' },
  { key: 'users', collection: 'users' },
  { key: 'links', collection: 'links' },
  { key: 'navigationLinks', collection: 'navigation_links' },
  { key: 'dropdowns', collection: 'nav_dropdowns' },
  { key: 'subscribers', collection: 'newsletter_subscribers' },
];

function createTargetCountState(): Record<CountKey, TargetCountState> {
  return {
    projects: { count: null, error: null },
    newsletters: { count: null, error: null },
    users: { count: null, error: null },
    links: { count: null, error: null },
    navigationLinks: { count: null, error: null },
    dropdowns: { count: null, error: null },
    subscribers: { count: null, error: null },
  };
}

function createNullableCountMap(): NullableCountMap {
  return {
    projects: null,
    newsletters: null,
    users: null,
    links: null,
    navigationLinks: null,
    dropdowns: null,
    subscribers: null,
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecordAuthTokenError(error: unknown): boolean {
  return /valid record authorization token/i.test(getErrorMessage(error));
}

function normalizeRelativePath(file: File): string {
  return (file.webkitRelativePath || file.name).replace(/\\+/g, '/').replace(/^\/+/, '');
}

function findDataDbFile(files: File[]): File | null {
  let selected: File | null = null;
  let selectedScore = Number.POSITIVE_INFINITY;

  for (const file of files) {
    const relativePath = normalizeRelativePath(file).toLowerCase();
    if (relativePath === 'data.db' || relativePath.endsWith('/data.db')) {
      const score = relativePath === 'data.db' ? 0 : relativePath.endsWith('/pb_data/data.db') ? 1 : relativePath.split('/').length;
      if (score < selectedScore) {
        selected = file;
        selectedScore = score;
      }
    }
  }

  return selected;
}

function findDatabaseFiles(files: File[], dataDb: File): File[] {
  const dataDbPath = normalizeRelativePath(dataDb);
  const dataDbDirectory = dataDbPath.includes('/') ? dataDbPath.slice(0, dataDbPath.lastIndexOf('/') + 1) : '';
  const wantedPaths = new Set([
    dataDbPath.toLowerCase(),
    `${dataDbDirectory}data.db-wal`.toLowerCase(),
    `${dataDbDirectory}data.db-shm`.toLowerCase(),
  ]);

  return files.filter((file) => wantedPaths.has(normalizeRelativePath(file).toLowerCase()));
}

function getFolderName(files: File[]): string {
  if (files.length === 0) {
    return '';
  }

  const firstPath = normalizeRelativePath(files[0]);
  return firstPath.includes('/') ? firstPath.split('/')[0] : firstPath;
}

function totalCount(counts: CountMap | null): number {
  if (!counts) {
    return 0;
  }

  return counts.projects + counts.newsletters + counts.users + counts.links + counts.navigationLinks + counts.dropdowns + counts.subscribers;
}

function mapTargetCountsToNullable(state: Record<CountKey, TargetCountState>): NullableCountMap {
  return {
    projects: state.projects.count,
    newsletters: state.newsletters.count,
    users: state.users.count,
    links: state.links.count,
    navigationLinks: state.navigationLinks.count,
    dropdowns: state.dropdowns.count,
    subscribers: state.subscribers.count,
  };
}

function mapCountsToTargetState(counts: CountMap): Record<CountKey, TargetCountState> {
  return {
    projects: { count: counts.projects, error: null },
    newsletters: { count: counts.newsletters, error: null },
    users: { count: counts.users, error: null },
    links: { count: counts.links, error: null },
    navigationLinks: { count: counts.navigationLinks, error: null },
    dropdowns: { count: counts.dropdowns, error: null },
    subscribers: { count: counts.subscribers, error: null },
  };
}

export function MigratePage({ onBack }: { onBack: () => void }) {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { formatNumber, isRTL, t } = useLocale();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedFilesRef = useRef<File[]>([]);
  const [selectedFolderName, setSelectedFolderName] = useState('');
  const [sourceDbPath, setSourceDbPath] = useState('');
  const [filesScanned, setFilesScanned] = useState(0);
  const [status, setStatus] = useState<MigrationStatus>('idle');
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectResult, setInspectResult] = useState<InspectResponse | null>(null);
  const [targetCounts, setTargetCounts] = useState<Record<CountKey, TargetCountState>>(createTargetCountState());
  const [targetCountsLoading, setTargetCountsLoading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);

  const isAdmin = user?.role === 'admin';
  const sourceTotal = totalCount(inspectResult?.counts ?? null);

  useEffect(() => {
    const input = fileInputRef.current;
    if (!input) {
      return;
    }

    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
  }, []);

  useEffect(() => {
    async function loadTargetCounts() {
      if (isAuthLoading) {
        setTargetCountsLoading(true);
        return;
      }

      if (!isAuthenticated) {
        const next = createTargetCountState();
        for (const item of TARGET_COLLECTIONS) {
          next[item.key] = { count: null, error: t('migrate.signInRequired') };
        }
        setTargetCounts(next);
        setTargetCountsLoading(false);
        return;
      }

      setTargetCountsLoading(true);
      const pb = getPocketBase();
      const next = createTargetCountState();

      await Promise.all(TARGET_COLLECTIONS.map(async (item) => {
        try {
          const page = await pb.collection(item.collection).getList(1, 1);
          next[item.key] = { count: page.totalItems, error: null };
        } catch (error) {
          next[item.key] = { count: null, error: getErrorMessage(error) };
        }
      }));

      setTargetCounts(next);
      setTargetCountsLoading(false);
    }

    void loadTargetCounts();
  }, [isAuthLoading, isAuthenticated, t, user?.id, user?.role]);

  async function handleFolderSelection(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    selectedFilesRef.current = files;
    setInspectResult(null);
    setImportResult(null);
    setInspectError(null);
    setStatus('idle');

    if (files.length === 0) {
      setSelectedFolderName('');
      setSourceDbPath('');
      setFilesScanned(0);
      return;
    }

    setSelectedFolderName(getFolderName(files));
    setFilesScanned(files.length);

    const dataDb = findDataDbFile(files);
    if (!dataDb) {
      setSourceDbPath('');
      setInspectError(t('migrate.missingDataDb'));
      event.target.value = '';
      return;
    }

    setSourceDbPath(normalizeRelativePath(dataDb));
    setIsInspecting(true);

    try {
      if (isAuthLoading || !isAuthenticated) {
        throw new Error(t('migrate.signInRequired'));
      }

      if (!isAdmin) {
        throw new Error(t('migrate.adminRequired'));
      }

      const formData = new FormData();
      const databaseFiles = findDatabaseFiles(files, dataDb);

      formData.append('sourceFilePaths', JSON.stringify(databaseFiles.map(normalizeRelativePath)));

      for (const file of databaseFiles) {
        formData.append('sourceFiles', file, normalizeRelativePath(file));
      }
      const pb = getPocketBase();
      const response = await pb.send<InspectResponse>('/api/newsletter/migrate/inspect', {
        method: 'POST',
        body: formData,
      });

      setInspectResult(response);
      setInspectError(null);
    } catch (error) {
      setInspectResult(null);
      setInspectError(isRecordAuthTokenError(error) ? t('migrate.signInRequired') : getErrorMessage(error));
    } finally {
      setIsInspecting(false);
      event.target.value = '';
    }
  }

  async function runMigration() {
    if (isAuthLoading) {
      setStatus('error');
      setInspectError(t('migrate.signInRequired'));
      return;
    }

    if (!isAuthenticated) {
      setStatus('error');
      setInspectError(t('migrate.signInRequired'));
      return;
    }

    if (!isAdmin) {
      setStatus('error');
      setInspectError(t('migrate.adminRequired'));
      return;
    }

    if (selectedFilesRef.current.length === 0 || !inspectResult) {
      setStatus('error');
      setInspectError(t('migrate.noImportableData'));
      return;
    }

    setStatus('running');
    setImportResult(null);
    setInspectError(null);

    try {
      const formData = new FormData();
      formData.append('sourceFilePaths', JSON.stringify(selectedFilesRef.current.map(normalizeRelativePath)));

      for (const file of selectedFilesRef.current) {
        formData.append('sourceFiles', file, normalizeRelativePath(file));
      }

      const pb = getPocketBase();
      const response = await pb.send<ImportResponse>('/api/newsletter/migrate/import', {
        method: 'POST',
        body: formData,
      });

      setImportResult(response);
      setTargetCounts(mapCountsToTargetState(response.importedCounts));
      setStatus(response.issues.length === 0 ? 'done' : 'error');

      if (response.requiresReauth) {
        pb.authStore.clear();
      }
    } catch (error) {
      setStatus('error');
      setInspectError(isRecordAuthTokenError(error) ? t('migrate.signInRequired') : getErrorMessage(error));
    }
  }

  function renderCountList(values: NullableCountMap | CountMap) {
    return (
      <div className="rounded-xl border border-[#E5E5E5] divide-y divide-[#E5E5E5] overflow-hidden">
        {(Object.keys(COUNT_LABEL_KEYS) as CountKey[]).map((key) => {
          const value = values[key];
          return (
            <div key={key} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-sm text-[#525252]">{t(COUNT_LABEL_KEYS[key])}</span>
              <span className={cn('text-sm font-semibold', typeof value === 'number' && value > 0 ? 'text-[#D93A3A]' : 'text-[#A3A3A3]')}>
                {typeof value === 'number' ? formatNumber(value) : t('migrate.countUnavailable')}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  const targetCountValues = mapTargetCountsToNullable(targetCounts);
  const sourceCountValues = inspectResult?.counts ?? createNullableCountMap();
  const runDisabled = status === 'running' || isInspecting || !inspectResult || !isAuthenticated || !isAdmin;
  const chooseFolderDisabled = isAuthLoading || isInspecting || status === 'running' || !isAuthenticated || !isAdmin;

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-start justify-center pt-16 px-4 pb-16">
      <div className="w-full max-w-4xl">
        <div className="mb-4 flex justify-end">
          <LanguageToggleButton compact />
        </div>

        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-[#737373] hover:text-[#171717] mb-8 transition-colors"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className={cn('h-4 w-4', isRTL && 'rtl-rotate-180')} />
          {t('common.back')}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFolderSelection}
          className="hidden"
        />

        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-8 shadow-sm space-y-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#D93A3A]/10 flex items-center justify-center text-xl">🗄️</div>
            <div>
              <h1 className="text-lg font-bold text-[#171717]">{t('migrate.title')}</h1>
              <p className="text-sm text-[#737373]">{t('migrate.subtitle')}</p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-[#171717]">{t('migrate.targetCountsTitle')}</h2>
                <p className="text-sm text-[#737373]">{t('migrate.targetCountsDescription')}</p>
              </div>
              {renderCountList(targetCountValues)}
              {targetCountsLoading && <p className="text-xs text-[#737373]">{t('migrate.loadingCounts')}</p>}
            </section>

            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-[#171717]">{t('migrate.sourceCountsTitle')}</h2>
                <p className="text-sm text-[#737373]">{t('migrate.sourceCountsDescription')}</p>
              </div>
              {renderCountList(sourceCountValues)}
              <p className="text-xs text-[#737373]">
                {selectedFolderName ? t('migrate.filesScanned', { count: formatNumber(filesScanned) }) : t('migrate.noFolderSelected')}
              </p>
            </section>
          </div>

          <section className="rounded-2xl border border-[#E5E5E5] bg-[#FCFCFC] p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-[#171717]">{t('migrate.chooseFolderTitle')}</h2>
              <p className="text-sm text-[#737373]">{t('migrate.chooseFolderDescription')}</p>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#171717]">
                  {selectedFolderName ? t('migrate.selectedFolder', { name: selectedFolderName }) : t('migrate.noFolderSelected')}
                </p>
                <p className="text-xs text-[#737373] mt-1">
                  {sourceTotal > 0 ? t('migrate.readyToMigrate', { count: formatNumber(sourceTotal) }) : t('migrate.folderSelectionHint')}
                </p>
                {sourceDbPath && (
                  <p className="text-xs text-[#737373] mt-1 font-mono break-all">
                    {t('migrate.sourceDbPath', { path: sourceDbPath })}
                  </p>
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={chooseFolderDisabled}
                className="shrink-0 rounded-xl border border-[#D4D4D8] px-4 py-2.5 text-sm font-semibold text-[#171717] hover:bg-[#F3F4F6] transition-colors"
              >
                {t('migrate.chooseFolderButton')}
              </button>
            </div>

            {!isAuthLoading && !isAuthenticated && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('migrate.signInRequired')}</div>
            )}

            {!isAuthLoading && isAuthenticated && !isAdmin && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('migrate.adminRequired')}</div>
            )}

            {inspectError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{inspectError}</div>
            )}

            {inspectResult && inspectResult.usersWithAdminRole === 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('migrate.noSourceAdminWarning')}</div>
            )}

            {isInspecting && (
              <div className="rounded-xl border border-[#E5E5E5] bg-white px-4 py-3 text-sm text-[#525252]">{t('migrate.inspectingSource')}</div>
            )}

            <button
              onClick={runMigration}
              disabled={runDisabled}
              className={cn(
                'w-full py-3 font-semibold rounded-xl transition-colors',
                runDisabled ? 'bg-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed' : 'bg-[#D93A3A] hover:bg-[#B91C1C] text-white',
              )}
            >
              {t('migrate.run', { count: formatNumber(sourceTotal) })}
            </button>
          </section>

          {(status !== 'idle' || importResult) && (
            <section className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-[#171717]">{t('migrate.fullStatusTitle')}</h2>
                <p className="text-sm text-[#737373]">{t('migrate.fullStatusDescription')}</p>
              </div>

              {status === 'running' && (
                <div className="rounded-xl border border-[#E5E5E5] bg-[#F9FAFB] px-4 py-3 text-sm text-[#525252]">
                  <p className="font-semibold text-[#171717]">{t('migrate.runningTitle')}</p>
                  <p className="mt-1">{t('migrate.runningDescription')}</p>
                </div>
              )}

              {importResult && (
                <>
                  <div className="grid gap-6 lg:grid-cols-3">
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-[#171717]">{t('migrate.beforeImportTitle')}</p>
                      {renderCountList(importResult.beforeCounts)}
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-[#171717]">{t('migrate.sourceCountsTitle')}</p>
                      {renderCountList(importResult.sourceCounts)}
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-[#171717]">{t('migrate.afterImportTitle')}</p>
                      {renderCountList(importResult.importedCounts)}
                    </div>
                  </div>

                  <div className={cn(
                    'rounded-xl px-4 py-3 text-sm',
                    status === 'done' ? 'border border-green-200 bg-green-50 text-green-800' : 'border border-red-200 bg-red-50 text-red-800',
                  )}>
                    <p className="font-semibold">{status === 'done' ? t('migrate.complete') : t('migrate.errorTitle')}</p>
                    {importResult.requiresReauth && <p className="mt-1">{t('migrate.reauthRequired')}</p>}
                  </div>

                  {importResult.issues.length > 0 && (
                    <div className="rounded-xl border border-[#E5E5E5] bg-[#FAFAFA] px-4 py-3 text-sm text-[#171717] space-y-1">
                      <p className="font-semibold">{t('migrate.issuesTitle')}</p>
                      {importResult.issues.map((issue, index) => (
                        <p key={`${issue}-${index}`} className="text-xs font-mono break-words text-[#525252]">{issue}</p>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
