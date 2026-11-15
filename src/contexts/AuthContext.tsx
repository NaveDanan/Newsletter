import { createContext, useContext } from 'react';
import type { PocketBaseUser } from '@/lib/pocketbase/client';
import type { SsoCompletion } from '@/lib/auth/sso';

export interface AuthContextType {
  user: PocketBaseUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, name: string) => Promise<boolean>;
  logout: () => void;
  initiateSSO: () => Promise<void>;
  handleSSOCallback: () => Promise<SsoCompletion>;
  requestPasswordReset: (email: string) => Promise<boolean>;
  confirmPasswordReset: (token: string, newPassword: string) => Promise<boolean>;
  requestEmailVerification: (email: string) => Promise<boolean>;
  confirmEmailVerification: (token: string) => Promise<boolean>;
  updateProfile: (data: { name?: string }) => Promise<boolean>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
