import { HugeiconsIcon } from "@hugeicons/react";
import { Heart, Message01Icon, PlayIcon, Share02Icon } from "@hugeicons/core-free-icons";
import { useState } from 'react';
import type { Newsletter } from '../types/newsletter';

const tabs = ['Latest', 'Top', 'Discussions'];

interface LatestArticlesProps {
  newsletters: Newsletter[];
  onArticleClick?: (newsletter: Newsletter) => void;
}

export function LatestArticles({ newsletters, onArticleClick }: LatestArticlesProps) {
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
      case 'Latest':
      default:
        return newsletters;
    }
  })();

  if (newsletters.length === 0) {
    return (
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-[#171717]">Latest Articles</h2>
        </div>
        <div className="text-center py-12 bg-[#F9FAFB] rounded-xl">
          <p className="text-[#737373]">No articles published yet.</p>
        </div>
      </section>
    );
  }

  return (
    <section id="latest">
      {/* Tabs */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-1 bg-[#F3F4F6] rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`tab-button ${activeTab === tab ? 'active' : ''}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Articles list */}
      <div className="space-y-6">
        {filteredArticles.map((article) => (
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
                  <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                    <HugeiconsIcon icon={PlayIcon} className="w-3 h-3 fill-white" />
                    {article.audioDuration}
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="sm:col-span-2 p-5">
                <h3 className="font-semibold text-lg text-[#171717] mb-2 group-hover:text-[#D93A3A] transition-colors">
                  {article.title}
                </h3>
                <p className="text-[#737373] text-sm mb-4 line-clamp-2">
                  {article.subtitle}
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-[#737373]">
                    <span>{new Date(article.publishedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}</span>
                    <span>·</span>
                    <span>{article.author}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="engagement-stat">
                      <HugeiconsIcon icon={Message01Icon} className="w-4 h-4" />
                      {article.comments.toLocaleString()}
                    </span>
                    <span className="engagement-stat">
                      <HugeiconsIcon icon={Heart} className="w-4 h-4" />
                      {article.likes}
                    </span>
                    <span className="engagement-stat">
                      <HugeiconsIcon icon={Share02Icon} className="w-4 h-4" />
                      {article.shares}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
