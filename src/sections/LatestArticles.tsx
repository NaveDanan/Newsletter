import { HugeiconsIcon } from "@hugeicons/react";
import { Heart, Message01Icon, PlayIcon, Share02Icon } from "@hugeicons/core-free-icons";
import { useState } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
import { UserAvatarCircle } from '@/components/UserAvatarCircle';
import { cn } from '@/lib/utils';
import type { Newsletter } from '../types/newsletter';

interface LatestArticlesProps {
  newsletters: Newsletter[];
  currentUserId?: string;
  onArticleClick?: (newsletter: Newsletter) => void;
}

export function LatestArticles({ newsletters, currentUserId, onArticleClick }: LatestArticlesProps) {
  const { formatDate, formatNumber, isRTL, t } = useLocale();
  const tabs = [
    { key: 'Latest', label: t('latest.tab.latest') },
    { key: 'Top', label: t('latest.tab.top') },
    { key: 'Discussions', label: t('latest.tab.discussions') },
    { key: 'Bookmarks', label: t('latest.tab.bookmarks') },
  ];
  const [activeTab, setActiveTab] = useState('Latest');

  // Filter articles based on active tab
  const filteredArticles = (() => {
    switch (activeTab) {
      case 'Top':
        return [...newsletters].sort((a, b) =>
          (b.likes + b.comments + b.shares) - (a.likes + a.comments + a.shares)
        );
      case 'Discussions':
        return [...newsletters].sort((a, b) => b.comments - a.comments);
      case 'Bookmarks':
        return currentUserId
          ? newsletters.filter((a) => a.bookmarkedByUserIds.includes(currentUserId))
          : [];
      case 'Latest':
      default:
        return newsletters;
    }
  })();

  if (newsletters.length === 0) {
    return (
      <section id="workflows">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">{t('latest.title')}</h2>
        </div>
        <div className="text-center py-12 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)]">
          <p className="text-[var(--text-secondary)]">{t('latest.empty')}</p>
        </div>
      </section>
    );
  }

  return (
    <section id="workflows" className="space-y-6">
      {/* Segmented Filter Tabs */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5 bg-[var(--bg-card)] p-1.5 rounded-full border border-[var(--border-subtle)] shadow-sm overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`tab-button text-xs sm:text-sm whitespace-nowrap ${activeTab === tab.key ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Articles Feed */}
      <div className="space-y-6">
        {filteredArticles.length === 0 && activeTab === 'Bookmarks' ? (
          <div className="text-center py-12 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)]">
            <p className="text-[var(--text-secondary)]">{t('latest.noBookmarks')}</p>
          </div>
        ) : (
          filteredArticles.map((article) => (
            <article
              key={article.id}
              className="feed-post-card group cursor-pointer transition-all"
              onClick={() => onArticleClick?.(article)}
            >
              {/* Post Author Header */}
              <div className="post-header flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <UserAvatarCircle
                    name={article.author}
                    src={article.authorAvatar}
                    size={44}
                    className="shadow-sm"
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

              {/* Media Frame with Shatter Effect Overlay */}
              <div className="post-media-frame relative h-48 sm:h-64 rounded-2xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-app)]">
                <img
                  src={article.coverImage}
                  alt={article.title}
                  className="w-full h-full object-cover group-hover:scale-104 transition-transform duration-500"
                />
                <svg className="shatter-glass-overlay" viewBox="0 0 900 460" preserveAspectRatio="none">
                  <line x1="0" y1="120" x2="900" y2="340" stroke="#fff" strokeWidth="2" opacity="0.4" />
                  <line x1="280" y1="0" x2="620" y2="460" stroke="#fff" strokeWidth="2" opacity="0.4" />
                  <line x1="290" y1="10" x2="630" y2="450" stroke="var(--primary-accent)" strokeWidth="1.2" opacity="0.6" />
                </svg>

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
    </section>
  );
}
