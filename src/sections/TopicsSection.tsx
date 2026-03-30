import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, BookOpen01Icon, RocketIcon, Shield01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);

export function TopicsSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const megaCardRef = useRef<HTMLDivElement>(null);
  const rightCardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const megaCard = megaCardRef.current;
    const rightCards = rightCardsRef.current;

    if (!section || !megaCard || !rightCards) return;

    const ctx = gsap.context(() => {
      const rightCardElements = rightCards.querySelectorAll('.topic-card');
      const accentLines = section.querySelectorAll('.accent-line');

      const scrollTl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: '+=130%',
          pin: true,
          scrub: 0.6,
        }
      });

      // Phase 1 - ENTRANCE (0-30%)
      scrollTl
        .fromTo(megaCard,
          { x: '-60vw', scale: 0.96, opacity: 0 },
          { x: 0, scale: 1, opacity: 1, ease: 'none' },
          0
        )
        .fromTo(rightCardElements,
          { x: '55vw', y: '6vh', opacity: 0 },
          { x: 0, y: 0, opacity: 1, stagger: 0.03, ease: 'none' },
          0.06
        )
        .fromTo(accentLines,
          { scaleX: 0 },
          { scaleX: 1, stagger: 0.02, ease: 'none' },
          0.12
        );

      // Phase 3 - EXIT (70-100%)
      scrollTl
        .fromTo(megaCard,
          { y: 0, scale: 1, opacity: 1 },
          { y: '10vh', scale: 0.98, opacity: 0, ease: 'power2.in' },
          0.7
        )
        .fromTo(rightCardElements,
          { x: 0, opacity: 1 },
          { x: '18vw', opacity: 0, stagger: 0.02, ease: 'power2.in' },
          0.7
        );

    }, section);

    return () => ctx.revert();
  }, []);

  const topicCards = [
    {
      icon: BookOpen01Icon,
      title: 'Research Briefs',
      description: 'Papers that change the trajectory.',
    },
    {
      icon: RocketIcon,
      title: 'Product Launches',
      description: 'Ships, betas, and surprises.',
    },
    {
      icon: Shield01Icon,
      title: 'Policy & Safety',
      description: 'Rules, risks, and responsibility.',
    }
  ];

  return (
    <div 
      ref={sectionRef}
      className="section-pinned flex items-center bg-primary-theme"
    >
      {/* Subtle vignette - only in dark mode */}
      <div className="absolute inset-0 dark:bg-radial-gradient from-transparent to-[#0B0C10]/50 pointer-events-none" />

      <div className="relative z-10 w-full px-6 lg:px-10 py-20">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-6 lg:gap-8">
            {/* Mega card - left */}
            <div 
              ref={megaCardRef}
              className="card-dark p-8 lg:p-12 flex flex-col justify-between min-h-[400px] lg:min-h-[500px]"
            >
              <div>
                <div className="accent-line w-16 mb-6" />
                <div className="font-mono text-xs uppercase tracking-[0.15em] text-[#00b4d8] dark:text-[#00F0FF] mb-4">
                  Coverage
                </div>
                <h2 className="font-display text-3xl lg:text-5xl font-bold text-[#0f172a] dark:text-[#F5F7FF] mb-6">
                  Five lenses<br />on AI
                </h2>
                <p className="text-[#64748b] dark:text-[#A7B0C8] text-lg">
                  Research · Products · Policy · Design · Infrastructure
                </p>
              </div>
              <button className="btn-secondary w-fit flex items-center gap-2 mt-8">
                Browse all topics
                <HugeiconsIcon icon={ArrowRight01Icon} className="w-4 h-4" />
              </button>
            </div>

            {/* Right column - stacked cards */}
            <div ref={rightCardsRef} className="flex flex-col gap-4 lg:gap-6">
              {topicCards.map((card, index) => (
                <div 
                  key={index}
                  className="topic-card card-dark p-6 hover:translate-y-[-6px] transition-transform cursor-pointer group"
                >
                  <div className="accent-line w-12 mb-4" />
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-[#00b4d8]/10 dark:bg-[#00F0FF]/10 flex items-center justify-center flex-shrink-0">
                      <HugeiconsIcon icon={card.icon} className="w-5 h-5 text-[#00b4d8] dark:text-[#00F0FF]" />
                    </div>
                    <div>
                      <h3 className="font-display text-xl font-semibold text-[#0f172a] dark:text-[#F5F7FF] mb-1 group-hover:text-[#00b4d8] dark:group-hover:text-[#00F0FF] transition-colors">
                        {card.title}
                      </h3>
                      <p className="text-[#64748b] dark:text-[#A7B0C8] text-sm">{card.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
