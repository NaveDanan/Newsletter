import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowRight01Icon,
  DashboardSquare01Icon,
  GlobeIcon,
  Logout01Icon,
  Notification01Icon,
} from '@hugeicons/core-free-icons';
import { LogIn } from 'lucide-react';
import { UserAvatarCircle } from '@/components/UserAvatarCircle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useLocale } from '@/contexts/LocaleContext';
import { hasManagerAccess } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';
import { useNotificationCount } from '@/contexts/NotificationsContext';

/** Overrides the stock `focus:bg-accent` */
const ITEM_CLASS =
  'cursor-pointer gap-2.5 rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-pill-hover)] focus:bg-[var(--bg-pill-hover)] focus:text-[var(--text-primary)] transition-colors';

interface AccountMenuProps {
  onProfileClick: () => void;
  onManagerClick: () => void;
  onSignInClick?: () => void;
  onSignOut: () => void;
  /** Hidden inside the manager dashboard, where "Manage" is where you already are. */
  showManagerItem?: boolean;
  /** Manager dashboard passes `requestLeaveEditor` so unsaved work raises a prompt. */
  onNavigate?: (action: () => void) => void;
  /**
   * Site header only: the label (name, or "Sign in") folds away at this
   * useCollapsingLabels level, leaving just the avatar or icon.
   */
  foldOrder?: number;
  /**
   * Controls the menu, for headers that keep it exclusive with another menu.
   * A controlled menu is non-modal, so one click on the other menu's trigger
   * both closes this one and opens that one.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export function AccountMenu({
  onProfileClick,
  onManagerClick,
  onSignInClick,
  onSignOut,
  showManagerItem = true,
  onNavigate,
  foldOrder,
  open,
  onOpenChange,
  className,
}: AccountMenuProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { t, dir, isRTL, toggleLocale } = useLocale();
  const unreadCount = useNotificationCount();

  if (isLoading && !user) {
    return <div className={cn('size-9 animate-pulse rounded-full bg-[var(--bg-pill)]', className)} />;
  }

  if (!isAuthenticated || !user) {
    if (foldOrder !== undefined) {
      return (
        <button
          type="button"
          onClick={onSignInClick}
          aria-label={t('nav.signIn')}
          className={cn(
            'btn-pill-action btn-thanks-yellow inline-flex h-[38px] min-w-[38px] shrink-0 items-center justify-center px-2.5 text-xs font-bold',
            className,
          )}
        >
          <LogIn className="size-4 shrink-0" aria-hidden="true" />
          <span className="nav-label" data-collapse-order={foldOrder}>
            <span>
              <span className="block ps-2 pe-1">{t('nav.signIn')}</span>
            </span>
          </span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={onSignInClick}
        className={cn(
          'btn-pill-action btn-thanks-yellow hidden text-xs font-bold px-4 py-2 sm:inline-flex',
          className,
        )}
      >
        {t('nav.signIn')}
      </button>
    );
  }

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
      <DropdownMenu dir={dir} open={open} onOpenChange={onOpenChange} modal={onOpenChange === undefined}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t('account.menuLabel')}
            className={cn(
              'user-top-chip outline-hidden transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-[var(--primary-accent)]',
              foldOrder !== undefined && 'user-top-chip--folding shrink-0',
              className,
            )}
          >
            <span className="relative flex shrink-0">
              <UserAvatarCircle
                name={user.name}
                email={user.email}
                src={user.avatar}
                size={28}
              />
              {unreadCount > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute -end-0.5 -top-0.5 size-2.5 rounded-full bg-[var(--primary-accent)] ring-2 ring-[var(--bg-app)]"
                />
              ) : null}
            </span>
            {foldOrder !== undefined ? (
              <span className="nav-label" data-collapse-order={foldOrder}>
                <span>
                  <span className="flex items-center gap-2.5 ps-2.5 pe-2">
                    <span className="user-top-name max-w-[110px] truncate">{user.name}</span>
                    <span className="user-top-chevron text-xs opacity-70">▾</span>
                  </span>
                </span>
              </span>
            ) : (
              <>
                <span className="user-top-name max-w-[110px] truncate hidden sm:inline">
                  {user.name}
                </span>
                <span className="user-top-chevron text-xs opacity-70">▾</span>
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        {/* Portalled to <body>, so it must outrank the sticky header (z-index 200). */}
        <DropdownMenuContent
          align={isRTL ? 'start' : 'end'}
          sideOffset={8}
          className="z-[210] w-64 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2 shadow-[var(--shadow-card)] backdrop-blur-xl"
        >
          <DropdownMenuItem
            className={cn(ITEM_CLASS, 'items-center gap-3 py-2.5')}
            onSelect={() => { run(onProfileClick); }}
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
            <DropdownMenuItem className={ITEM_CLASS} onSelect={() => { run(onManagerClick); }}>
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
