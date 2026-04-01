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
    <section id="features" ref={bannerRef} className="relative overflow-hidden">
      <div className="hero-gradient min-h-[400px] lg:min-h-[450px] relative">
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-white/20 rounded-full animate-float"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 4}s`,
                animationDuration: `${4 + Math.random() * 4}s`,
              }}
            />
          ))}
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            <div ref={contentRef} className="relative z-10">
              <span className="inline-block px-3 py-1 bg-[#D93A3A] text-white text-xs font-semibold rounded mb-4">
                {featuredNewsletter ? t('hero.latestNewsletter') : t('hero.latest')}
              </span>
              <h1 className="text-3xl lg:text-4xl xl:text-5xl font-bold text-white leading-tight mb-4" dir="auto">
                {heroTitle}
              </h1>
              <p className="text-white/80 text-lg mb-6 max-w-lg" dir="auto">
                {heroSubtitle}
              </p>
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                {featuredNewsletter ? (
                  <button
                    onClick={() => onArticleClick?.(featuredNewsletter)}
                    className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#171717] transition-colors hover:bg-white/90"
                  >
                    {t('hero.readNewsletter')}
                    <HugeiconsIcon icon={ArrowRight01Icon} className={cn('h-4 w-4', isRTL && 'rtl-rotate-180')} />
                  </button>
                ) : null}
                <div className="text-white/70 text-sm">
                  <span className="text-white font-medium">{heroMeta}</span>
                </div>
              </div>
            </div>

            <div ref={imageRef} className="relative">
              <div className="relative rounded-xl overflow-hidden shadow-2xl">
                <img
                  src={heroImage}
                  alt={featuredNewsletter?.title ?? t('hero.imageAlt')}
                  className="w-full h-[250px] lg:h-[320px] object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />

                <div className="absolute bottom-4 left-4 right-4">
                  <div className="bg-white/90 backdrop-blur-sm rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <img
                        src="/logo.gif"
                        alt="AI Maor Break"
                        className="w-10 h-10 object-contain"
                      />
                      <div>
                        <p className="text-sm font-medium text-[#171717]">{t('hero.brandLabel')}</p>
                        <p className="text-xs text-[#737373]">
                          {featuredNewsletter?.tags[0] ?? t('hero.brandTagline')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute -top-4 -right-4 w-20 h-20 bg-[#D93A3A]/20 rounded-full blur-2xl" />
              <div className="absolute -bottom-4 -left-4 w-16 h-16 bg-white/10 rounded-full blur-xl" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
