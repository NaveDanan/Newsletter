import { type ReactElement, type ComponentProps } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLocale } from '@/contexts/LocaleContext';
import { readScope } from '@/lib/pocketbase/read-cache';
import { NotificationPreviewList } from './NotificationPreviewList';

export function NotificationPopover({ trigger, open, onOpenChange, onNavigate }: { trigger: ReactElement<ComponentProps<'button'>>; open: boolean; onOpenChange: (open: boolean) => void; onNavigate?: (action: () => void) => void }) {
  const { t, isRTL, dir } = useLocale();
  return <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger asChild>{trigger}</PopoverTrigger>
    <PopoverContent dir={dir} align={isRTL ? 'start' : 'end'} sideOffset={8} collisionPadding={12} aria-label={t('community.notifications.title')} className="z-[220] flex max-h-[var(--radix-popover-content-available-height)] w-[380px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl border-[var(--border-subtle)] bg-[var(--bg-card)] p-2 text-[var(--text-primary)] shadow-[var(--shadow-card)]">
      <h2 className="shrink-0 px-3 py-2 text-base font-bold">{t('community.notifications.title')}</h2>
      <NotificationPreviewList key={readScope()} onClose={() => onOpenChange(false)} onNavigate={onNavigate} />
    </PopoverContent>
  </Popover>;
}
