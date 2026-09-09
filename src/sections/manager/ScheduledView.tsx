import { useLocale } from '@/contexts/LocaleContext';
import type { UserRole } from '@/lib/pocketbase/client';
import { ScheduledNewsletterUpdates } from './ScheduledNewsletterUpdates';
import { ScheduledPublishesSection } from './ScheduledPublishesSection';

export function ScheduledView({ currentUserRole }: { currentUserRole: UserRole | null }) {
  const { t } = useLocale();
  if (currentUserRole !== 'admin') {
    return <div className="dashboard-card text-sm text-[#737373]">{t('scheduled.adminOnly')}</div>;
  }
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-[#171717]">{t('scheduled.title')}</h1>
      <ScheduledNewsletterUpdates />
      <section aria-labelledby="scheduled-publishes-title" className="border-t border-[#E5E5E5] pt-8">
        <ScheduledPublishesSection currentUserRole={currentUserRole} />
      </section>
    </div>
  );
}
