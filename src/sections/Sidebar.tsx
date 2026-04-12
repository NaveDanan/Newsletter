import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLocale } from '@/contexts/LocaleContext';
import { subscribeToNewsletter } from '@/lib/pocketbase/subscribers';

export function Sidebar() {
  const { locale, t } = useLocale();
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
      await subscribeToNewsletter({
        email: trimmedEmail,
        locale,
        source: 'sidebar',
      });

      toast.success(t('sidebar.subscribeSuccess'));
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
            <span className="text-sm text-[#737373]">{t('sidebar.subscribers')}</span>
            <span className="font-semibold text-[#171717]">12,450</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#737373]">{t('sidebar.openRate')}</span>
            <span className="font-semibold text-[#D93A3A]">38.5%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#737373]">{t('sidebar.weeklyGrowth')}</span>
            <span className="font-semibold text-green-600">+15%</span>
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
