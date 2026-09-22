import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  BarChartIcon,
  CheckmarkCircle02Icon,
  CircleIcon,
  Loading02Icon,
  UserIcon,
} from '@hugeicons/core-free-icons';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';
import type { PocketBaseUser } from '@/lib/pocketbase/client';
import type { NewsletterPoll } from '@/types/newsletter';

interface NewsletterPollCardProps {
  poll: NewsletterPoll;
  newsletterId: string;
  currentUser?: PocketBaseUser | null;
  onVote?: (newsletterId: string, optionId: string) => void | Promise<unknown>;
  onRequireAuth?: () => void;
  isInteractive?: boolean;
  className?: string;
}

export function NewsletterPollCard({
  poll,
  newsletterId,
  currentUser = null,
  onVote,
  onRequireAuth,
  isInteractive = true,
  className,
}: NewsletterPollCardProps) {
  const { formatNumber, isRTL, t } = useLocale();
  const [submittingOptionId, setSubmittingOptionId] = useState<string | null>(null);

  const isAuthenticated = Boolean(currentUser?.id);
  const totalVotes = poll.options.reduce((sum, opt) => sum + (opt.votes || opt.voterUserIds.length || 0), 0);

  const userVotedOptionId = currentUser?.id
    ? poll.options.find((opt) => opt.voterUserIds.includes(currentUser.id))?.id ?? null
    : null;

  const hasUserVoted = Boolean(userVotedOptionId);
  const isClosed = Boolean(poll.closed);

  const handleOptionClick = async (optionId: string) => {
    if (!isInteractive || isClosed) return;

    if (!isAuthenticated) {
      onRequireAuth?.();
      return;
    }

    if (!onVote) return;

    try {
      setSubmittingOptionId(optionId);
      await onVote(newsletterId, optionId);
    } finally {
      setSubmittingOptionId(null);
    }
  };

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm sm:p-6',
        className
      )}
    >
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary-accent)]/15 text-[var(--primary-accent)]">
            <HugeiconsIcon icon={BarChartIcon} className="h-5 w-5 -scale-y-100" />
          </div>
          <div>
            <span className="inline-block text-xs font-bold tracking-wider uppercase text-[var(--primary-accent)]">
              {t('viewer.poll')}
            </span>
            {isClosed && (
              <span className="ml-2 inline-block rounded-md bg-[var(--bg-pill)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                {t('viewer.pollClosed')}
              </span>
            )}
          </div>
        </div>

        <div className="text-right text-xs font-medium text-[var(--text-secondary)]">
          {totalVotes === 1
            ? t('viewer.oneVote')
            : t('viewer.totalVotes', { count: formatNumber(totalVotes) })}
        </div>
      </div>

      {/* Question */}
      <h3
        className="mb-4 text-lg font-bold text-[var(--text-primary)] sm:text-xl"
        dir="auto"
      >
        {poll.question}
      </h3>

      {/* Options */}
      <div className="space-y-2.5">
        {poll.options.map((option, index) => {
          const optVotes = option.votes || option.voterUserIds.length || 0;
          const percentage = totalVotes > 0 ? Math.round((optVotes / totalVotes) * 100) : 0;
          const isSelected = option.id === userVotedOptionId;
          const isSubmitting = submittingOptionId === option.id;

          return (
            <button
              key={option.id || index}
              type="button"
              disabled={!isInteractive || isClosed || Boolean(submittingOptionId)}
              onClick={() => handleOptionClick(option.id)}
              className={cn(
                'group relative w-full overflow-hidden rounded-xl border text-left transition-all',
                isSelected
                  ? 'border-[var(--primary-accent)] bg-[var(--primary-accent)]/10 shadow-xs'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-card-alt)] hover:border-[var(--primary-accent)]/40',
                (!isInteractive || isClosed) && 'cursor-default'
              )}
            >
              {/* Progress bar background */}
              <div
                className={cn(
                  'absolute inset-y-0 transition-all duration-500 ease-out',
                  isRTL ? 'right-0' : 'left-0',
                  isSelected
                    ? 'bg-[var(--primary-accent)]/20'
                    : 'bg-[var(--bg-pill)]/60 group-hover:bg-[var(--bg-pill)]'
                )}
                style={{ width: `${percentage}%` }}
              />

              {/* Content row */}
              <div className="relative flex items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="shrink-0 text-[var(--text-secondary)]">
                    {isSubmitting ? (
                      <HugeiconsIcon icon={Loading02Icon} className="h-4 w-4 animate-spin text-[var(--primary-accent)]" />
                    ) : isSelected ? (
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} className="h-4 w-4 text-[var(--primary-accent)]" />
                    ) : (
                      <HugeiconsIcon icon={CircleIcon} className="h-4 w-4 text-[var(--text-muted)] group-hover:text-[var(--text-primary)]" />
                    )}
                  </span>
                  <span
                    className={cn(
                      'text-sm font-medium sm:text-base break-words',
                      isSelected ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                    )}
                    dir="auto"
                  >
                    {option.text}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-2 font-mono text-xs sm:text-sm">
                  {(hasUserVoted || isClosed || !isAuthenticated) && (
                    <>
                      <span className="font-semibold text-[var(--text-primary)]">{percentage}%</span>
                      <span className="text-xs text-[var(--text-muted)]">({optVotes})</span>
                    </>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer info / call to action */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#E5E5E5]/80 pt-3 text-xs text-[#737373]">
        {!isAuthenticated ? (
          <button
            type="button"
            onClick={onRequireAuth}
            className="flex items-center gap-1.5 font-semibold text-[#D93A3A] transition-colors hover:text-[#B91C1C]"
          >
            <HugeiconsIcon icon={UserIcon} className="h-3.5 w-3.5" />
            <span>{t('viewer.signInToVote')}</span>
          </button>
        ) : hasUserVoted ? (
          <span className="flex items-center gap-1.5 text-green-700 font-medium">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="h-3.5 w-3.5" />
            <span>{t('viewer.voted')}</span>
          </span>
        ) : (
          <span>{t('viewer.vote')}</span>
        )}

        {hasUserVoted && !isClosed && isInteractive && (
          <span className="text-[11px] text-[#A3A3A3]">
            {t('viewer.changeVote')}
          </span>
        )}
      </div>
    </div>
  );
}
