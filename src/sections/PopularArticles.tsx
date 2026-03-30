import { HugeiconsIcon } from "@hugeicons/react";
import { Heart, Message01Icon, Share02Icon } from "@hugeicons/core-free-icons";
import type { Newsletter } from '../types/newsletter';

interface PopularArticlesProps {
  newsletters: Newsletter[];
  onArticleClick?: (newsletter: Newsletter) => void;
}

export function PopularArticles({ newsletters, onArticleClick }: PopularArticlesProps) {
  const articles = [...newsletters]
    .sort((a, b) => (b.likes + b.comments + b.shares) - (a.likes + a.comments + a.shares))
    .slice(0, 4);

  if (articles.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-[#171717]">Most Popular</h2>
        <a href="#latest" className="text-sm font-medium text-[#D93A3A] hover:underline">
          View all
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {articles.map((article) => (
          <article
            key={article.id}
            onClick={() => onArticleClick?.(article)}
            className="card-article group cursor-pointer"
          >
            <div className="flex gap-4 p-4">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[#171717] leading-snug mb-2 group-hover:text-[#D93A3A] transition-colors line-clamp-2">
                  {article.title}
                </h3>
                <p className="article-meta mb-3">
                  {new Date(article.publishedAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })} · {article.author}
                </p>
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
              <div className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden">
                <img
                  src={article.coverImage}
                  alt={article.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
