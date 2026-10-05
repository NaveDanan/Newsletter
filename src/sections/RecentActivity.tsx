import { Skeleton } from '@/components/ui/skeleton';
import { useLocale } from '@/contexts/LocaleContext';
import { useRecentActivity } from '@/hooks/useRecentActivity';
import { initials } from '@/lib/avatar';
import { communityPostPath, communityProfilePath } from '@/lib/community-routes';
import type { ActivityItem } from '@/types/activity';

const ACTIVITY_LIMIT = 4;

interface RecentActivityProps {
  onNavigate: (pathname: string) => void;
}

function targetPath(item: ActivityItem): string {
  if (item.kind === 'posted' && item.subjectId) {
    return communityPostPath(item.subjectId);
  }
  if (item.kind === 'published' && item.subjectId) {
    return `/article/${encodeURIComponent(item.subjectId)}`;
  }
  return item.actorHandle ? communityProfilePath(item.actorHandle) : '';
}

/** Real signups, community posts and published articles; hidden when there are none. */
export function RecentActivity({ onNavigate }: RecentActivityProps) {
  const { t, formatRelativeTime } = useLocale();
  const { activity, isLoading } = useRecentActivity(ACTIVITY_LIMIT);

  if (!isLoading && activity.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3" aria-busy={isLoading}>
      <h3 className="section-header-title mb-3 text-sm font-bold text-[var(--text-primary)]">
        {t('activity.title')}
      </h3>

      {isLoading
        ? Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="activity-card" aria-hidden="true">
            <div className="activity-top-row flex items-center gap-3">
              <Skeleton className="size-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </div>
        ))
        : activity.map((item) => {
          const name = item.actorName || t('activity.someone');
          const path = targetPath(item);
          const detail = item.subjectTitle || (item.actorHandle ? `@${item.actorHandle}` : '');

          return (
            <article key={item.id} className="activity-card">
              <div className="activity-top-row flex items-center gap-3">
                <div className="activity-avatar">
                  {item.avatarUrl ? (
                    <img src={item.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-xs font-bold text-[var(--primary-accent)]">
                      {initials(name)}
                    </span>
                  )}
                  <div className="yellow-dot-badge" />
                </div>
                <div className="activity-info min-w-0 flex-1">
                  <h4 className="activity-user-name truncate text-xs font-bold text-[var(--text-primary)] sm:text-sm" dir="auto">
                    {name}
                  </h4>
                  <span className="activity-action-text flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
                    {t(`activity.${item.kind}`)} •{' '}
                    <time dateTime={item.createdAt} className="font-semibold text-[var(--primary-accent)]">
                      {formatRelativeTime(item.createdAt)}
                    </time>
                  </span>
                </div>
              </div>
              {detail || path ? (
                <div className="activity-bottom-row flex items-center justify-between gap-3 pt-1">
                  <span className="min-w-0 truncate text-xs font-bold text-[var(--text-primary)]" dir="auto">
                    {detail}
                  </span>
                  {path ? (
                    <button
                      type="button"
                      className="btn-pill-action btn-thanks-yellow shrink-0 px-3 py-1 text-[11px]"
                      onClick={() => onNavigate(path)}
                    >
                      {t('activity.view')}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
    </section>
  );
}
