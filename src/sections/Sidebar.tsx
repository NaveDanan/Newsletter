import { useState } from 'react';
import { ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';
import { useLocale } from '@/contexts/LocaleContext';
import { useSubscriberCount } from '@/hooks/useSubscriberCount';
import { subscribeToNewsletter } from '@/lib/pocketbase/subscribers';
import { RecentActivity } from './RecentActivity';

interface SidebarProps {
  publishedCount: number;
  onNavigate: (pathname: string) => void;
}

export function Sidebar({ publishedCount, onNavigate }: SidebarProps) {
  const { formatNumber, locale, t } = useLocale();
  const { subscriberCount, refreshSubscriberCount } = useSubscriberCount();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      toast.error(t('sidebar.emptyEmail'));
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error(t('sidebar.invalidEmail'));
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await subscribeToNewsletter({
        email: trimmedEmail,
        locale,
        source: 'sidebar',
      });

      void refreshSubscriberCount();
      if (result === 'already_subscribed') {
        toast.success(t('sidebar.alreadySubscribed'), {
          icon: <ThumbsUp className="h-4 w-4" />,
        });
      } else {
        toast.success(t('sidebar.subscribeSuccess'));
      }
      setEmail('');
    } catch (error) {
      const message = error instanceof Error ? error.message : t('sidebar.subscribeFailed');
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <aside id="resources" className="space-y-6">
      {/* 1. Iconic Concentric Arches & Profile Stats Card */}
      <section className="profile-card">
        <div className="profile-hero-section">
          <div className="profile-arches-container">
            <svg className="profile-arches-svg" viewBox="0 0 170 95" fill="none">
              <path d="M 12 90 A 73 73 0 0 1 158 90" stroke="var(--primary-accent)" strokeWidth="7.5" strokeLinecap="round" opacity="0.9" />
              <path d="M 28 90 A 57 57 0 0 1 142 90" stroke="var(--primary-accent)" strokeWidth="7.5" strokeLinecap="round" opacity="0.75" />
              <path d="M 44 90 A 41 41 0 0 1 126 90" stroke="var(--primary-accent)" strokeWidth="7.5" strokeLinecap="round" opacity="0.6" />
              <path d="M 60 90 A 25 25 0 0 1 110 90" stroke="var(--primary-accent)" strokeWidth="7.5" strokeLinecap="round" opacity="0.45" />
            </svg>
          </div>

          <div className="profile-hero-row">
            <div className="stat-group stat-left">
              <span className="stat-value">{formatNumber(publishedCount)}</span>
              <span className="stat-label">{t('sidebar.published')}</span>
            </div>

            <div className="profile-avatar-wrapper p-1">
              <img
                src="/logo.gif"
                alt="AI-BREAK Platform"
                className="w-full h-full object-contain rounded-2xl"
              />
            </div>

            <div className="stat-group stat-right">
              <span className="stat-value">{subscriberCount === null ? '...' : formatNumber(subscriberCount)}</span>
              <span className="stat-label">{t('sidebar.subscribers')}</span>
            </div>
          </div>
        </div>

        <div className="profile-info mt-3">
          <h3 className="profile-name">AI-BREAK</h3>
          <span className="profile-handle">@aibreak</span>
          <p className="profile-bio text-xs text-[var(--text-secondary)] mt-2">
            AI updates, tech breakthroughs, workflows & community.
          </p>
        </div>
      </section>

      {/* 2. Subscribe Card with Pill Input */}
      <div className="feed-post-card p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] flex items-center justify-center p-1">
            <img 
              src="/logo.gif" 
              alt="AI-BREAK" 
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h3 className="font-bold text-sm text-[var(--text-primary)]">Newsletter Digest</h3>
            <p className="text-xs text-[var(--text-muted)]">{t('sidebar.tagline')}</p>
          </div>
        </div>
        <p className="text-xs sm:text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
          {t('sidebar.description')}
        </p>
        <form onSubmit={handleSubscribe} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('sidebar.emailPlaceholder')}
            className="w-full h-10 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-full px-4 text-xs sm:text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary-accent)] transition-all"
            disabled={isSubmitting}
          />
          <button
            type="submit"
            className="btn-hire-me w-full py-2.5 text-xs font-bold"
            disabled={isSubmitting}
          >
            {isSubmitting ? t('sidebar.subscribePending') : t('sidebar.subscribe')}
          </button>
        </form>
      </div>

      {/* 3. Recent Activity Widget */}
      <RecentActivity onNavigate={onNavigate} />

      {/* 4. Skills & Topics Tags */}
      <div id="topics" className="feed-post-card p-5">
        <h3 className="section-header-title text-sm font-bold text-[var(--text-primary)] mb-3">
          {t('sidebar.topics')}
        </h3>
        <div className="flex flex-wrap gap-2">
          {[
            t('sidebar.topic.research'),
            t('sidebar.topic.products'),
            t('sidebar.topic.policy'),
            t('sidebar.topic.design'),
            t('sidebar.topic.infrastructure'),
            'LLMs',
            'Agents',
            'Automation',
          ].map((topic) => (
            <span
              key={topic}
              className="skill-tag"
            >
              #{topic}
            </span>
          ))}
        </div>
      </div>

      {/* 5. Web Platform Footer Links */}
      <footer className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-[var(--text-muted)] pt-2 px-1">
        <a href="#resources" className="hover:text-[var(--primary-accent)] transition-colors">About</a>
        <a href="#workflows" className="hover:text-[var(--primary-accent)] transition-colors">Workflows</a>
        <a href="/community" className="hover:text-[var(--primary-accent)] transition-colors">Community</a>
        <a href="/unsubscribe" className="hover:text-[var(--primary-accent)] transition-colors">Preferences</a>
        <span className="w-full text-[10px] opacity-70 mt-1">© 2026 AI-BREAK Studio. All rights reserved.</span>
      </footer>
    </aside>
  );
}
