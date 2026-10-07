import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, Menu01Icon } from '@hugeicons/core-free-icons';
import { AccountMenu } from '@/components/AccountMenu';
import { LanguageToggleButton } from '@/components/LanguageToggleButton';
import { useLocale } from '@/contexts/LocaleContext';

interface ManagerHeaderProps {
  title: string;
  onHomeClick: () => void;
  onProfileClick: () => void;
  onManagerClick: () => void;
  onSignOut: () => void;
  onNavigate?: (action: () => void) => void;
  onToggleMenu?: () => void;
  menuOpen?: boolean;
  showManagerItem?: boolean;
}

export function ManagerHeader({ title, onHomeClick, onProfileClick, onManagerClick, onSignOut, onNavigate, onToggleMenu, menuOpen, showManagerItem = true }: ManagerHeaderProps) {
  const { t } = useLocale();
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[var(--bg-app)]/90 backdrop-blur-md" data-manager-header>
      <div className="flex h-16 items-center justify-between gap-3 px-4 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          {onToggleMenu ? (
            <button type="button" onClick={onToggleMenu} aria-expanded={menuOpen} aria-label={menuOpen ? t('nav.closeMenu') : t('nav.openMenu')} className="flex size-11 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--bg-pill-hover)] hover:text-[var(--text-primary)] lg:hidden">
              <HugeiconsIcon icon={menuOpen ? Cancel01Icon : Menu01Icon} className="size-5" />
            </button>
          ) : null}
          <button type="button" onClick={() => onNavigate ? onNavigate(onHomeClick) : onHomeClick()} className="group flex shrink-0 items-center gap-3 text-start" aria-label={t('nav.home')}>
            <div className="brand-logo transition-transform group-hover:scale-105">
              <img src="/logo.gif" alt="AI-BREAK" className="size-7 rounded-lg object-contain" />
            </div>
            <span className="text-base font-extrabold tracking-tight text-[var(--text-primary)] sm:text-lg">AI-BREAK</span>
          </button>
          <span className="hidden text-[var(--border-highlight)] sm:inline">|</span>
          <span className="hidden truncate text-xs font-bold uppercase tracking-wider text-[var(--primary-accent)] sm:inline">{title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <LanguageToggleButton compact />
          <AccountMenu showManagerItem={showManagerItem} onProfileClick={onProfileClick} onManagerClick={onManagerClick} onSignOut={onSignOut} onNavigate={onNavigate} />
        </div>
      </div>
    </header>
  );
}
