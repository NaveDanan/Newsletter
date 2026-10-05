import { ACCENT_PRESETS, type AccentKey, type Theme } from '@/context/ThemeContext';
import type { AccountAppearance } from '@/lib/pocketbase/profile';

/**
 * The appearance rules ThemeProvider follows, kept pure so they can be read
 * and exercised on their own.
 *
 * An account stores three strings. PocketBase writes "" for a text field that
 * was never set, and nothing in the app ever stores "" back (every edit writes
 * a concrete value, including the explicit "system" theme), so an empty or
 * unrecognised field means "this account never chose", never "reset me".
 */

export interface AppearanceState {
  theme: Theme;
  accentKey: AccentKey;
  customHex: string;
}

export const THEME_STORAGE_KEY = 'artsocial-theme';
export const ACCENT_PRESET_STORAGE_KEY = 'artsocial-accent-preset';
export const ACCENT_CUSTOM_STORAGE_KEY = 'artsocial-accent-custom';
export const APPEARANCE_STORAGE_KEY = 'artsocial-appearance';
export const VISITOR_APPEARANCE_OWNER = '@visitor';

export interface AppearanceMirror extends AppearanceState {
  owner: string | null;
}

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** What a brand new visitor — and an account that never chose — looks like. */
export const DEFAULT_APPEARANCE: AppearanceState = {
  theme: 'system',
  accentKey: 'red',
  customHex: '#ff3b53',
};

export function isTheme(value: string): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function isAccentKey(value: string): value is AccentKey {
  return value === 'custom' || Object.prototype.hasOwnProperty.call(ACCENT_PRESETS, value);
}

/**
 * The appearance to show once `account` owns the screen.
 *
 * The browser mirror records its owner alongside the preferences. Only a
 * matching account or an explicit visitor choice may supply unset fields.
 * Another account, or an old mirror with unknown ownership, uses app defaults.
 * Ownership survives sign-out and reload, so A -> sign out -> reload -> B
 * cannot carry A's preferences into B.
 *
 * Fields the account did store always win, whoever the previous owner was.
 * Signing out keeps the current appearance: there is no account to follow, and
 * the next account decides whether to replace it.
 */
export function resolveAccountAppearance(
  previousAccountId: string | null,
  account: AccountAppearance | null,
  current: AppearanceState,
): AppearanceState {
  if (!account) {
    return current;
  }

  const canUseMirror = previousAccountId === account.userId || previousAccountId === VISITOR_APPEARANCE_OWNER;
  const fallback = canUseMirror ? current : DEFAULT_APPEARANCE;
  const { themePreference, accentPreset, accentCustomHex } = account.preferences;

  return {
    theme: isTheme(themePreference) ? themePreference : fallback.theme,
    accentKey: isAccentKey(accentPreset) ? accentPreset : fallback.accentKey,
    customHex: HEX_COLOR.test(accentCustomHex) ? accentCustomHex : fallback.customHex,
  };
}
