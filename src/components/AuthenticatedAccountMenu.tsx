import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowRight01Icon,
  DashboardSquare01Icon,
  GlobeIcon,
  Logout01Icon,
  Notification01Icon,
} from '@hugeicons/core-free-icons';
import { UserAvatarCircle } from '@/components/UserAvatarCircle';
import { AccountMenuTrigger } from '@/components/AccountMenuTrigger';
import { preloadRoute } from '@/lib/preload-route';
import type { PocketBaseUser } from '@/lib/pocketbase/client';
import type { AccountMenuProps } from './AccountMenu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLocale } from '@/contexts/LocaleContext';
import { hasManagerAccess } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';

/** Overrides the stock `focus:bg-accent` */
const ITEM_CLASS =
  'cursor-pointer gap-2.5 rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-pill-hover)] focus:bg-[var(--bg-pill-hover)] focus:text-[var(--text-primary)] transition-colors';

export interface AuthenticatedAccountMenuProps extends AccountMenuProps {
  user: PocketBaseUser;
  unreadCount: number;
  defaultOpen?: boolean;
  onPendingOpen: () => void;
}

export function AuthenticatedAccountMenu({ onProfileClick, onManagerClick, onSignOut, showManagerItem = true, onNavigate, foldOrder, open, onOpenChange, className, user, unreadCount, defaultOpen }: AuthenticatedAccountMenuProps) {
  const { t, dir, isRTL, toggleLocale } = useLocale();
  // Defaults to a plain pass-through, so callers without an editor guard behave identically.
  const run = onNavigate ?? ((action: () => void) => { action(); });
  const showManage = showManagerItem && hasManagerAccess(user.role);

  const goToNotifications = () => {
    run(() => {
      window.history.pushState({}, '', '/community/notifications');
      window.dispatchEvent(new Event('app:navigate'));
    });
  };

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <DropdownMenu dir={dir} defaultOpen={defaultOpen} open={open} onOpenChange={onOpenChange} modal={onOpenChange === undefined}>
        <DropdownMenuTrigger asChild>
          <AccountMenuTrigger user={user} unreadCount={unreadCount} foldOrder={foldOrder} className={className} />
        </DropdownMenuTrigger>
        {/* Portalled to <body>, so it must outrank the sticky header (z-index 200). */}
        <DropdownMenuContent
          align={isRTL ? 'start' : 'end'}
          sideOffset={8}
          className="z-[210] w-64 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2 shadow-[var(--shadow-card)] backdrop-blur-xl"
        >
          <DropdownMenuItem
            className={cn(ITEM_CLASS, 'items-center gap-3 py-2.5')}
            onPointerEnter={() => preloadRoute('/profile')} onFocus={() => preloadRoute('/profile')} onSelect={() => { run(onProfileClick); }}
          >
            <UserAvatarCircle name={user.name} email={user.email} src={user.avatar} size={32} />
            <span className="flex min-w-0 flex-col text-start">
              <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{user.name}</span>
              <span className="truncate text-xs text-[var(--text-secondary)]">{user.email}</span>
            </span>
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              className="rtl-rotate-180 ms-auto size-4 shrink-0 text-[var(--text-muted)]"
            />
          </DropdownMenuItem>

          <DropdownMenuSeparator className="my-1.5 bg-[var(--border-subtle)]" />
          <DropdownMenuItem className={ITEM_CLASS} onSelect={goToNotifications}>
            <HugeiconsIcon icon={Notification01Icon} className="size-4 text-[var(--text-secondary)]" />
            {t('community.notifications.title')}
            {unreadCount > 0 ? (
              <span className="ms-auto min-w-5 rounded-full bg-[var(--primary-accent)] px-1.5 text-center text-[10px] font-bold leading-5 text-[var(--accent-contrast)]">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </DropdownMenuItem>
          {showManage ? (
            <DropdownMenuItem className={ITEM_CLASS} onPointerEnter={() => preloadRoute('/manager')} onFocus={() => preloadRoute('/manager')} onSelect={() => { run(onManagerClick); }}>
              <HugeiconsIcon icon={DashboardSquare01Icon} className="size-4 text-[var(--text-secondary)]" />
              {t('account.manage')}
            </DropdownMenuItem>
          ) : null}

          {/* Language toggle item */}
          <DropdownMenuItem className={ITEM_CLASS} onSelect={() => { toggleLocale(); }}>
            <HugeiconsIcon icon={GlobeIcon} className="size-4 text-[var(--text-secondary)]" />
            {isRTL ? t('common.switchToEnglish') : t('common.switchToHebrew')}
          </DropdownMenuItem>

          <DropdownMenuSeparator className="my-1.5 bg-[var(--border-subtle)]" />

          <DropdownMenuItem
            className={cn(
              ITEM_CLASS,
              'text-[var(--primary-accent)] hover:bg-[var(--primary-accent)]/10 focus:bg-[var(--primary-accent)]/10',
            )}
            onSelect={() => { run(onSignOut); }}
          >
            <HugeiconsIcon icon={Logout01Icon} className="size-4 text-current" />
            {t('nav.signOut')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
