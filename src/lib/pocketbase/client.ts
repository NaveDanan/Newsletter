import PocketBase, { BaseAuthStore, type RecordModel } from 'pocketbase';

export const POCKETBASE_URL = import.meta.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090';
const AUTH_STORAGE_KEY = 'pb_auth';

let pb: PocketBase | null = null;

export const USER_ROLES = ['viewer', 'author', 'manager', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export function normalizeUserRole(value: unknown): UserRole {
  if (typeof value === 'string' && USER_ROLES.includes(value as UserRole)) {
    return value as UserRole;
  }

  return 'viewer';
}

export interface PocketBaseUser {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: UserRole;
  verified: boolean;
  created: string;
  updated: string;
}

export type SSOProvider = 'google' | 'github' | 'microsoft' | 'custom';

export type AdminSyncResult = 'skipped' | 'verified' | 'created' | 'password_mismatch' | 'error';

export function getPocketBase(): PocketBase {
  if (!pb) {
    pb = new PocketBase(POCKETBASE_URL);

    const authData = localStorage.getItem(AUTH_STORAGE_KEY);
    if (authData) {
      try {
        const parsed = JSON.parse(authData) as { token?: string; model?: RecordModel | null };
        if (parsed.token && parsed.model) {
          pb.authStore.save(parsed.token, parsed.model);
        }
      } catch (error) {
        console.error('Failed to restore PocketBase auth state:', error);
      }
    }

    pb.authStore.onChange((token, model) => {
      if (token && model) {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, model }));
        return;
      }

      localStorage.removeItem(AUTH_STORAGE_KEY);
    });
  }

  return pb;
}

export function resetPocketBase(): void {
  if (pb) {
    pb.authStore.clear();
  }

  pb = null;
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function getSSOCallbackUrl(): string {
  return `${window.location.origin}/sso-callback`;
}

export async function ensureConfiguredAdminUser(): Promise<AdminSyncResult> {
  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL?.trim();
  const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD?.trim();

  if (!adminEmail || !adminPassword) {
    return 'skipped';
  }

  const syncClient = new PocketBase(POCKETBASE_URL, new BaseAuthStore());

  try {
    await syncClient.collection('users').authWithPassword(adminEmail, adminPassword);
    return 'verified';
  } catch {
    try {
      await syncClient.collection('users').create({
        email: adminEmail,
        password: adminPassword,
        passwordConfirm: adminPassword,
        name: 'Admin',
        role: 'admin',
      });

      return 'created';
    } catch (createError) {
      const message =
        createError instanceof Error ? createError.message.toLowerCase() : '';

      if (
        message.includes('already exists') ||
        message.includes('unique') ||
        message.includes('duplicate')
      ) {
        return 'password_mismatch';
      }

      return 'error';
    }
  }
}
