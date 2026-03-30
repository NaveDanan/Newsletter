import { HugeiconsIcon } from "@hugeicons/react";
import { QuoteUpIcon } from "@hugeicons/core-free-icons";
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);

const testimonials = [
  {
    quote: "The shortest path from paper to product context.",
    author: "Sarah Chen",
    role: "ML Engineer @ OpenAI"
  },
  {
    quote: "I forward it to my team every Monday.",
    author: "Marcus Johnson",
    role: "CTO @ Neural Labs"
  },
  {
    quote: "Saves me 3 hours of Twitter scrolling.",
    author: "Emily Park",
    role: "Research Scientist"
  },
  {
    quote: "Balanced takes—hype-free.",
    author: "David Kumar",
    role: "Product Manager @ Google"
  },
  {
    quote: "The policy section keeps me compliant-aware.",
    author: "Lisa Wong",
    role: "Legal Counsel @ Anthropic"
  },
  {
    quote: "Design patterns I actually use.",
    author: "Alex Rivera",
    role: "UX Lead @ Microsoft"
  }
];

export function CommunitySection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const heading = headingRef.current;
    const cards = cardsRef.current;

    if (!section || !heading || !cards) return;

    const ctx = gsap.context(() => {
      const cardElements = cards.querySelectorAll('.testimonial-card');

      // Heading animation
      gsap.fromTo(heading,
        { y: 30, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: heading,
            start: 'top 80%',
            end: 'top 55%',
            scrub: true
          }
        }
      );

      // Cards animation
      cardElements.forEach((card) => {
        gsap.fromTo(card,
          { y: 60, scale: 0.98, opacity: 0 },
          {
            y: 0,
            scale: 1,
            opacity: 1,
            duration: 0.6,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: card,
              start: 'top 85%',
              end: 'top 60%',
              scrub: true
            }
          }
        );
      });

    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <div 
      ref={sectionRef}
      className="relative bg-primary-theme py-20 lg:py-32"
    >
      <div className="relative z-10 w-full px-6 lg:px-10">
        <div className="max-w-7xl mx-auto">
          {/* Heading */}
          <div ref={headingRef} className="mb-12 lg:mb-16">
            <div className="font-mono text-xs uppercase tracking-[0.15em] text-[#00b4d8] dark:text-[#00F0FF] mb-4">
              Community
            </div>
            <h2 className="font-display text-3xl lg:text-5xl font-bold text-[#0f172a] dark:text-[#F5F7FF] mb-4">
              What readers are building
            </h2>
            <p className="text-[#64748b] dark:text-[#A7B0C8] text-lg max-w-xl">
              Engineers, researchers, and founders use AI-BREAK to stay sharp.
            </p>
          </div>

          {/* Testimonial grid */}
          <div 
            ref={cardsRef}
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {testimonials.map((testimonial, index) => (
              <div 
                key={index}
                className="testimonial-card card-dark p-6 hover:border-[#00b4d8]/30 dark:hover:border-[#00F0FF]/30 transition-colors"
              >
                <HugeiconsIcon icon={QuoteUpIcon} className="w-8 h-8 text-[#00b4d8]/30 dark:text-[#00F0FF]/30 mb-4" />
                <p className="text-[#0f172a] dark:text-[#F5F7FF] text-lg mb-6 leading-relaxed">
                  &ldquo;{testimonial.quote}&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#00b4d8]/30 to-[#00b4d8]/10 dark:from-[#00F0FF]/30 dark:to-[#00F0FF]/10 flex items-center justify-center">
                    <span className="text-[#00b4d8] dark:text-[#00F0FF] font-display font-semibold text-sm">
                      {testimonial.author.split(' ').map(n => n[0]).join('')}
                    </span>
                  </div>
                  <div>
                    <div className="text-[#0f172a] dark:text-[#F5F7FF] font-medium text-sm">
                      {testimonial.author}
                    </div>
                    <div className="text-[#64748b] dark:text-[#A7B0C8] text-xs">
                      {testimonial.role}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
