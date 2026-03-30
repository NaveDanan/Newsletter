import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Clock01Icon, FileAttachmentIcon, HeadphonesIcon } from "@hugeicons/core-free-icons";
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);

export function FeaturedSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const imageCardRef = useRef<HTMLDivElement>(null);
  const textPanelRef = useRef<HTMLDivElement>(null);
  const infoCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const imageCard = imageCardRef.current;
    const textPanel = textPanelRef.current;
    const infoCard = infoCardRef.current;

    if (!section || !imageCard || !textPanel || !infoCard) return;

    const ctx = gsap.context(() => {
      const scrollTl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: '+=140%',
          pin: true,
          scrub: 0.7,
        }
      });

      // Phase 1 - ENTRANCE (0-30%)
      scrollTl
        .fromTo(imageCard,
          { x: '-70vw', rotate: -2, opacity: 0 },
          { x: 0, rotate: 0, opacity: 1, ease: 'none' },
          0
        )
        .fromTo(textPanel,
          { x: '40vw', y: '8vh', opacity: 0 },
          { x: 0, y: 0, opacity: 1, ease: 'none' },
          0.08
        )
        .fromTo(infoCard,
          { y: '35vh', scale: 0.96, opacity: 0 },
          { y: 0, scale: 1, opacity: 1, ease: 'none' },
          0.14
        );

      // Phase 3 - EXIT (70-100%)
      scrollTl
        .fromTo(imageCard,
          { x: 0, y: 0, opacity: 1 },
          { x: '-18vw', y: '-8vh', opacity: 0, ease: 'power2.in' },
          0.7
        )
        .fromTo(textPanel,
          { x: 0, opacity: 1 },
          { x: '18vw', opacity: 0, ease: 'power2.in' },
          0.7
        )
        .fromTo(infoCard,
          { y: 0, opacity: 1 },
          { y: '14vh', opacity: 0, ease: 'power2.in' },
          0.72
        );

    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <div 
      ref={sectionRef}
      className="section-pinned flex items-center bg-primary-theme"
    >
      <div className="relative z-10 w-full px-6 lg:px-10 py-20">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-12 gap-6 lg:gap-8 items-center">
            {/* Feature image card - left */}
            <div 
              ref={imageCardRef}
              className="lg:col-span-7 relative"
            >
              <div className="card-dark overflow-hidden">
                <div className="relative aspect-[4/3]">
                  <img 
                    src="/feature_lab_image.jpg" 
                    alt="AI Research Lab"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#111318] dark:from-[#111318] via-transparent to-transparent" />
                </div>
              </div>
            </div>

            {/* Text panel - right */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              <div ref={textPanelRef}>
                <div className="font-mono text-xs uppercase tracking-[0.15em] text-[#00b4d8] dark:text-[#00F0FF] mb-4">
                  Featured
                </div>
                <h2 className="font-display text-2xl lg:text-4xl font-bold text-[#0f172a] dark:text-[#F5F7FF] mb-4 leading-tight">
                  The lab that shipped a new voice model in 48 hours
                </h2>
                <p className="text-[#64748b] dark:text-[#A7B0C8] mb-6">
                  A behind-the-scenes look at rapid iteration, eval design, and the tradeoffs that matter.
                </p>
                <button className="btn-primary flex items-center gap-2">
                  Read the story
                  <HugeiconsIcon icon={ArrowRight01Icon} className="w-4 h-4" />
                </button>
              </div>

              {/* Info card */}
              <div 
                ref={infoCardRef}
                className="card-dark p-5 mt-4"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <HugeiconsIcon icon={Clock01Icon} className="w-4 h-4 text-[#00b4d8] dark:text-[#00F0FF]" />
                    <span className="text-sm text-[#64748b] dark:text-[#A7B0C8]">3 min read</span>
                  </div>
                  <div className="w-px h-4 bg-[#e2e8f0] dark:bg-white/10 hidden sm:block" />
                  <div className="flex items-center gap-2">
                    <HugeiconsIcon icon={HeadphonesIcon} className="w-4 h-4 text-[#00b4d8] dark:text-[#00F0FF]" />
                    <span className="text-sm text-[#64748b] dark:text-[#A7B0C8]">Audio included</span>
                  </div>
                  <div className="w-px h-4 bg-[#e2e8f0] dark:bg-white/10 hidden sm:block" />
                  <div className="flex items-center gap-2">
                    <HugeiconsIcon icon={FileAttachmentIcon} className="w-4 h-4 text-[#00b4d8] dark:text-[#00F0FF]" />
                    <span className="text-sm text-[#64748b] dark:text-[#A7B0C8]">12 citations</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
