import { useState } from 'react';
import { ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLocale } from '@/contexts/LocaleContext';
import { useSubscriberCount } from '@/hooks/useSubscriberCount';
import { subscribeToNewsletter } from '@/lib/pocketbase/subscribers';

interface SidebarProps {
  publishedCount: number;
}

export function Sidebar({ publishedCount }: SidebarProps) {
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
    <aside id="resources" className="space-y-8">
      {/* Subscribe Card */}
      <div className="bg-[#F9FAFB] rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <img 
            src="/logo.gif" 
            alt="AI Maor Break" 
            className="w-12 h-12 object-contain"
          />
          <div>
            <h3 className="font-bold text-[#171717]">AI-BREAK</h3>
            <p className="text-xs text-[#737373]">{t('sidebar.tagline')}</p>
          </div>
        </div>
        <p className="text-sm text-[#737373] mb-4">
          {t('sidebar.description')}
        </p>
        <form onSubmit={handleSubscribe} className="space-y-3">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('sidebar.emailPlaceholder')}
            className="w-full"
            disabled={isSubmitting}
          />
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? t('sidebar.subscribePending') : t('sidebar.subscribe')}
          </Button>
        </form>
      </div>

      {/* Stats Card */}
      <div id="community" className="border border-[#E5E5E5] rounded-xl p-6">
        <h3 className="font-bold text-[#171717] mb-4">{t('sidebar.community')}</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#737373]">{t('sidebar.published')}</span>
            <span className="font-semibold text-[#171717]">{formatNumber(publishedCount)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#737373]">{t('sidebar.subscribers')}</span>
            <span className="font-semibold text-[#171717]">{subscriberCount === null ? '...' : formatNumber(subscriberCount)}</span>
          </div>
        </div>
      </div>

      {/* Topics */}
      <div id="topics" className="border border-[#E5E5E5] rounded-xl p-6">
        <h3 className="font-bold text-[#171717] mb-4">{t('sidebar.topics')}</h3>
        <div className="flex flex-wrap gap-2">
          {[
            t('sidebar.topic.research'),
            t('sidebar.topic.products'),
            t('sidebar.topic.policy'),
            t('sidebar.topic.design'),
            t('sidebar.topic.infrastructure'),
          ].map((topic) => (
            <span
              key={topic}
              className="px-3 py-1.5 bg-[#F3F4F6] text-[#737373] text-sm rounded-lg hover:bg-[#E5E5E5] cursor-pointer transition-colors"
            >
              {topic}
            </span>
          ))}
        </div>
      </div>
    </aside>
  );
}
