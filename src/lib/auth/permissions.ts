import type { UserRole } from '@/lib/pocketbase/client';
import type { Newsletter } from '@/types/newsletter';

export function hasManagerAccess(role: UserRole | null | undefined): boolean {
  return role === 'author' || role === 'manager' || role === 'general_manager' || role === 'admin';
}

export function canModerateCommunity(role: UserRole | null | undefined): boolean {
  return role === 'manager' || role === 'general_manager' || role === 'admin';
}

export function canAccessManagerTab(role: UserRole | null | undefined, tab: string): boolean {
  if (tab === 'newsletters') {
    return hasManagerAccess(role);
  }

  if (tab === 'links') {
    return role === 'admin';
  }

  if (tab === 'scheduled') {
    return role === 'admin';
  }

  if (tab === 'community') {
    return canModerateCommunity(role);
  }

  return role === 'manager' || role === 'general_manager' || role === 'admin';
}

export function canCreateNewsletter(role: UserRole | null | undefined): boolean {
  return hasManagerAccess(role);
}

export function canEditNewsletter(
  role: UserRole | null | undefined,
  userId: string | null | undefined,
  newsletter: Newsletter,
): boolean {
  if (role === 'admin') {
    return true;
  }

  if (role !== 'author' && role !== 'manager' && role !== 'general_manager') {
    return false;
  }

  return Boolean(userId && newsletter.createdById && newsletter.createdById === userId);
}

export function canDeleteNewsletter(role: UserRole | null | undefined): boolean {
  return role === 'admin';
}
