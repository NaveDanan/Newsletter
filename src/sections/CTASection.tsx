import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Mail01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { toast } from 'sonner';

gsap.registerPlugin(ScrollTrigger);

export function CTASection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    const card = cardRef.current;

    if (!section || !card) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(card,
        { y: 50, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: card,
            start: 'top 80%',
            end: 'top 50%',
            scrub: true
          }
        }
      );
    }, section);

    return () => ctx.revert();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Please enter your email');
      return;
    }
    
    setIsSubmitting(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    toast.success('Welcome to AI-BREAK! Check your inbox.');
    setEmail('');
    setIsSubmitting(false);
  };

  return (
    <div 
      ref={sectionRef}
      className="relative py-20 lg:py-32"
    >
      {/* Background image */}
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: 'url(/cta_city_bg.jpg)' }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-white/80 dark:from-[#0B0C10]/80 via-white/90 dark:via-[#0B0C10]/90 to-white dark:to-[#0B0C10]" />
      </div>

      <div className="relative z-10 w-full px-6 lg:px-10">
        <div className="max-w-3xl mx-auto">
          <div 
            ref={cardRef}
            className="card-dark p-8 lg:p-12"
          >
            <div className="text-center mb-8">
              <div className="font-mono text-xs uppercase tracking-[0.15em] text-[#00b4d8] dark:text-[#00F0FF] mb-4">
                Subscribe
              </div>
              <h2 className="font-display text-3xl lg:text-5xl font-bold text-[#0f172a] dark:text-[#F5F7FF] mb-4">
                Get the next issue.
              </h2>
              <p className="text-[#64748b] dark:text-[#A7B0C8] text-lg">
                Weekly updates. No spam. Unsubscribe anytime.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <HugeiconsIcon icon={Mail01Icon} className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#94a3b8] dark:text-[#A7B0C8]" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@company.com"
                    className="w-full pl-12 pr-4 py-4"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span className="w-5 h-5 border-2 border-white dark:border-[#0B0C10] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      Join 12,000+ readers
                      <HugeiconsIcon icon={ArrowRight01Icon} className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center justify-center gap-2 text-sm text-[#64748b] dark:text-[#A7B0C8]">
                <HugeiconsIcon icon={Tick01Icon} className="w-4 h-4 text-[#00b4d8] dark:text-[#00F0FF]" />
                We never share your address.
              </div>
            </form>

            {/* Trust badges */}
            <div className="flex flex-wrap items-center justify-center gap-6 mt-10 pt-8 border-t border-[#e2e8f0] dark:border-white/5">
              <div className="flex items-center gap-2 text-[#64748b] dark:text-[#A7B0C8] text-sm">
                <HugeiconsIcon icon={Tick01Icon} className="w-4 h-4 text-[#00b4d8] dark:text-[#00F0FF]" />
                Weekly delivery
              </div>
              <div className="flex items-center gap-2 text-[#64748b] dark:text-[#A7B0C8] text-sm">
                <HugeiconsIcon icon={Tick01Icon} className="w-4 h-4 text-[#00b4d8] dark:text-[#00F0FF]" />
                Curated content
              </div>
              <div className="flex items-center gap-2 text-[#64748b] dark:text-[#A7B0C8] text-sm">
                <HugeiconsIcon icon={Tick01Icon} className="w-4 h-4 text-[#00b4d8] dark:text-[#00F0FF]" />
                Free forever
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
