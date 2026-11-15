import { HugeiconsIcon } from "@hugeicons/react";
import { Heart, Message01Icon, PlayIcon, Share02Icon } from "@hugeicons/core-free-icons";
import { memo, useEffect, useRef } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useTheme } from '@/context/ThemeContext';
import type { NewsletterFeedTab } from '@/lib/pocketbase/newsletter-feed';
import { useLocale } from '@/contexts/LocaleContext';
import { UserAvatarCircle } from '@/components/UserAvatarCircle';
import { cn } from '@/lib/utils';
import type { Newsletter } from '../types/newsletter';

interface LatestArticlesProps {
  newsletters: Newsletter[];
  activeTab: NewsletterFeedTab;
  onTabChange: (tab: NewsletterFeedTab) => void;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  onLoadMore: () => void;
  onRetry: () => void;
  emptyMessage?: string;
  onArticleClick?: (newsletter: Newsletter) => void;
  onArticleIntent?: (newsletter: Newsletter) => void;
}

export const LatestArticles = memo(function LatestArticles({ newsletters, activeTab, onTabChange, isLoading, isLoadingMore, hasMore, error, onLoadMore, onRetry, emptyMessage, onArticleClick, onArticleIntent }: LatestArticlesProps) {
  const { formatDate, formatNumber, isRTL, t } = useLocale();
  const { deviceMode } = useTheme();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const tabs: { key: NewsletterFeedTab; label: string }[] = [
    { key: 'latest', label: t('latest.tab.latest') },
    { key: 'top', label: t('latest.tab.top') },
    { key: 'discussions', label: t('latest.tab.discussions') },
    { key: 'bookmarks', label: t('latest.tab.bookmarks') },
  ];
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || isLoading || isLoadingMore || error || typeof IntersectionObserver === 'undefined') return;
    const container = node.closest('#app-inner-scroll');
    const root = container && /(auto|scroll)/.test(window.getComputedStyle(container).overflowY) ? container : null;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) onLoadMore();
    }, { root, rootMargin: '0px 0px 600px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [activeTab, deviceMode, error, hasMore, isLoading, isLoadingMore, newsletters.length, onLoadMore]);

  return (
    <section id="workflows" className="space-y-6">
      {/* Segmented Filter Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 bg-[var(--bg-card)] p-1.5 rounded-full border border-[var(--border-subtle)] shadow-xs overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              aria-pressed={activeTab === tab.key}
              className={`tab-button text-xs sm:text-sm whitespace-nowrap ${activeTab === tab.key ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Articles Feed */}
      <div className="space-y-6">
        {isLoading && newsletters.length === 0 ? (
          <div role="status" aria-label={t('latest.loading')} className="space-y-6">
            {[0, 1, 2].map(index => (
              <div key={index} className="feed-post-card space-y-4" aria-hidden="true">
                <Skeleton className="h-10 w-40" />
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-48 w-full rounded-2xl" />
              </div>
            ))}
          </div>
        ) : newsletters.length === 0 && !error ? (
          <div className="text-center py-12 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)]">
            <p className="text-[var(--text-secondary)]">{emptyMessage ?? t(activeTab === 'bookmarks' ? 'latest.noBookmarks' : 'latest.empty')}</p>
          </div>
        ) : (
          newsletters.map((article) => (
            <article
              key={article.id}
              className="feed-post-card group cursor-pointer transition-all [content-visibility:auto] [contain-intrinsic-size:auto_600px]"
              onClick={() => onArticleClick?.(article)}
              onPointerEnter={() => onArticleIntent?.(article)}
              onFocus={() => onArticleIntent?.(article)}
            >
              {/* Post Author Header */}
              <div className="post-header flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <UserAvatarCircle
                    name={article.author}
                    src={article.authorAvatar}
                    size={44}
                    className="shadow-xs"
                  />
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-[var(--text-primary)] group-hover:text-[var(--primary-accent)] transition-colors">
                        {article.author}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                      <span className="font-semibold text-[var(--primary-accent)]">
                        {formatDate(article.publishedAt, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                      <span>•</span>
                      <span>{article.readTime}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {article.tags[0] && (
                    <span className="skill-tag hidden sm:inline-block">
                      {article.tags[0]}
                    </span>
                  )}
                </div>
              </div>

              {/* Title & Subtitle */}
              <div>
                <h3 className="font-extrabold text-base sm:text-lg text-[var(--text-primary)] mb-1.5 leading-snug group-hover:text-[var(--primary-accent)] transition-colors" dir="auto">
                  {article.title}
                </h3>
                <p className="text-xs sm:text-sm text-[var(--text-secondary)] line-clamp-2 leading-relaxed" dir="auto">
                  {article.subtitle || article.excerpt}
                </p>
              </div>

              {/* Newsletter cover */}
              <div className="post-media-frame relative h-48 md:h-auto md:aspect-video rounded-2xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-app)]">
                <img
                  loading="lazy"
                  decoding="async"
                  src={article.coverImage}
                  alt={article.title}
                  className="w-full h-full object-cover group-hover:scale-104 transition-transform duration-500"
                />

                {article.hasAudio && (
                  <div className={cn('absolute bottom-3 flex items-center gap-2 bg-black/80 backdrop-blur-md text-white text-xs px-3 py-1.5 rounded-full border border-white/10 shadow-lg', isRTL ? 'right-3' : 'left-3')}>
                    <HugeiconsIcon icon={PlayIcon} className="w-3.5 h-3.5 fill-white" />
                    <span>{article.audioDuration}</span>
                  </div>
                )}
              </div>

              {/* Post Interaction Row */}
              <div className="post-actions-row flex items-center justify-between pt-1">
                <div className="flex items-center gap-4 sm:gap-6">
                  <button
                    type="button"
                    className="action-icon-btn liked text-[var(--primary-accent)] flex items-center gap-1.5 text-xs font-semibold"
                    onClick={(e) => {
                      e.stopPropagation();
                      onArticleClick?.(article);
                    }}
                  >
                    <HugeiconsIcon icon={Heart} className="w-4 h-4 fill-current" />
                    <span>{formatNumber(article.likes)}</span>
                  </button>

                  <button
                    type="button"
                    className="action-icon-btn flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    onClick={(e) => {
                      e.stopPropagation();
                      onArticleClick?.(article);
                    }}
                  >
                    <HugeiconsIcon icon={Message01Icon} className="w-4 h-4" />
                    <span>{formatNumber(article.comments)}</span>
                  </button>

                  <button
                    type="button"
                    className="action-icon-btn flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <HugeiconsIcon icon={Share02Icon} className="w-4 h-4" />
                    <span>{formatNumber(article.shares)}</span>
                  </button>
                </div>

                <button
                  type="button"
                  className="btn-hire-me text-xs py-2 px-5"
                  onClick={(e) => {
                    e.stopPropagation();
                    onArticleClick?.(article);
                  }}
                >
                  {t('hero.readNewsletter')}
                </button>
              </div>
            </article>
          ))
        )}
      </div>
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />
      {isLoadingMore ? (
        <p role="status" className="py-4 text-center text-sm text-[var(--text-secondary)]">{t('latest.loadingMore')}</p>
      ) : null}
      {error ? (
        <div role="alert" className="space-y-3 py-4 text-center">
          <p className="text-sm text-[var(--text-secondary)]">{t('latest.loadFailed')}</p>
          <button type="button" className="btn-hire-me text-xs py-2 px-5" onClick={onRetry}>{t('latest.retry')}</button>
        </div>
      ) : hasMore && !isLoading && !isLoadingMore ? (
        <div className="py-4 text-center">
          <button type="button" className="btn-hire-me text-xs py-2 px-5" onClick={onLoadMore}>{t('latest.loadMore')}</button>
        </div>
      ) : null}
    </section>
  );
});
