import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readStoredValue, writeStoredValue } from '@/lib/localStorage';
import { bootLogger } from '@/lib/bootLogger';
import { getMessage, type Locale } from '@/locales/messages';

const STORAGE_KEY = 'ai-break-locale';
const DEFAULT_LOCALE: Locale = 'he';

const localeMap: Record<Locale, { dir: 'ltr' | 'rtl'; intlLocale: string }> = {
  en: { dir: 'ltr', intlLocale: 'en-US' },
  he: { dir: 'rtl', intlLocale: 'he-IL' },
};

type MessageParams = Record<string, number | string>;

interface LocaleContextValue {
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

const LocaleContext = createContext<LocaleContextValue | null>(null);

function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'he';
}

function asDate(value: Date | string | number) {
  return value instanceof Date ? value : new Date(value);
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const storedLocale = readStoredValue<string>(STORAGE_KEY, DEFAULT_LOCALE);
    bootLogger.once(`locale:init:${String(storedLocale)}`, () => {
      bootLogger.step('locale', 'Resolved initial locale from local storage', {
        storedLocale,
        fallbackLocale: DEFAULT_LOCALE,
      });
    });
    return isLocale(storedLocale) ? storedLocale : DEFAULT_LOCALE;
  });

  const { dir, intlLocale } = localeMap[locale];

  useEffect(() => {
    writeStoredValue(STORAGE_KEY, locale);
    bootLogger.debug('locale', 'Persisted locale preference', { locale });
  }, [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
    document.body.dataset.locale = locale;
    bootLogger.step('locale', 'Applied document locale attributes', {
      locale,
      dir,
      intlLocale,
    });
  }, [dir, locale]);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    bootLogger.step('locale', 'Locale changed explicitly', { locale: nextLocale });
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((currentLocale) => (currentLocale === 'he' ? 'en' : 'he'));
  }, []);

  const t = useCallback((key: string, params: MessageParams = {}) => getMessage(locale, key, params), [locale]);

  const formatDate = useCallback((value: Date | string | number, options?: Intl.DateTimeFormatOptions) => {
    return new Intl.DateTimeFormat(intlLocale, options).format(asDate(value));
  }, [intlLocale]);

  const formatNumber = useCallback((value: number) => new Intl.NumberFormat(intlLocale).format(value), [intlLocale]);

  const formatRelativeTime = useCallback((value: Date | string | number) => {
    const target = asDate(value);
    const diffMs = target.getTime() - Date.now();
    const diffMinutes = Math.round(diffMs / (1000 * 60));
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    const rtf = new Intl.RelativeTimeFormat(intlLocale, { numeric: 'auto' });

    if (Math.abs(diffMinutes) < 60) {
      return rtf.format(diffMinutes, 'minute');
    }

    if (Math.abs(diffHours) < 24) {
      return rtf.format(diffHours, 'hour');
    }

    if (Math.abs(diffDays) < 7) {
      return rtf.format(diffDays, 'day');
    }

    return formatDate(target, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, [formatDate, intlLocale]);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    isRTL: dir === 'rtl',
    dir,
    toggleLocale,
    setLocale,
    t,
    formatDate,
    formatNumber,
    formatRelativeTime,
  }), [dir, formatDate, formatNumber, formatRelativeTime, locale, setLocale, t, toggleLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);

  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }

  return context;
}