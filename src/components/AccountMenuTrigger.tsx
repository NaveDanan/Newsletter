import type { ComponentProps } from 'react';
import { UserAvatarCircle } from '@/components/UserAvatarCircle';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';
import type { PocketBaseUser } from '@/lib/pocketbase/client';

interface AccountMenuTriggerProps extends ComponentProps<'button'> {
  user: PocketBaseUser;
  unreadCount: number;
  foldOrder?: number;
}

export function AccountMenuTrigger({ user, unreadCount, foldOrder, className, ...props }: AccountMenuTriggerProps) {
  const { t } = useLocale();
  return (
    <button
      {...props}
      type="button"
      aria-label={t('account.menuLabel')}
      className={cn(
        'user-top-chip outline-none transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-[var(--primary-accent)]',
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
  );
}
