import PocketBase, { type RecordModel } from 'pocketbase';
import { bootLogger } from '@/lib/bootLogger';
import { getPocketBaseUrl } from '@/lib/runtime-config';

export const POCKETBASE_URL = getPocketBaseUrl();
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

export type SSOProvider = 'oidc' | 'microsoft' | 'custom';

export function getPocketBase(): PocketBase {
  if (!pb) {
    bootLogger.step('pocketbase', 'Creating PocketBase client', {
      url: POCKETBASE_URL,
    });
    pb = new PocketBase(POCKETBASE_URL);

    const authData = localStorage.getItem(AUTH_STORAGE_KEY);
    if (authData) {
      try {
        const parsed = JSON.parse(authData) as { token?: string; model?: RecordModel | null };
        if (parsed.token && parsed.model) {
          pb.authStore.save(parsed.token, parsed.model);
          bootLogger.step('pocketbase', 'Restored PocketBase auth state from local storage', {
            userId: parsed.model.id,
          });
        }
      } catch (error) {
        console.error('Failed to restore PocketBase auth state:', error);
        bootLogger.error('pocketbase', 'Failed to restore PocketBase auth state', normalizeBootError(error));
      }
    } else {
      bootLogger.step('pocketbase', 'No cached PocketBase auth state was found');
    }

    pb.authStore.onChange((token, model) => {
      if (token && model) {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, model }));
        bootLogger.debug('pocketbase', 'Persisted PocketBase auth state change', {
          userId: model.id,
        });
        return;
      }

      localStorage.removeItem(AUTH_STORAGE_KEY);
      bootLogger.debug('pocketbase', 'Cleared PocketBase auth state');
    });
  } else {
    bootLogger.debug('pocketbase', 'Reusing existing PocketBase client');
  }

  return pb;
}

export function resetPocketBase(): void {
  if (pb) {
    pb.authStore.clear();
  }

  pb = null;
  localStorage.removeItem(AUTH_STORAGE_KEY);
  bootLogger.step('pocketbase', 'PocketBase client reset and auth cache cleared');
}

export function getSSOCallbackUrl(): string {
  return `${window.location.origin}/sso-callback`;
}

function normalizeBootError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return error;
}
