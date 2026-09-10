import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowRight01Icon,
  DashboardSquare01Icon,
  GlobeIcon,
  Logout01Icon,
  UserIcon,
} from '@hugeicons/core-free-icons';
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

/** Overrides the stock `focus:bg-accent`, which in this theme is the brand red. */
const ITEM_CLASS =
  'cursor-pointer gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#171717] focus:bg-[#F3F4F6] focus:text-[#171717]';

interface AccountMenuProps {
  onProfileClick: () => void;
  onManagerClick: () => void;
  onSignInClick?: () => void;
  onSignOut: () => void;
  /** Hidden inside the manager dashboard, where "Manage" is where you already are. */
  showManagerItem?: boolean;
  /** Manager dashboard passes `requestLeaveEditor` so unsaved work raises a prompt. */
  onNavigate?: (action: () => void) => void;
  variant?: 'header' | 'mobile';
  className?: string;
}

export function AccountMenu({
  onProfileClick,
  onManagerClick,
  onSignInClick,
  onSignOut,
  showManagerItem = true,
  onNavigate,
  variant = 'header',
  className,
}: AccountMenuProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { t, dir, isRTL, toggleLocale } = useLocale();

  if (isLoading && !user) {
    return <div className={cn('size-9 animate-pulse rounded-full bg-[#F3F4F6]', className)} />;
  }

  if (!isAuthenticated || !user) {
    return (
      <button
        type="button"
        onClick={onSignInClick}
        className={cn(
          'text-sm font-medium text-[#171717] transition-colors hover:text-[#D93A3A]',
          variant === 'header' ? 'hidden sm:block' : 'block py-2 font-medium',
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

  return (
    <DropdownMenu dir={dir}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('account.menuLabel')}
          className={cn(
            'rounded-full outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[#D93A3A] focus-visible:ring-offset-2',
            className,
          )}
        >
          <UserAvatarCircle
            name={user.name}
            email={user.email}
            src={user.avatar}
            size={variant === 'mobile' ? 36 : 32}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={isRTL ? 'start' : 'end'}
        sideOffset={8}
        className="w-64 rounded-xl border border-[#E5E5E5] bg-white p-1.5 shadow-lg"
      >
        <DropdownMenuItem
          className={cn(ITEM_CLASS, 'items-center gap-3 py-2.5')}
          onSelect={() => { run(onProfileClick); }}
        >
          <UserAvatarCircle name={user.name} email={user.email} src={user.avatar} size={32} />
          <span className="flex min-w-0 flex-col text-start">
            <span className="truncate text-sm font-semibold text-[#171717]">{user.name}</span>
            <span className="truncate text-xs text-[#737373]">{user.email}</span>
          </span>
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className="rtl-rotate-180 ms-auto size-4 shrink-0 text-[#A3A3A3]"
          />
        </DropdownMenuItem>

        <DropdownMenuSeparator className="my-1.5 bg-[#E5E5E5]" />

        <DropdownMenuItem className={ITEM_CLASS} onSelect={() => { run(onProfileClick); }}>
          <HugeiconsIcon icon={UserIcon} className="size-4 text-[#737373]" />
          {t('account.profile')}
        </DropdownMenuItem>

        {showManage ? (
          <DropdownMenuItem className={ITEM_CLASS} onSelect={() => { run(onManagerClick); }}>
            <HugeiconsIcon icon={DashboardSquare01Icon} className="size-4 text-[#737373]" />
            {t('account.manage')}
          </DropdownMenuItem>
        ) : null}

        {/* Deliberately not wrapped in `run`: switching language navigates nowhere,
            so it must never raise the unsaved-changes prompt. */}
        <DropdownMenuItem className={ITEM_CLASS} onSelect={() => { toggleLocale(); }}>
          <HugeiconsIcon icon={GlobeIcon} className="size-4 text-[#737373]" />
          {isRTL ? t('common.switchToEnglish') : t('common.switchToHebrew')}
        </DropdownMenuItem>

        <DropdownMenuSeparator className="my-1.5 bg-[#E5E5E5]" />

        <DropdownMenuItem
          className={cn(
            ITEM_CLASS,
            'text-[#D93A3A] focus:bg-[#FEE2E2] focus:text-[#B91C1C]',
          )}
          onSelect={() => { run(onSignOut); }}
        >
          <HugeiconsIcon icon={Logout01Icon} className="size-4 text-current" />
          {t('nav.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
