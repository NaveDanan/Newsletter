import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';
import type { Newsletter } from '../types/newsletter';

interface HeroBannerProps {
  featuredNewsletter: Newsletter | null;
  onArticleClick?: (newsletter: Newsletter) => void;
}

export function HeroBanner({ featuredNewsletter, onArticleClick }: HeroBannerProps) {
  const { formatDate, isRTL, t } = useLocale();
  const bannerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        contentRef.current,
        { opacity: 0, x: isRTL ? 30 : -30 },
        { opacity: 1, x: 0, duration: 0.8, ease: 'power3.out', delay: 0.3 }
      );

      gsap.fromTo(
        imageRef.current,
        { opacity: 0, x: isRTL ? -30 : 30 },
        { opacity: 1, x: 0, duration: 0.8, ease: 'power3.out', delay: 0.5 }
      );
    }, bannerRef);

    return () => ctx.revert();
  }, [isRTL]);
  const heroTitle = featuredNewsletter?.title ?? t('hero.defaultTitle');
  const heroSubtitle = featuredNewsletter?.subtitle ?? t('hero.defaultSubtitle');
  const heroImage = featuredNewsletter?.coverImage || '/hero_city_bg.jpg';
  const heroMeta = featuredNewsletter
    ? `${formatDate(featuredNewsletter.publishedAt, { month: 'long', day: 'numeric', year: 'numeric' })} · ${featuredNewsletter.author} · ${featuredNewsletter.readTime}`
    : t('hero.defaultMeta');

  return (
    <section id="features" ref={bannerRef} className="relative overflow-hidden mb-8 mx-auto w-full max-w-[1120px]">
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
          <div ref={contentRef} className="lg:col-span-6 flex flex-col items-start text-start">
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

          <div ref={imageRef} className="lg:col-span-6 relative">
            <div className="post-media-frame relative rounded-2xl overflow-hidden shadow-2xl border border-[var(--border-subtle)] group cursor-pointer" onClick={() => featuredNewsletter && onArticleClick?.(featuredNewsletter)}>
              <img
                src={heroImage}
                alt={featuredNewsletter?.title ?? t('hero.imageAlt')}
                className="w-full h-[300px] sm:h-[360px] lg:h-[420px] object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />

              {/* Decorative Glass Shatter Overlay from Reference */}
              <svg className="shatter-glass-overlay" viewBox="0 0 900 460" preserveAspectRatio="none">
                <line x1="0" y1="120" x2="900" y2="340" stroke="#fff" strokeWidth="2" opacity="0.4" />
                <line x1="280" y1="0" x2="620" y2="460" stroke="#fff" strokeWidth="2.5" opacity="0.5" />
                <line x1="290" y1="10" x2="630" y2="450" stroke="var(--primary-accent)" strokeWidth="1.5" opacity="0.7" />
              </svg>

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
}
