import { createContext, useContext } from 'react';
import type { Locale } from '@/locales/messages';

export type MessageParams = Record<string, number | string>;

export interface LocaleContextValue {
  locale: Locale;
  isRTL: boolean;
  dir: 'ltr' | 'rtl';
  toggleLocale: () => void;
  setLocale: (nextLocale: Locale) => void;
  t: (key: string, params?: MessageParams) => string;
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number) => string;
  formatRelativeTime: (value: Date | string | number) => string;
}

export const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useLocale() {
  const context = useContext(LocaleContext);

  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }

  return context;
}
