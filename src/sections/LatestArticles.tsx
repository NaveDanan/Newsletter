import { HugeiconsIcon } from "@hugeicons/react";
import { Heart, Message01Icon, PlayIcon, Share02Icon } from "@hugeicons/core-free-icons";
import { useState } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
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
          <h2 className="text-xl font-bold text-[#171717]">{t('latest.title')}</h2>
        </div>
        <div className="text-center py-12 bg-[#F9FAFB] rounded-xl">
          <p className="text-[#737373]">{t('latest.empty')}</p>
        </div>
      </section>
    );
  }

  return (
    <section id="workflows">
      {/* Tabs */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-1 bg-[#F3F4F6] rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`tab-button ${activeTab === tab.key ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Articles list */}
      <div className="space-y-6">
        {filteredArticles.length === 0 && activeTab === 'Bookmarks' ? (
          <div className="text-center py-12 bg-[#F9FAFB] rounded-xl">
            <p className="text-[#737373]">{t('latest.noBookmarks')}</p>
          </div>
        ) : (
        filteredArticles.map((article) => (
          <article
            key={article.id}
            onClick={() => onArticleClick?.(article)}
            className="card-article group cursor-pointer overflow-hidden"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-0">
              {/* Image */}
              <div className="relative sm:col-span-1 h-48 sm:h-auto">
                <img
                  src={article.coverImage}
                  alt={article.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                {article.hasAudio && (
                  <div className={cn('absolute bottom-3 flex items-center gap-2 bg-black/70 text-white text-xs px-2 py-1 rounded', isRTL ? 'right-3' : 'left-3')}>
                    <HugeiconsIcon icon={PlayIcon} className="w-3 h-3 fill-white" />
                    {article.audioDuration}
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="sm:col-span-2 p-5">
                <h3 className="font-semibold text-lg text-[#171717] mb-2 group-hover:text-[#D93A3A] transition-colors" dir="auto">
                  {article.title}
                </h3>
                <p className="text-[#737373] text-sm mb-4 line-clamp-2" dir="auto">
                  {article.subtitle}
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-[#737373]">
                    <span>{formatDate(article.publishedAt, {
                      month: 'short',
                      day: 'numeric',
                    })}</span>
                    <span>·</span>
                    <span>{article.author}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="engagement-stat">
                      <HugeiconsIcon icon={Message01Icon} className="w-4 h-4" />
                      {formatNumber(article.comments)}
                    </span>
                    <span className="engagement-stat">
                      <HugeiconsIcon icon={Heart} className="w-4 h-4" />
                      {formatNumber(article.likes)}
                    </span>
                    <span className="engagement-stat">
                      <HugeiconsIcon icon={Share02Icon} className="w-4 h-4" />
                      {formatNumber(article.shares)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </article>
        ))
        )}
      </div>
    </section>
  );
}
