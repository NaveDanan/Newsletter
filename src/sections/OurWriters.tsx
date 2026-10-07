import { useMemo } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
import { useSiteWriters } from '@/hooks/useSiteWriters';
import { initials } from '@/lib/avatar';
import { preloadRoute } from '@/lib/preload-route';
import { communityProfilePath } from '@/lib/community-routes';
import type { Newsletter } from '@/types/newsletter';

interface OurWritersProps {
  newsletters: Newsletter[];
  onArticleClick: (article: Newsletter) => void;
  onNavigate: (pathname: string) => void;
}

function publishedTime(newsletter: Newsletter): number {
  const parsed = Date.parse(newsletter.publishedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * The homepage "Our Writers" row. Membership is curated by an admin in
 * Manage -> Community; the row stays hidden until someone is on it.
 */
export function OurWriters({ newsletters, onArticleClick, onNavigate }: OurWritersProps) {
  const { t } = useLocale();
  const { writers } = useSiteWriters();

  const entries = useMemo(() => writers.map((writer) => {
    const normalizedName = writer.name.toLowerCase();
    // Matching on the author name covers newsletters imported before
    // createdById was recorded; an owned newsletter only matches its owner.
    const latestArticle = newsletters
      .filter((newsletter) => (newsletter.createdById
        ? newsletter.createdById === writer.id
        : normalizedName !== '' && newsletter.author.trim().toLowerCase() === normalizedName))
      .reduce<Newsletter | null>((latest, newsletter) => (
        !latest || publishedTime(newsletter) > publishedTime(latest) ? newsletter : latest
      ), null);

    return { writer, latestArticle };
  }), [newsletters, writers]);

  if (entries.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3" aria-labelledby="our-writers-title">
      <h2 id="our-writers-title" className="section-header-title text-sm font-bold text-[var(--text-primary)]">
        {t('writers.title')}
      </h2>
      <div className="stories-scroll-container">
        {entries.map(({ writer, latestArticle }, index) => {
          const name = writer.name || t('writers.unnamed');
          const firstName = name.split(/\s+/)[0] || name;
          const label = latestArticle
            ? t('writers.openArticle', { name })
            : writer.handle
              ? t('writers.openProfile', { name })
              : t('writers.nothingYet', { name });

          return (
            <button
              key={writer.id}
              type="button"
              className={`story-item rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-accent)] disabled:cursor-default ${index === 0 ? 'active-story' : ''}`}
              disabled={!latestArticle && !writer.handle}
              title={label}
              aria-label={label}
              onPointerEnter={() => preloadRoute(latestArticle ? `/article/${encodeURIComponent(latestArticle.id)}` : communityProfilePath(writer.handle))}
              onFocus={() => preloadRoute(latestArticle ? `/article/${encodeURIComponent(latestArticle.id)}` : communityProfilePath(writer.handle))}
              onClick={() => {
                if (latestArticle) {
                  onArticleClick(latestArticle);
                } else if (writer.handle) {
                  onNavigate(communityProfilePath(writer.handle));
                }
              }}
            >
              <span className="story-avatar-squircle block">
                {writer.avatarUrl ? (
                  <img src={writer.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-sm font-bold text-[var(--primary-accent)]">
                    {initials(name)}
                  </span>
                )}
              </span>
              <span className="story-name max-w-[64px] truncate text-[11px] font-medium text-[var(--text-primary)]">
                {firstName}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}