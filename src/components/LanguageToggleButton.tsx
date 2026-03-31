import { GlobeIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';

interface LanguageToggleButtonProps {
  className?: string;
  compact?: boolean;
}

export function LanguageToggleButton({ className, compact = false }: LanguageToggleButtonProps) {
  const { isRTL, t, toggleLocale } = useLocale();

  return (
    <button
      type="button"
      onClick={toggleLocale}
      title={isRTL ? t('common.switchToEnglish') : t('common.switchToHebrew')}
      aria-label={t('common.languageToggle')}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full border border-[#E5E5E5] bg-white px-3 py-2 text-sm font-medium text-[#171717] transition-colors hover:border-[#D93A3A] hover:text-[#D93A3A]',
        compact && 'h-10 w-10 px-0',
        className,
      )}
    >
      <HugeiconsIcon icon={GlobeIcon} className="h-4 w-4" />
      {!compact ? <span>{t('common.altLanguageShort')}</span> : null}
    </button>
  );
}