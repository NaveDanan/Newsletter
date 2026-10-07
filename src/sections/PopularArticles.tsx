import { memo } from 'react';
import { HugeiconsIcon } from "@hugeicons/react";
import { Heart, Message01Icon, Share02Icon } from "@hugeicons/core-free-icons";
import { useLocale } from '@/contexts/LocaleContext';
import type { Newsletter } from '../types/newsletter';

interface PopularArticlesProps {
  newsletters: Newsletter[];
  onArticleClick?: (newsletter: Newsletter) => void;
  onArticleIntent?: (newsletter: Newsletter) => void;
}

export const PopularArticles = memo(function PopularArticles({ newsletters, onArticleClick, onArticleIntent }: PopularArticlesProps) {
  const { formatDate, formatNumber, t } = useLocale();
  const articles = [...newsletters]
    .sort((a, b) => (b.likes + b.comments + b.shares) - (a.likes + a.comments + a.shares))
    .slice(0, 4);

  if (articles.length === 0) {
    return null;
  }

  return (
    <section id="case-studies" className="mb-10">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] tracking-tight">
          {t('popular.title')}
        </h2>
        <a 
          href="#workflows" 
          className="text-xs sm:text-sm font-semibold text-[var(--primary-accent)] hover:underline flex items-center gap-1"
        >
          {t('popular.viewAll')}
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        {articles.map((article) => (
          <article
            key={article.id}
              onClick={() => onArticleClick?.(article)}
              onPointerEnter={() => onArticleIntent?.(article)}
              onFocus={() => onArticleIntent?.(article)}
            className="feed-post-card group cursor-pointer p-4 sm:p-5"
          >
            <div className="flex gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] font-semibold text-[var(--primary-accent)]">
                    {formatDate(article.publishedAt, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <span className="text-[var(--text-muted)] text-xs">•</span>
                  <span className="text-[11px] font-medium text-[var(--text-muted)] truncate">
                    {article.author}
                  </span>
                </div>
                <h3 
                  className="font-bold text-[var(--text-primary)] leading-snug mb-3 group-hover:text-[var(--primary-accent)] transition-colors line-clamp-2 text-sm sm:text-base" 
                  dir="auto"
                >
                  {article.title}
                </h3>
                <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
                  <span className="inline-flex items-center gap-1.5 hover:text-[var(--text-primary)] transition-colors">
                    <HugeiconsIcon icon={Message01Icon} className="w-3.5 h-3.5" />
                    {formatNumber(article.comments)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[var(--primary-accent)] font-medium">
                    <HugeiconsIcon icon={Heart} className="w-3.5 h-3.5 fill-current" />
                    {formatNumber(article.likes)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 hover:text-[var(--text-primary)] transition-colors">
                    <HugeiconsIcon icon={Share02Icon} className="w-3.5 h-3.5" />
                    {formatNumber(article.shares)}
                  </span>
                </div>
              </div>
              <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-2xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-card-alt)]">
                <img
                  loading="lazy"
                  decoding="async"
                  src={article.coverImage}
                  alt={article.title}
                  className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-500"
                />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
});
