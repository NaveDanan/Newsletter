import { useCallback, useEffect, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Shield01Icon } from '@hugeicons/core-free-icons';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useLocale } from '@/contexts/LocaleContext';
import { canModerateCommunity } from '@/lib/auth/permissions';
import { communityPostPath } from '@/lib/community-routes';
import {
  fetchCommunityReports,
  getPocketBaseErrorMessage,
  moderateCommunityPost,
  moderateCommunityProfile,
  resolveCommunityReport,
} from '@/lib/pocketbase/community';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/lib/pocketbase/client';
import {
  COMMUNITY_REPORT_STATUSES,
  type CommunityReport,
  type CommunityReportStatus,
} from '@/types/community';

// The moderation queue lives in the manager dashboard rather than inside the
// community itself, because the roles that can act on a report are the same
// ones that already sign in here. Every action writes an audit reason, so the
// textarea is part of the row rather than a follow-up dialog.

interface CommunityModerationViewProps {
  currentUserRole: UserRole | null;
}

export function CommunityModerationView({ currentUserRole }: CommunityModerationViewProps) {
  const { t, formatDate } = useLocale();
  const [status, setStatus] = useState<CommunityReportStatus>('open');
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [cursor, setCursor] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState('');
  const requestRef = useRef(0);
  const isAllowed = canModerateCommunity(currentUserRole);

  const load = useCallback(async (nextCursor: string, nextStatus: CommunityReportStatus) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    if (nextCursor) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }

    try {
      const page = await fetchCommunityReports({ status: nextStatus, cursor: nextCursor || undefined });
      if (requestRef.current !== requestId) {
        return;
      }
      setReports((current) => {
        if (!nextCursor) {
          return page.items;
        }
        const seen = new Set(current.map((item) => item.id));
        return current.concat(page.items.filter((item) => !seen.has(item.id)));
      });
      setCursor(page.cursor);
      setHasMore(page.hasMore);
      setError(null);
    } catch (caught) {
      if (requestRef.current === requestId) {
        setError(getPocketBaseErrorMessage(caught, t('community.moderation.loadFailed')));
      }
    } finally {
      if (requestRef.current === requestId) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, [t]);

  useEffect(() => {
    if (!isAllowed) {
      setIsLoading(false);
      return;
    }
    void load('', status);
  }, [isAllowed, load, status]);

  // A resolved or dismissed report leaves the open queue, so the row is dropped
  // locally instead of refetching the whole page under the moderator.
  const runAction = useCallback(async (report: CommunityReport, action: () => Promise<void>, dropRow: boolean) => {
    setBusyId(report.id);
    try {
      await action();
      toast.success(t('community.moderation.actionDone'));
      if (dropRow) {
        setReports((current) => current.filter((item) => item.id !== report.id));
      }
    } catch (caught) {
      toast.error(getPocketBaseErrorMessage(caught, t('community.moderation.actionFailed')));
    } finally {
      setBusyId('');
    }
  }, [t]);

  if (!isAllowed) {
    return (
      <div className="dashboard-card text-sm text-[#737373]">{t('community.moderation.accessDenied')}</div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[#171717]">
            <HugeiconsIcon icon={Shield01Icon} className="size-6 text-[#D93A3A]" />
            {t('community.moderation.title')}
          </h1>
          <p className="mt-1 text-sm text-[#737373]">{t('community.moderation.description')}</p>
        </div>

        <div role="tablist" aria-label={t('community.moderation.title')} className="flex gap-1 rounded-full bg-[#F5F5F5] p-1">
          {COMMUNITY_REPORT_STATUSES.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={value === status}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm transition-colors',
                value === status ? 'bg-white font-semibold text-[#171717] shadow-sm' : 'text-[#737373]',
              )}
              onClick={() => setStatus(value)}
            >
              {t('community.moderation.status.' + value)}
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <div className="dashboard-card space-y-3">
          <p className="text-sm text-[#D93A3A]">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void load('', status)}>
            {t('community.feed.retry')}
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <div className="dashboard-card text-sm text-[#737373]">{t('community.moderation.loading')}</div>
      ) : null}

      {!isLoading && !error && reports.length === 0 ? (
        <div className="dashboard-card text-sm text-[#737373]">{t('community.moderation.empty')}</div>
      ) : null}

      <ul className="space-y-4">
        {reports.map((report) => {
          const reason = reasons[report.id] || '';
          const isBusy = busyId === report.id;
          const isPostReport = Boolean(report.post);

          return (
            <li key={report.id} className="dashboard-card space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[#171717]">
                    {t('community.report.reason.' + report.reason)}
                  </p>
                  <p className="mt-0.5 text-xs text-[#737373]">
                    {t('community.moderation.reportedBy', { handle: report.reporterHandle })}
                    {' · '}
                    {formatDate(report.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
                <span className="rounded-full bg-[#F5F5F5] px-3 py-1 text-xs font-medium text-[#404040]">
                  {t('community.moderation.status.' + report.status)}
                </span>
              </div>

              <p className="text-sm text-[#404040]">
                {isPostReport
                  ? t('community.moderation.aboutPost', { handle: report.subjectHandle })
                  : t('community.moderation.aboutProfile', { handle: report.subjectHandle })}
              </p>

              {report.details ? (
                <p className="whitespace-pre-wrap rounded-lg bg-[#FAFAFA] px-3 py-2 text-sm text-[#404040]">
                  {report.details}
                </p>
              ) : null}

              {report.post ? (
                <blockquote className="border-s-2 border-[#E5E5E5] ps-3 text-sm text-[#737373]">
                  <span className="line-clamp-4 whitespace-pre-wrap">{report.post.body}</span>
                </blockquote>
              ) : null}

              <Textarea
                value={reason}
                rows={2}
                placeholder={t('community.moderation.reasonPlaceholder')}
                onChange={(event) => setReasons((current) => ({ ...current, [report.id]: event.target.value }))}
              />

              <div className="flex flex-wrap gap-2">
                {report.post ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(communityPostPath(report.post ? report.post.id : ''), '_blank', 'noopener')}
                  >
                    {t('community.moderation.openPost')}
                  </Button>
                ) : null}

                {report.post ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => {
                      const postId = report.post ? report.post.id : '';
                      const restore = report.post ? report.post.status === 'removed' : false;
                      void runAction(report, async () => {
                        await moderateCommunityPost(postId, { restore, reason });
                      }, false);
                    }}
                  >
                    {report.post && report.post.status === 'removed'
                      ? t('community.moderation.restorePost')
                      : t('community.moderation.removePost')}
                  </Button>
                ) : null}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isBusy || !report.subjectHandle}
                  onClick={() => {
                    void runAction(report, async () => {
                      await moderateCommunityProfile(report.subjectHandle, { suspend: true, reason });
                    }, false);
                  }}
                >
                  {t('community.moderation.suspendAccount')}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isBusy || !report.subjectHandle}
                  onClick={() => {
                    void runAction(report, async () => {
                      await moderateCommunityProfile(report.subjectHandle, { suspend: false, reason });
                    }, false);
                  }}
                >
                  {t('community.moderation.restoreAccount')}
                </Button>

                {report.status === 'open' ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      className="bg-[#171717] text-white hover:bg-[#404040]"
                      disabled={isBusy}
                      onClick={() => {
                        void runAction(report, async () => {
                          await resolveCommunityReport(report.id, 'resolved', reason);
                        }, true);
                      }}
                    >
                      {t('community.moderation.resolve')}
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => {
                        void runAction(report, async () => {
                          await resolveCommunityReport(report.id, 'dismissed', reason);
                        }, true);
                      }}
                    >
                      {t('community.moderation.dismiss')}
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {hasMore ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            disabled={isLoadingMore}
            onClick={() => void load(cursor, status)}
          >
            {isLoadingMore ? t('community.feed.loadingMore') : t('community.feed.loadMore')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
