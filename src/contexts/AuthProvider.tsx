import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { avatarUrlFor } from '@/lib/avatar';
import { bootLogger } from '@/lib/bootLogger';
import { disableBrowserNotifications } from '@/lib/browser-notifications';
import {
  getPocketBase,
  normalizeUserRole,
  resetPocketBase,
  type PocketBaseUser,
} from '@/lib/pocketbase/client';
import { AuthContext } from '@/contexts/AuthContext';
import { getSsoAuth } from '@/lib/auth/sso';
import { useLocale } from '@/contexts/LocaleContext';

function mapAuthUser(model: Record<string, unknown>, avatarUrl?: string): PocketBaseUser {
  const email = typeof model.email === 'string' ? model.email : '';

  return {
    id: typeof model.id === 'string' ? model.id : '',
    email,
    name: typeof model.name === 'string' && model.name ? model.name : email.split('@')[0] || 'User',
    avatar: avatarUrl,
    role: normalizeUserRole(model.role),
    verified: Boolean(model.verified),
    created: typeof model.created === 'string' ? model.created : '',
    updated: typeof model.updated === 'string' ? model.updated : '',
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pb = getPocketBase();
  const sso = getSsoAuth();
  const { t } = useLocale();
  const [user, setUser] = useState<PocketBaseUser | null>(() => {
    const model = pb.authStore.model as Record<string, unknown> | null;
    return model && pb.authStore.isValid ? mapAuthUser(model, avatarUrlFor(pb, model)) : null;
  });
  const [isLoading, setIsLoading] = useState(pb.authStore.isValid);

  useEffect(() => {
    let isMounted = true;

    bootLogger.once('auth:provider-effect-start', () => {
      bootLogger.step('auth', 'Auth provider initialization started');
    });

    const authModel = pb.authStore.model as Record<string, unknown> | null;
    if (authModel && pb.authStore.isValid) {
      const avatar = avatarUrlFor(pb, authModel);
      setUser(mapAuthUser(authModel, avatar));
      bootLogger.step('auth', 'Restored authenticated user from PocketBase auth store', {
        userId: String(authModel.id ?? ''),
        role: normalizeUserRole(authModel.role),
      });

      void pb.collection('users').authRefresh<Record<string, unknown>>()
        .then((authData) => {
          if (!isMounted) {
            return;
          }

          const refreshedModel = authData.record as Record<string, unknown> | null;
          if (!refreshedModel) {
            pb.authStore.clear();
            return;
          }

          const refreshedAvatar = avatarUrlFor(pb, refreshedModel);
          setUser(mapAuthUser(refreshedModel, refreshedAvatar));
          bootLogger.step('auth', 'Validated restored PocketBase auth state', {
            userId: String(refreshedModel.id ?? ''),
            role: normalizeUserRole(refreshedModel.role),
          });
        })
        .catch((error) => {
          if (!isMounted) {
            return;
          }

          pb.authStore.clear();
          bootLogger.warn('auth', 'Cleared stale PocketBase auth state after refresh failed', normalizeBootError(error));
        })
        .finally(() => {
          if (isMounted) {
            setIsLoading(false);
          }
        });
    } else {
      bootLogger.step('auth', 'No authenticated user was restored from PocketBase auth store');
      setIsLoading(false);
    }

    if (!authModel || !pb.authStore.isValid) {
      bootLogger.step('auth', 'Auth provider finished initial state hydration', {
        isAuthenticated: false,
      });
    }

    const unsubscribe = pb.authStore.onChange((token, model) => {
      if (token && model) {
        const authModelRecord = model as Record<string, unknown>;
        const avatar = avatarUrlFor(pb, authModelRecord);
        setUser(mapAuthUser(authModelRecord, avatar));
        bootLogger.step('auth', 'PocketBase auth store emitted authenticated user change', {
          userId: String(authModelRecord.id ?? ''),
          role: normalizeUserRole(authModelRecord.role),
        });
        setIsLoading(false);
        return;
      }

      setUser(null);
      setIsLoading(false);
      bootLogger.step('auth', 'PocketBase auth store emitted sign-out state');
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [pb]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      setIsLoading(true);
      sso.suppressAutomaticLogin();
      bootLogger.step('auth', 'Password login started', { email });
      const authData = await pb.collection('users').authWithPassword(email, password);
      if (!authData.token) {
        bootLogger.warn('auth', 'Password login completed without a token', { email });
        return false;
      }

      toast.success('Welcome back!');
      bootLogger.success('auth', 'Password login succeeded', { email });
      return true;
    } catch (error) {
      console.error('Login error:', error);
      bootLogger.error('auth', 'Password login failed', normalizeBootError(error));
      const message = error instanceof Error ? error.message : 'Invalid email or password';
      toast.error(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [pb, sso]);

  const register = useCallback(async (email: string, password: string, name: string) => {
    try {
      setIsLoading(true);
      bootLogger.step('auth', 'User registration started', { email });
      const record = await pb.collection('users').create({
        email,
        password,
        passwordConfirm: password,
        name,
        role: 'viewer',
      });

      if (!record.id) {
        return false;
      }

      await pb.collection('users').requestVerification(email);
      toast.success('Account created. Please verify your email.');
      bootLogger.success('auth', 'User registration succeeded', {
        email,
        userId: record.id,
      });
      await login(email, password);
      return true;
    } catch (error) {
      console.error('Registration error:', error);
      bootLogger.error('auth', 'User registration failed', normalizeBootError(error));
      const message = error instanceof Error ? error.message : 'Failed to create account';
      toast.error(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [login, pb]);

  const logout = useCallback(() => {
    void disableBrowserNotifications().catch(() => { /* Local unsubscribe still runs when offline. */ });
    resetPocketBase();
    setUser(null);
    toast.success('Signed out');
    bootLogger.step('auth', 'User logged out');
    sso.signOut();
  }, [sso]);

  useEffect(() => {
    if (!isLoading && !user) void sso.tryAutomaticLogin();
  }, [isLoading, user, sso]);

  const initiateSSO = useCallback(async () => {
    try {
      const result = await sso.start();
      if (result === 'unavailable') toast.error(t('sso.notConfigured'));
    } catch {
      toast.error(t('sso.startFailed'));
    }
  }, [sso, t]);

  const handleSSOCallback = useCallback(() => sso.complete(), [sso]);

  const requestPasswordReset = useCallback(async (email: string) => {
    try {
      await pb.collection('users').requestPasswordReset(email);
      toast.success('Password reset instructions sent');
      return true;
    } catch (error) {
      console.error('Password reset request error:', error);
      const message = error instanceof Error ? error.message : 'Failed to send password reset';
      toast.error(message);
      return false;
    }
  }, [pb]);

  const confirmPasswordReset = useCallback(async (token: string, newPassword: string) => {
    try {
      await pb.collection('users').confirmPasswordReset(token, newPassword, newPassword);
      toast.success('Password reset successfully');
      return true;
    } catch (error) {
      console.error('Password reset confirm error:', error);
      const message = error instanceof Error ? error.message : 'Failed to reset password';
      toast.error(message);
      return false;
    }
  }, [pb]);

  const requestEmailVerification = useCallback(async (email: string) => {
    try {
      await pb.collection('users').requestVerification(email);
      toast.success('Verification email sent');
      return true;
    } catch (error) {
      console.error('Email verification request error:', error);
      const message = error instanceof Error ? error.message : 'Failed to send verification email';
      toast.error(message);
      return false;
    }
  }, [pb]);

  const confirmEmailVerification = useCallback(async (token: string) => {
    try {
      await pb.collection('users').confirmVerification(token);
      toast.success('Email verified successfully');
      return true;
    } catch (error) {
      console.error('Email verification confirm error:', error);
      const message = error instanceof Error ? error.message : 'Failed to verify email';
      toast.error(message);
      return false;
    }
  }, [pb]);

  const updateProfile = useCallback(async (data: { name?: string }) => {
    const currentId = pb.authStore.record?.id;
    if (!currentId) {
      return false;
    }

    try {
      // The SDK merges the response into authStore and fires onChange, so the
      // subscriber above refreshes every useAuth() consumer on its own.
      await pb.collection('users').update(currentId, data);
      return true;
    } catch (error) {
      console.error('Profile update error:', error);
      const message = error instanceof Error ? error.message : 'Failed to update profile';
      toast.error(message);
      return false;
    }
  }, [pb]);

  const refreshUser = useCallback(async () => {
    if (!pb.authStore.isValid) {
      return;
    }

    try {
      await pb.collection('users').authRefresh<Record<string, unknown>>();
    } catch (error) {
      console.error('Auth refresh error:', error);
    }
  }, [pb]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user && pb.authStore.isValid,
        isLoading,
        login,
        register,
        logout,
        initiateSSO,
        handleSSOCallback,
        requestPasswordReset,
        confirmPasswordReset,
        requestEmailVerification,
        confirmEmailVerification,
        updateProfile,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
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
