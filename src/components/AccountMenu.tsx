import { useState } from 'react';
import { LogIn } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocale } from '@/contexts/LocaleContext';
import { useNotificationCount } from '@/contexts/NotificationsContext';
import { getPocketBase } from '@/lib/pocketbase/client';
import { lazyComponent } from '@/lib/lazy-component';
import { preloadRoute } from '@/lib/preload-route';
import { cn } from '@/lib/utils';
import { AccountMenuTrigger } from './AccountMenuTrigger';

const AuthenticatedAccountMenu = lazyComponent(() => import('./AuthenticatedAccountMenu').then(module => ({ default: module.AuthenticatedAccountMenu })), {
  fallback: props => <AccountMenuTrigger user={props.user} unreadCount={props.unreadCount} foldOrder={props.foldOrder} className={props.className} aria-haspopup="menu" aria-expanded={props.open ?? props.defaultOpen} onClick={props.onPendingOpen} />,
});
// Start an existing account's menu alongside startup, before its first render.
if (getPocketBase().authStore.isValid) AuthenticatedAccountMenu.preload();

export interface AccountMenuProps {
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

export function AccountMenu(props: AccountMenuProps) {
  const { onSignInClick, foldOrder, className } = props;
  const { user, isAuthenticated, isLoading } = useAuth();
  const { t } = useLocale();
  const unreadCount = useNotificationCount();
  const [pendingOpen, setPendingOpen] = useState(false);
  if (isLoading && !user) {
    return <div className={cn('size-9 animate-pulse rounded-full bg-[var(--bg-pill)]', className)} />;
  }

  if (!isAuthenticated || !user) {
    if (foldOrder !== undefined) {
      return (
        <button
          type="button"
          onClick={onSignInClick}
        onPointerEnter={() => preloadRoute('/sign-in')}
          onFocus={() => preloadRoute('/sign-in')}
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
        onPointerEnter={() => preloadRoute('/sign-in')}
        onFocus={() => preloadRoute('/sign-in')}
        className={cn(
          'btn-pill-action btn-thanks-yellow hidden text-xs font-bold px-4 py-2 sm:inline-flex',
          className,
        )}
      >
        {t('nav.signIn')}
      </button>
    );
  }

  return <AuthenticatedAccountMenu {...props} user={user} unreadCount={unreadCount} defaultOpen={pendingOpen} onPendingOpen={() => { setPendingOpen(true); props.onOpenChange?.(true); }} />;
}
