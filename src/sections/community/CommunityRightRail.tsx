import { useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Search01Icon } from '@hugeicons/core-free-icons';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';
import { fetchCommunityTrends } from '@/lib/pocketbase/community';
import { CommunityAvatar } from './CommunityAvatar';
import { useCommunity } from './CommunityContext';
import { CommunityFollowButton } from './CommunityFollowButton';
import type { CommunityHashtag, CommunityProfile } from '@/types/community';

// Trends and suggestions come from one GET /api/community/trends call, which
// the hook computes from the last seven days of hashtag usage and the accounts
// the caller does not yet follow.

interface CommunityRightRailProps {
  initialQuery?: string;
}

export function CommunityRightRail({ initialQuery = '' }: CommunityRightRailProps) {
  const { t, formatNumber } = useLocale();
  const { openProfile, openSearch, selectedTags, toggleTag } = useCommunity();
  const [term, setTerm] = useState(initialQuery);
  const [trends, setTrends] = useState<CommunityHashtag[]>([]);
  const [suggestions, setSuggestions] = useState<CommunityProfile[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setTerm(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    let cancelled = false;

    void fetchCommunityTrends()
      .then((result) => {
        if (!cancelled) {
          setTrends(result.trends);
          setSuggestions(result.suggestions);
          setIsLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const updateSuggestion = (handle: string, isFollowing: boolean, followerCount: number) => {
    setSuggestions((current) => current.map((item) => (
      item.handle === handle
        ? { ...item, isFollowing, followerCount: followerCount >= 0 ? followerCount : item.followerCount }
        : item
    )));
  };

  return (
    <aside className="hidden h-full w-[350px] shrink-0 space-y-4 overflow-y-auto py-3 ps-6 lg:block">
      <form
        role="search"
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();
          openSearch(term.trim());
        }}
      >
        <HugeiconsIcon
          icon={Search01Icon}
          className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]"
        />
        <input
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={t('community.search.placeholder')}
          aria-label={t('community.search.placeholder')}
          className="w-full rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] py-2.5 pe-4 ps-11 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-hidden transition-colors focus:border-[var(--primary-accent)] focus:ring-1 focus:ring-[var(--primary-accent)]"
        />
      </form>

      <section className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] p-4">
        <h2 className="text-base font-bold text-[var(--text-primary)] mb-3 px-1">{t('community.trends.title')}</h2>
        {isLoaded && trends.length === 0 ? (
          <p className="py-2 text-xs text-[var(--text-secondary)] px-1">{t('community.trends.empty')}</p>
        ) : null}
        <ul className="flex flex-wrap gap-2">
          {trends.map((trend) => {
            const isSelected = selectedTags.includes(trend.tag.toLowerCase());
            return (
              <li key={trend.tag}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  title={t('community.trends.postCount', { count: formatNumber(trend.postCount) })}
                  className={cn('trend-pill', isSelected && 'is-selected')}
                  onClick={() => toggleTag(trend.tag)}
                >
                  <span className="trend-pill-tag">#{trend.displayTag || trend.tag}</span>
                  <span className="trend-pill-count">{formatNumber(trend.postCount)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold text-[var(--text-primary)] px-1">{t('community.suggestions.title')}</h2>
        {isLoaded && suggestions.length === 0 ? (
          <p className="rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] p-4 text-xs text-[var(--text-secondary)]">{t('community.suggestions.empty')}</p>
        ) : null}
        <ul className="space-y-2">
          {suggestions.map((suggestion) => (
            <li key={suggestion.id} className="flex items-center gap-3 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] p-3 transition-colors hover:bg-[var(--bg-card-hover)]">
              <CommunityAvatar
                handle={suggestion.handle}
                displayName={suggestion.displayName}
                avatarUrl={suggestion.avatarUrl}
                onClick={() => openProfile(suggestion.handle)}
              />
              <button
                type="button"
                className="min-w-0 flex-1 text-start"
                onClick={() => openProfile(suggestion.handle)}
              >
                <span className="block truncate text-sm font-bold text-[var(--text-primary)]">
                  {suggestion.displayName || suggestion.handle}
                </span>
                <span className="block truncate text-xs text-[var(--text-secondary)]">@{suggestion.handle}</span>
              </button>
              <CommunityFollowButton
                handle={suggestion.handle}
                isFollowing={suggestion.isFollowing}
                onChange={(isFollowing, followerCount) => updateSuggestion(suggestion.handle, isFollowing, followerCount)}
              />
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
