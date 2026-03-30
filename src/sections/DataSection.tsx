import { HugeiconsIcon } from "@hugeicons/react";
import { CodeIcon, Message01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);

export function DataSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const leftCardRef = useRef<HTMLDivElement>(null);
  const rightTopRef = useRef<HTMLDivElement>(null);
  const rightBottomRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const section = sectionRef.current;
    const leftCard = leftCardRef.current;
    const rightTop = rightTopRef.current;
    const rightBottom = rightBottomRef.current;

    if (!section || !leftCard || !rightTop || !rightBottom) return;

    const ctx = gsap.context(() => {
      const scrollTl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: '+=130%',
          pin: true,
          scrub: 0.6,
          onUpdate: (self) => {
            // Count up animation
            if (self.progress > 0.12 && self.progress < 0.3) {
              const progress = (self.progress - 0.12) / 0.18;
              setCount(Math.floor(progress * 34));
            } else if (self.progress >= 0.3) {
              setCount(34);
            }
          }
        }
      });

      // Phase 1 - ENTRANCE (0-30%)
      scrollTl
        .fromTo(leftCard,
          { x: '-60vw', opacity: 0 },
          { x: 0, opacity: 1, ease: 'none' },
          0
        )
        .fromTo(rightTop,
          { x: '55vw', y: '-10vh', opacity: 0 },
          { x: 0, y: 0, opacity: 1, ease: 'none' },
          0.06
        )
        .fromTo(rightBottom,
          { x: '55vw', y: '10vh', opacity: 0 },
          { x: 0, y: 0, opacity: 1, ease: 'none' },
          0.1
        );

      // Phase 3 - EXIT (70-100%)
      scrollTl
        .fromTo(leftCard,
          { y: 0, opacity: 1 },
          { y: '12vh', opacity: 0, ease: 'power2.in' },
          0.7
        )
        .fromTo([rightTop, rightBottom],
          { x: 0, opacity: 1 },
          { x: '18vw', opacity: 0, stagger: 0.02, ease: 'power2.in' },
          0.7
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
          <div className="grid lg:grid-cols-12 gap-6 lg:gap-8">
            {/* Left metric card - large */}
            <div 
              ref={leftCardRef}
              className="lg:col-span-5 card-dark p-8 lg:p-12 flex flex-col justify-center min-h-[400px] lg:min-h-[500px] relative overflow-hidden"
            >
              {/* Scanline */}
              <div 
                className="absolute left-0 right-0 h-[2px] bg-[#00b4d8]/30 dark:bg-[#00F0FF]/30 animate-pulse-glow"
                style={{ top: '65%' }}
              />
              
              <div className="relative z-10">
                <div className="font-display text-7xl lg:text-9xl font-bold text-[#00b4d8] dark:text-[#00F0FF] mb-4">
                  +{count}%
                </div>
                <div className="font-mono text-xs uppercase tracking-[0.15em] text-[#64748b] dark:text-[#A7B0C8] mb-3">
                  Weekly Growth in AI Paper Citations
                </div>
                <p className="text-[#64748b] dark:text-[#A7B0C8]">
                  Driven by multimodal reasoning and agent papers.
                </p>
              </div>
            </div>

            {/* Right column */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              {/* Right top card */}
              <div 
                ref={rightTopRef}
                className="card-dark p-8 flex-1 flex flex-col justify-center"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-[#00b4d8]/10 dark:bg-[#00F0FF]/10 flex items-center justify-center">
                    <HugeiconsIcon icon={Message01Icon} className="w-5 h-5 text-[#00b4d8] dark:text-[#00F0FF]" />
                  </div>
                  <span className="font-mono text-xs uppercase tracking-[0.15em] text-[#64748b] dark:text-[#A7B0C8]">
                    Most discussed model
                  </span>
                </div>
                <div className="font-display text-3xl lg:text-4xl font-bold text-[#0f172a] dark:text-[#F5F7FF]">
                  Nova-Speech-3
                </div>
              </div>

              {/* Right bottom card */}
              <div 
                ref={rightBottomRef}
                className="card-dark p-8 flex-1 flex flex-col justify-center"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-[#00b4d8]/10 dark:bg-[#00F0FF]/10 flex items-center justify-center">
                    <HugeiconsIcon icon={CodeIcon} className="w-5 h-5 text-[#00b4d8] dark:text-[#00F0FF]" />
                  </div>
                  <span className="font-mono text-xs uppercase tracking-[0.15em] text-[#64748b] dark:text-[#A7B0C8]">
                    Top launch category
                  </span>
                </div>
                <div className="font-display text-3xl lg:text-4xl font-bold text-[#0f172a] dark:text-[#F5F7FF]">
                  Developer Tools
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
