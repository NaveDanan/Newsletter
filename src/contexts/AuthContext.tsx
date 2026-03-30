import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  ensureConfiguredAdminUser,
  getPocketBase,
  getSSOCallbackUrl,
  normalizeUserRole,
  resetPocketBase,
  type PocketBaseUser,
  type SSOProvider,
} from '@/lib/pocketbase/client';

interface AuthContextType {
  user: PocketBaseUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, name: string) => Promise<boolean>;
  logout: () => void;
  initiateSSO: (provider: SSOProvider) => Promise<void>;
  handleSSOCallback: (code: string, provider: SSOProvider) => Promise<boolean>;
  requestPasswordReset: (email: string) => Promise<boolean>;
  confirmPasswordReset: (token: string, newPassword: string) => Promise<boolean>;
  requestEmailVerification: (email: string) => Promise<boolean>;
  confirmEmailVerification: (token: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
  const [user, setUser] = useState<PocketBaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const syncResult = await ensureConfiguredAdminUser();
      const adminEmail = import.meta.env.VITE_ADMIN_EMAIL?.trim().toLowerCase();

      if (syncResult === 'password_mismatch') {
        toast.error('Configured admin email exists in PocketBase, but the configured password does not match it.');
      }

      if (syncResult === 'error') {
        toast.error('Failed to sync the configured admin user with PocketBase.');
      }

      const authModel = pb.authStore.model as Record<string, unknown> | null;
      const authEmail = typeof authModel?.email === 'string' ? authModel.email.toLowerCase() : '';

      if (adminEmail && authModel?.id && authEmail === adminEmail && normalizeUserRole(authModel.role) !== 'admin') {
        try {
          await pb.collection('users').update(String(authModel.id), { role: 'admin' });
        } catch (error) {
          console.error('Failed to sync admin role:', error);
        }
      }
    })();

    const authModel = pb.authStore.model as Record<string, unknown> | null;
    if (authModel && pb.authStore.isValid) {
      const avatarFile = typeof authModel.avatar === 'string' ? authModel.avatar : '';
      const avatar = avatarFile ? pb.files.getUrl(authModel, avatarFile) : undefined;
      setUser(mapAuthUser(authModel, avatar));
    }

    setIsLoading(false);

    const unsubscribe = pb.authStore.onChange((token, model) => {
      if (token && model) {
        const authModelRecord = model as Record<string, unknown>;
        const avatarFile = typeof authModelRecord.avatar === 'string' ? authModelRecord.avatar : '';
        const avatar = avatarFile ? pb.files.getUrl(authModelRecord, avatarFile) : undefined;
        setUser(mapAuthUser(authModelRecord, avatar));
        return;
      }

      setUser(null);
    });

    return () => unsubscribe();
  }, [pb]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      setIsLoading(true);
      const authData = await pb.collection('users').authWithPassword(email, password);
      if (!authData.token) {
        return false;
      }

      toast.success('Welcome back!');
      return true;
    } catch (error) {
      console.error('Login error:', error);
      const message = error instanceof Error ? error.message : 'Invalid email or password';
      toast.error(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [pb]);

  const register = useCallback(async (email: string, password: string, name: string) => {
    try {
      setIsLoading(true);
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
      await login(email, password);
      return true;
    } catch (error) {
      console.error('Registration error:', error);
      const message = error instanceof Error ? error.message : 'Failed to create account';
      toast.error(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [login, pb]);

  const logout = useCallback(() => {
    resetPocketBase();
    setUser(null);
    toast.success('Signed out');
  }, []);

  const initiateSSO = useCallback(async (provider: SSOProvider) => {
    try {
      const authMethods = await pb.collection('users').listAuthMethods();
      const providers = (authMethods as { authProviders?: Array<Record<string, string>> }).authProviders || [];
      const oauthProvider = providers.find((entry) => entry.name === provider);

      if (!oauthProvider) {
        toast.error(`${provider} login is not configured`);
        return;
      }

      localStorage.setItem('sso_provider', provider);
      localStorage.setItem('sso_state', oauthProvider.state);
      localStorage.setItem('sso_code_verifier', oauthProvider.codeVerifier);

      window.location.href = oauthProvider.authUrl + getSSOCallbackUrl();
    } catch (error) {
      console.error('SSO initiation error:', error);
      const message = error instanceof Error ? error.message : 'Failed to initiate SSO';
      toast.error(message);
    }
  }, [pb]);

  const handleSSOCallback = useCallback(async (code: string, provider: SSOProvider) => {
    try {
      setIsLoading(true);
      const codeVerifier = localStorage.getItem('sso_code_verifier');

      if (!codeVerifier) {
        toast.error('Invalid SSO session');
        return false;
      }

      await pb.collection('users').authWithOAuth2Code(provider, code, codeVerifier, getSSOCallbackUrl());

      localStorage.removeItem('sso_provider');
      localStorage.removeItem('sso_state');
      localStorage.removeItem('sso_code_verifier');
      toast.success('Welcome!');
      return true;
    } catch (error) {
      console.error('SSO callback error:', error);
      const message = error instanceof Error ? error.message : 'SSO authentication failed';
      toast.error(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [pb]);

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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
