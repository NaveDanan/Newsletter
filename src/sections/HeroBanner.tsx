import { memo } from 'react';
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';
import type { Newsletter } from '../types/newsletter';

interface HeroBannerProps {
  featuredNewsletter: Newsletter | null;
  onArticleClick?: (newsletter: Newsletter) => void;
  onArticleIntent?: (newsletter: Newsletter) => void;
}

export const HeroBanner = memo(function HeroBanner({ featuredNewsletter, onArticleClick, onArticleIntent }: HeroBannerProps) {
  const { formatDate, isRTL, t } = useLocale();

  const heroTitle = featuredNewsletter?.title ?? t('hero.defaultTitle');
  const heroSubtitle = featuredNewsletter?.subtitle ?? t('hero.defaultSubtitle');
  const heroImage = featuredNewsletter?.coverImage || '/hero_city_bg.jpg';
  const heroMeta = featuredNewsletter
    ? `${formatDate(featuredNewsletter.publishedAt, { month: 'long', day: 'numeric', year: 'numeric' })} · ${featuredNewsletter.author} · ${featuredNewsletter.readTime}`
    : t('hero.defaultMeta');

  return (
    <section id="features" onPointerEnter={() => featuredNewsletter && onArticleIntent?.(featuredNewsletter)} onFocus={() => featuredNewsletter && onArticleIntent?.(featuredNewsletter)} className="relative overflow-hidden mb-8 mx-auto w-full max-w-[1120px]">
      <div className="hero-gradient rounded-3xl border border-[var(--border-subtle)] shadow-[var(--shadow-card)] p-5 sm:p-6 lg:p-7 relative overflow-hidden transition-all">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(15)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1.5 h-1.5 bg-[var(--primary-accent)]/30 rounded-full animate-float"
              style={{
                left: `${(i * 19 + 7) % 95}%`,
                top: `${(i * 29 + 13) % 90}%`,
                animationDelay: `${(i % 5) * 0.8}s`,
                animationDuration: `${4 + (i % 4)}s`,
              }}
            />
          ))}
        </div>

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-4 items-center">
          <div className="lg:col-span-6 flex flex-col items-start text-start">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[var(--primary-accent)] text-[var(--accent-contrast)] text-xs font-bold rounded-full mb-4 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              {featuredNewsletter ? t('hero.latestNewsletter') : t('hero.latest')}
            </span>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[var(--text-primary)] leading-tight mb-4 tracking-tight" dir="auto">
              {heroTitle}
            </h1>
            <p className="text-[var(--text-secondary)] text-sm sm:text-base mb-6 max-w-xl leading-relaxed" dir="auto">
              {heroSubtitle}
            </p>
            <div className="flex flex-wrap items-center gap-4">
              {featuredNewsletter ? (
                <button
                  onClick={() => onArticleClick?.(featuredNewsletter)}
                  className="btn-hire-me inline-flex items-center gap-2 text-sm"
                >
                  <span>{t('hero.readNewsletter')}</span>
                  <HugeiconsIcon icon={ArrowRight01Icon} className={cn('h-4 w-4', isRTL && 'rtl-rotate-180')} />
                </button>
              ) : null}
              <div className="text-xs sm:text-sm text-[var(--text-muted)] font-medium">
                <span>{heroMeta}</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 relative">
            <div className="post-media-frame relative md:aspect-video rounded-2xl overflow-hidden shadow-2xl border border-[var(--border-subtle)] group cursor-pointer" onClick={() => featuredNewsletter && onArticleClick?.(featuredNewsletter)}>
              <img
                fetchPriority="high"
                decoding="async"
                src={heroImage}
                alt={featuredNewsletter?.title ?? t('hero.imageAlt')}
                className="w-full h-[300px] md:h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />

              <div className="absolute bottom-3 inset-x-3">
                <div className="bg-[var(--bg-card)]/90 backdrop-blur-md rounded-xl p-2.5 border border-[var(--border-subtle)] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <img
                      src="/logo.gif"
                      alt="AI-BREAK"
                      className="w-8 h-8 object-contain rounded-lg bg-[var(--bg-app)] p-0.5"
                    />
                    <div>
                      <p className="text-xs font-bold text-[var(--text-primary)] leading-tight">{t('hero.brandLabel')}</p>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        {featuredNewsletter?.tags[0] ?? t('hero.brandTagline')}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-[var(--primary-accent)] bg-[var(--primary-accent)]/10 px-2 py-0.5 rounded-full">
                    Featured
                  </span>
                </div>
              </div>
            </div>

            <div className="absolute -top-4 -right-4 w-24 h-24 bg-[var(--primary-accent-glow)] rounded-full blur-2xl pointer-events-none" />
          </div>
        </div>
      </div>
    </section>
  );
});
