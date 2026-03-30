import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, BrainIcon, CpuIcon, DatabaseIcon, ShieldCheck, Wrench01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const carouselItems = [
  {
    icon: BrainIcon,
    title: 'Multimodal Reasoning',
    description: 'Why it matters, who\'s building, and what to watch in the multimodal AI space.',
  },
  {
    icon: Wrench01Icon,
    title: 'Agent Tooling',
    description: 'The infrastructure powering autonomous AI agents and their capabilities.',
  },
  {
    icon: CpuIcon,
    title: 'On-Device Models',
    description: 'Small but mighty: how edge AI is changing the deployment landscape.',
  },
  {
    icon: ShieldCheck,
    title: 'Safety Benchmarks',
    description: 'New evaluation frameworks and red-teaming methodologies.',
  },
  {
    icon: DatabaseIcon,
    title: 'Open Weights',
    description: 'The open-source movement and its impact on AI accessibility.',
  }
];

export function CarouselSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(2);

  useEffect(() => {
    const section = sectionRef.current;
    const carousel = carouselRef.current;

    if (!section || !carousel) return;

    const ctx = gsap.context(() => {
      const cards = carousel.querySelectorAll('.carousel-card');

      const scrollTl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: '+=150%',
          pin: true,
          scrub: 0.7,
          onUpdate: (self) => {
            // Update active index based on scroll progress
            const progress = self.progress;
            const newIndex = Math.min(4, Math.max(0, Math.floor(progress * 5)));
            setActiveIndex(newIndex);
          }
        }
      });

      // Phase 1 - ENTRANCE (0-30%)
      scrollTl
        .fromTo(carousel,
          { z: -600, rotateY: -35, opacity: 0 },
          { z: 0, rotateY: 0, opacity: 1, ease: 'none' },
          0
        )
        .fromTo(cards,
          { y: '18vh', scale: 0.92, opacity: 0 },
          { y: 0, scale: 1, opacity: 1, stagger: 0.02, ease: 'none' },
          0.1
        );

      // Phase 2 - SETTLE (30-70%): Rotate carousel
      scrollTl.fromTo(carousel,
        { rotateY: -45 },
        { rotateY: 45, ease: 'none' },
        0.3
      );

      // Phase 3 - EXIT (70-100%)
      scrollTl
        .fromTo(carousel,
          { z: 0, rotateY: 45, opacity: 1 },
          { z: -400, rotateY: 55, opacity: 0, ease: 'power2.in' },
          0.7
        );

    }, section);

    return () => ctx.revert();
  }, []);

  const getCardStyle = (index: number) => {
    const diff = index - activeIndex;
    const absDiff = Math.abs(diff);
    
    let translateX = diff * 280;
    let translateZ = absDiff === 0 ? 180 : absDiff === 1 ? -80 : -220;
    let rotateY = diff * -25;
    let opacity = absDiff > 2 ? 0.3 : 1;
    let scale = absDiff === 0 ? 1 : absDiff === 1 ? 0.9 : 0.8;

    return {
      transform: `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
      opacity,
      zIndex: 10 - absDiff
    };
  };

  return (
    <div 
      ref={sectionRef}
      className="section-pinned flex items-center justify-center bg-primary-theme"
    >
      {/* Radial gradient background */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(0,180,216,0.05) 0%, transparent 70%)'
        }}
      />

      <div className="relative z-10 w-full px-6 lg:px-10">
        {/* Section header */}
        <div className="text-center mb-12">
          <div className="font-mono text-xs uppercase tracking-[0.15em] text-[#00b4d8] dark:text-[#00F0FF] mb-3">
            Trend Radar
          </div>
          <h2 className="font-display text-3xl lg:text-5xl font-bold text-[#0f172a] dark:text-[#F5F7FF]">
            What&apos;s moving now
          </h2>
        </div>

        {/* 3D Carousel */}
        <div 
          className="carousel-3d relative h-[400px] lg:h-[450px] flex items-center justify-center"
          style={{ perspective: '1000px' }}
        >
          <div 
            ref={carouselRef}
            className="relative flex items-center justify-center"
            style={{ 
              transformStyle: 'preserve-3d',
              transform: 'rotateY(0deg)'
            }}
          >
            {carouselItems.map((item, index) => (
              <div
                key={index}
                className={`carousel-card card-dark absolute w-64 lg:w-80 p-6 cursor-pointer transition-all duration-300 ${
                  index === activeIndex ? 'border-[#00b4d8]/50 dark:border-[#00F0FF]/50 glow-cyan' : ''
                }`}
                style={getCardStyle(index)}
                onClick={() => setActiveIndex(index)}
              >
                <div className="w-12 h-12 rounded-lg bg-[#00b4d8]/10 dark:bg-[#00F0FF]/10 flex items-center justify-center mb-4">
                  <HugeiconsIcon icon={item.icon} className="w-6 h-6 text-[#00b4d8] dark:text-[#00F0FF]" />
                </div>
                <h3 className="font-display text-xl font-semibold text-[#0f172a] dark:text-[#F5F7FF] mb-2">
                  {item.title}
                </h3>
                <p className="text-[#64748b] dark:text-[#A7B0C8] text-sm mb-4">
                  {item.description}
                </p>
                <button className="text-[#00b4d8] dark:text-[#00F0FF] text-sm flex items-center gap-1 hover:gap-2 transition-all">
                  Read more
                  <HugeiconsIcon icon={ArrowRight01Icon} className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Navigation dots */}
        <div className="flex justify-center gap-2 mt-8">
          {carouselItems.map((_, index) => (
            <button
              key={index}
              onClick={() => setActiveIndex(index)}
              className={`w-2 h-2 rounded-full transition-all ${
                index === activeIndex 
                  ? 'bg-[#00b4d8] dark:bg-[#00F0FF] w-6' 
                  : 'bg-[#cbd5e1] dark:bg-white/20 hover:bg-[#94a3b8] dark:hover:bg-white/40'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
