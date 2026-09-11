import { useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Search01Icon } from '@hugeicons/core-free-icons';
import { useLocale } from '@/contexts/LocaleContext';
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
  const { openHashtag, openProfile, openSearch } = useCommunity();
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
    <aside className="sticky top-[104px] hidden h-[calc(100vh-104px)] h-[calc(100dvh-104px)] w-[350px] shrink-0 space-y-4 overflow-y-auto py-3 ps-6 lg:block">
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
          className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-[#737373]"
        />
        <input
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={t('community.search.placeholder')}
          aria-label={t('community.search.placeholder')}
          className="w-full rounded-full border border-transparent bg-[#F5F5F5] py-2.5 pe-4 ps-11 text-[15px] outline-none transition-colors focus:border-[#D93A3A] focus:bg-white"
        />
      </form>

      <section className="rounded-2xl bg-[#FAFAFA]">
        <h2 className="px-4 pt-4 text-xl font-bold text-[#171717]">{t('community.trends.title')}</h2>
        {isLoaded && trends.length === 0 ? (
          <p className="px-4 py-4 text-sm text-[#737373]">{t('community.trends.empty')}</p>
        ) : null}
        <ul>
          {trends.map((trend) => (
            <li key={trend.tag}>
              <button
                type="button"
                className="w-full px-4 py-3 text-start transition-colors hover:bg-[#F0F0F0]"
                onClick={() => openHashtag(trend.tag)}
              >
                <span className="block text-[15px] font-semibold text-[#171717]">#{trend.displayTag || trend.tag}</span>
                <span className="block text-sm text-[#737373]">
                  {t('community.trends.postCount', { count: formatNumber(trend.postCount) })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl bg-[#FAFAFA] pb-2">
        <h2 className="px-4 pt-4 text-xl font-bold text-[#171717]">{t('community.suggestions.title')}</h2>
        {isLoaded && suggestions.length === 0 ? (
          <p className="px-4 py-4 text-sm text-[#737373]">{t('community.suggestions.empty')}</p>
        ) : null}
        <ul>
          {suggestions.map((suggestion) => (
            <li key={suggestion.id} className="flex items-center gap-3 px-4 py-3">
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
                <span className="block truncate text-sm font-semibold text-[#171717]">
                  {suggestion.displayName || suggestion.handle}
                </span>
                <span className="block truncate text-sm text-[#737373]">@{suggestion.handle}</span>
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
