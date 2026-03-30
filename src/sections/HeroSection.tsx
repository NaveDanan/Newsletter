import { HugeiconsIcon } from "@hugeicons/react";
import { AnalyticsUpIcon, ArrowRight01Icon, SparklesIcon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useTheme } from '../context/ThemeContext';

gsap.registerPlugin(ScrollTrigger);

interface HeroSectionProps {
  onExploreTopics: () => void;
}

export function HeroSection({ onExploreTopics }: HeroSectionProps) {
  const { resolvedTheme } = useTheme();
  const sectionRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const subheadlineRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const floatingCardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const card = cardRef.current;
    const headline = headlineRef.current;
    const subheadline = subheadlineRef.current;
    const cta = ctaRef.current;
    const floatingCards = floatingCardsRef.current;

    if (!section || !card || !headline || !subheadline || !cta || !floatingCards) return;

    const ctx = gsap.context(() => {
      // Initial state - hide elements
      gsap.set([card, headline, subheadline, cta], { opacity: 0, y: 30 });
      gsap.set(card, { scale: 0.98 });
      
      const floatingCardElements = floatingCards.querySelectorAll('.floating-card');
      gsap.set(floatingCardElements, { opacity: 0, scale: 0.92 });

      // Auto-play entrance animation
      const entranceTl = gsap.timeline({ delay: 0.2 });

      entranceTl
        .to(card, {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.6,
          ease: 'power3.out'
        })
        .to(headline, {
          opacity: 1,
          y: 0,
          duration: 0.5,
          ease: 'power3.out'
        }, '-=0.3')
        .to(subheadline, {
          opacity: 1,
          y: 0,
          duration: 0.4,
          ease: 'power3.out'
        }, '-=0.25')
        .to(cta, {
          opacity: 1,
          y: 0,
          duration: 0.4,
          ease: 'power3.out'
        }, '-=0.2')
        .to(floatingCardElements, {
          opacity: 1,
          scale: 1,
          duration: 0.5,
          stagger: 0.08,
          ease: 'back.out(1.4)'
        }, '-=0.3');

      // Scroll-driven animation
      const scrollTl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: '+=130%',
          pin: true,
          scrub: 0.6,
          onLeaveBack: () => {
            // Reset to visible when scrolling back
            gsap.to([card, headline, subheadline, cta], { opacity: 1, x: 0, y: 0, scale: 1 });
            gsap.to(floatingCardElements, { opacity: 1, x: 0, y: 0 });
          }
        }
      });

      // Phase 3 (70-100%): Exit
      scrollTl
        .fromTo(card, 
          { x: 0, y: 0, scale: 1, opacity: 1 },
          { x: '-18vw', y: '-6vh', scale: 0.96, opacity: 0, ease: 'power2.in' },
          0.7
        )
        .fromTo(floatingCardElements[0],
          { x: 0, y: 0, opacity: 1 },
          { x: '8vw', y: '-8vh', opacity: 0, ease: 'power2.in' },
          0.7
        )
        .fromTo(floatingCardElements[1],
          { x: 0, y: 0, opacity: 1 },
          { x: '12vw', y: 0, opacity: 0, ease: 'power2.in' },
          0.72
        )
        .fromTo(floatingCardElements[2],
          { x: 0, y: 0, opacity: 1 },
          { x: '-10vw', y: '10vh', opacity: 0, ease: 'power2.in' },
          0.74
        );

    }, section);

    return () => ctx.revert();
  }, []);

  const isDark = resolvedTheme === 'dark';

  return (
    <div 
      ref={sectionRef}
      className="section-pinned flex items-center justify-center"
    >
      {/* Background image */}
      <div 
        className="absolute inset-0 bg-cover bg-center transition-opacity duration-500"
        style={{ backgroundImage: 'url(/hero_city_bg.jpg)' }}
      >
        <div className={`absolute inset-0 transition-colors duration-500 ${
          isDark 
            ? 'bg-gradient-to-b from-[#0B0C10]/35 to-[#0B0C10]/75' 
            : 'bg-gradient-to-b from-white/70 to-white/90'
        }`} />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-10 pt-20">
        <div className="relative">
          {/* Main hero card */}
          <div 
            ref={cardRef}
            className="card-dark p-8 lg:p-12 max-w-4xl mx-auto relative"
          >
            {/* Eyebrow */}
            <div className="font-mono text-xs uppercase tracking-[0.15em] text-[#00b4d8] dark:text-[#00F0FF] mb-6">
              AI-BREAK Newsletter
            </div>

            {/* Headline */}
            <h1 
              ref={headlineRef}
              className="font-display text-4xl sm:text-5xl lg:text-7xl font-bold text-[#0f172a] dark:text-[#F5F7FF] leading-tight mb-6"
            >
              Stay ahead of<br />
              <span className="text-[#00b4d8] dark:text-[#00F0FF]">what&apos;s next.</span>
            </h1>

            {/* Subheadline */}
            <p 
              ref={subheadlineRef}
              className="text-lg lg:text-xl text-[#64748b] dark:text-[#A7B0C8] max-w-xl mb-8"
            >
              Curated AI developments, product launches, and research—delivered weekly.
            </p>

            {/* CTAs */}
            <div ref={ctaRef} className="flex flex-wrap gap-4">
              <button className="btn-primary flex items-center gap-2">
                Get the newsletter
                <HugeiconsIcon icon={ArrowRight01Icon} className="w-4 h-4" />
              </button>
              <button 
                onClick={onExploreTopics}
                className="btn-secondary"
              >
                Explore topics
              </button>
            </div>
          </div>

          {/* Floating cards */}
          <div ref={floatingCardsRef} className="hidden lg:block">
            {/* Card A - top right */}
            <div 
              className="floating-card card-dark absolute -top-4 right-0 w-56 h-32 p-4 animate-float"
              style={{ animationDelay: '0s' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <HugeiconsIcon icon={SparklesIcon} className="w-4 h-4 text-[#00b4d8] dark:text-[#00F0FF]" />
                <span className="font-mono text-xs text-[#64748b] dark:text-[#A7B0C8] uppercase">Latest</span>
              </div>
              <div className="text-sm text-[#0f172a] dark:text-[#F5F7FF]">GPT-5 rumors and what to expect</div>
            </div>

            {/* Card B - mid right */}
            <div 
              className="floating-card card-dark absolute top-1/2 -right-8 w-52 h-28 p-4 animate-float"
              style={{ animationDelay: '0.5s' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <HugeiconsIcon icon={AnalyticsUpIcon} className="w-4 h-4 text-[#00b4d8] dark:text-[#00F0FF]" />
                <span className="font-mono text-xs text-[#64748b] dark:text-[#A7B0C8] uppercase">Trending</span>
              </div>
              <div className="text-sm text-[#0f172a] dark:text-[#F5F7FF]">AI agents hit mainstream</div>
            </div>

            {/* Card C - bottom left */}
            <div 
              className="floating-card card-dark absolute -bottom-8 left-0 w-60 h-36 p-4 animate-float"
              style={{ animationDelay: '1s' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <HugeiconsIcon icon={UserGroupIcon} className="w-4 h-4 text-[#00b4d8] dark:text-[#00F0FF]" />
                <span className="font-mono text-xs text-[#64748b] dark:text-[#A7B0C8] uppercase">Community</span>
              </div>
              <div className="text-sm text-[#0f172a] dark:text-[#F5F7FF]">Trusted by 12,000+ builders worldwide</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
