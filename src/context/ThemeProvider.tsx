import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  currentAccountAppearance,
  saveAccountAppearance,
  subscribeToAccountAppearance,
  type AccountAppearance,
  type AppearancePreferences,
} from '@/lib/pocketbase/profile';
import {
  ACCENT_PRESETS,
  ThemeContext,
  type AccentKey,
  type DeviceMode,
  type Theme,
} from '@/context/ThemeContext';
import {
  ACCENT_CUSTOM_STORAGE_KEY,
  ACCENT_PRESET_STORAGE_KEY,
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  HEX_COLOR,
  THEME_STORAGE_KEY,
  VISITOR_APPEARANCE_OWNER,
  isAccentKey,
  isTheme,
  resolveAccountAppearance,
  type AppearanceMirror,
  type AppearanceState,
} from '@/context/appearance';

function hexToRgb(hex: string) {
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map((c) => c + c).join('');
  }
  const num = parseInt(cleanHex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function hexToHsl(hex: string) {
  const { r: r255, g: g255, b: b255 } = hexToRgb(hex);
  const r = r255 / 255;
  const g = g255 / 255;
  const b = b255 / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h = Math.round(h * 60);
  }
  return `${h} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const PERSIST_DELAY_MS = 600;
const NARROW_VIEWPORT_QUERY = '(max-width: 767px)';

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private browsing or a full quota: the choice still applies for this visit.
  }
}

function readStoredValue(key: string) {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readAppearanceMirror(): AppearanceMirror {
  const saved = readStoredValue(APPEARANCE_STORAGE_KEY);
  if (saved) {
    try {
      const mirror = JSON.parse(saved) as Partial<AppearanceMirror> | null;
      if (mirror && typeof mirror.owner === 'string'
        && typeof mirror.theme === 'string' && isTheme(mirror.theme)
        && typeof mirror.accentKey === 'string' && isAccentKey(mirror.accentKey)
        && typeof mirror.customHex === 'string' && HEX_COLOR.test(mirror.customHex)) {
        return { owner: mirror.owner, theme: mirror.theme, accentKey: mirror.accentKey, customHex: mirror.customHex };
      }
    } catch {
      // Fall back to the old device preferences when upgrading a stored mirror.
    }
  }
  const theme = readStoredValue(THEME_STORAGE_KEY);
  const accentKey = readStoredValue(ACCENT_PRESET_STORAGE_KEY);
  const customHex = readStoredValue(ACCENT_CUSTOM_STORAGE_KEY);
  return {
    owner: null,
    theme: theme && isTheme(theme) ? theme : DEFAULT_APPEARANCE.theme,
    accentKey: accentKey && isAccentKey(accentKey) ? accentKey : DEFAULT_APPEARANCE.accentKey,
    customHex: customHex && HEX_COLOR.test(customHex) ? customHex : DEFAULT_APPEARANCE.customHex,
  };
}

function rememberAppearance(owner: string, appearance: AppearanceState) {
  // One storage write keeps ownership and preferences together across tabs.
  remember(APPEARANCE_STORAGE_KEY, JSON.stringify({ owner, ...appearance }));
  remember(THEME_STORAGE_KEY, appearance.theme);
  remember(ACCENT_PRESET_STORAGE_KEY, appearance.accentKey);
  remember(ACCENT_CUSTOM_STORAGE_KEY, appearance.customHex);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [initialAppearance] = useState(readAppearanceMirror);
  const [theme, setThemeState] = useState<Theme>(initialAppearance.theme);

  const [deviceMode, setDeviceMode] = useState<DeviceMode>(() => (
    typeof window !== 'undefined' && window.matchMedia(NARROW_VIEWPORT_QUERY).matches ? 'mobile' : 'web'
  ));

  const [accentKey, setAccentKeyState] = useState<AccentKey>(initialAppearance.accentKey);
  const [customHex, setCustomHexState] = useState<string>(initialAppearance.customHex);

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const updateResolvedTheme = () => {
      if (theme === 'system') {
        setResolvedTheme(mediaQuery.matches ? 'dark' : 'light');
      } else {
        setResolvedTheme(theme);
      }
    };

    updateResolvedTheme();
    
    const handler = (e: MediaQueryListEvent) => {
      if (theme === 'system') {
        setResolvedTheme(e.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme]);

  // Apply theme attributes to document.documentElement
  useEffect(() => {
    const root = document.documentElement;
    
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
    }
  }, [resolvedTheme]);

  // Apply accent color CSS variables to document.documentElement
  useEffect(() => {
    const root = document.documentElement;
    let color = '#ff3b53';
    let hover = '#e8253e';
    let glow = 'rgba(255, 59, 83, 0.38)';
    let ambient = 'rgba(255, 59, 83, 0.06)';
    let contrast = '#ffffff';

    if (accentKey === 'custom') {
      const { r, g, b } = hexToRgb(customHex);
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      color = customHex;
      hover = customHex;
      glow = `rgba(${r}, ${g}, ${b}, 0.35)`;
      ambient = `rgba(${r}, ${g}, ${b}, 0.06)`;
      contrast = lum > 0.58 ? '#121214' : '#ffffff';
    } else if (ACCENT_PRESETS[accentKey]) {
      const p = ACCENT_PRESETS[accentKey];
      color = p.color;
      hover = p.hover;
      glow = p.glow;
      ambient = p.ambient;
      contrast = p.contrast;
    }

    const hslValue = hexToHsl(color);
    const foregroundHsl = contrast === '#121214' ? '228 14% 8%' : '0 0% 100%';

    root.style.setProperty('--primary-accent', color);
    root.style.setProperty('--primary-accent-hover', hover);
    root.style.setProperty('--primary-accent-glow', glow);
    root.style.setProperty('--ambient-accent-glow', ambient);
    root.style.setProperty('--accent-contrast', contrast);

    // Keep aliases synced across all components and legacy palettes
    root.style.setProperty('--primary-yellow', color);
    root.style.setProperty('--primary-yellow-hover', hover);
    root.style.setProperty('--primary-yellow-glow', glow);
    root.style.setProperty('--red-primary', color);
    root.style.setProperty('--red-dark', hover);
    root.style.setProperty('--red-light', glow);

    // Tailwind primary & ring token integration
    root.style.setProperty('--primary', hslValue);
    root.style.setProperty('--primary-foreground', foregroundHsl);
    root.style.setProperty('--ring', hslValue);
    root.style.setProperty('--accent', hslValue);
    root.style.setProperty('--accent-foreground', foregroundHsl);
  }, [accentKey, customHex]);

  // Appearance follows the account, not the browser. The account's stored
  // choice is adopted whenever it differs from what this tab last synced (sign
  // in, the post-reload refresh, another device), and local edits are written
  // back. localStorage stays the instant and anonymous source of truth.
  //
  // Writes are serialized per tab: one save in flight at a time, later edits
  // merge into `pending` and go out once it settles, so an older save can never
  // land after a newer one. Every guard is scoped to the signed-in account, so
  // a previous account's unfinished save never blocks or overwrites the next.
  //
  // An echo that arrives while an edit is pending is ignored rather than
  // dropped: the account record is re-read once the last save settles, so a
  // change another tab made in the meantime still reaches this one.
  const accountIdRef = useRef<string | null>(null);
  // The account whose appearance is on screen. It outlives sign-out on purpose:
  // a different account must not inherit it, while the same account signing
  // back in keeps its own look. Restore the owner with the mirror on reload.
  const appearanceOwnerRef = useRef<string | null>(initialAppearance.owner);
  const syncedAppearanceRef = useRef('');
  const pendingAppearanceRef = useRef<{ userId: string; patch: Partial<AppearancePreferences> } | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const saveInFlightForRef = useRef<string | null>(null);
  // What is on screen, readable from callbacks that outlive a render.
  const appearanceRef = useRef<AppearanceState>({ theme, accentKey, customHex });

  useEffect(() => {
    appearanceRef.current = { theme, accentKey, customHex };
  }, [theme, accentKey, customHex]);

  const adoptAccountAppearance = useCallback((account: AccountAppearance | null) => {
    const userId = account ? account.userId : null;
    if (userId !== accountIdRef.current) {
      // A different account (or none): anything queued belonged to the last one.
      accountIdRef.current = userId;
      syncedAppearanceRef.current = '';
      pendingAppearanceRef.current = null;
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    }

    // Signing out changes nothing on screen: there is no account to follow and
    // the mirror in localStorage is what a visitor sees.
    if (!account) {
      return;
    }

    // Unsaved local edits win until they land; their echo must not undo them.
    const hasLocalEdits = persistTimerRef.current !== null
      || pendingAppearanceRef.current !== null
      || saveInFlightForRef.current === userId;
    if (hasLocalEdits) {
      return;
    }

    const signature = JSON.stringify(account.preferences);
    if (signature === syncedAppearanceRef.current) {
      return;
    }
    syncedAppearanceRef.current = signature;

    const current = appearanceRef.current;
    const next = resolveAccountAppearance(appearanceOwnerRef.current, account, current);
    appearanceOwnerRef.current = account.userId;
    appearanceRef.current = next;

    // The mirror always matches the account that owns the screen, so a reload
    // paints its look rather than the one before it.
    if (next.theme !== current.theme) {
      setThemeState(next.theme);
    }
    if (next.customHex !== current.customHex) {
      setCustomHexState(next.customHex);
    }
    if (next.accentKey !== current.accentKey) {
      setAccentKeyState(next.accentKey);
    }
    rememberAppearance(account.userId, next);
  }, []);

  useEffect(() => {
    adoptAccountAppearance(currentAccountAppearance());
    return subscribeToAccountAppearance(adoptAccountAppearance);
  }, [adoptAccountAppearance]);

  const flushAppearance = () => {
    const pending = pendingAppearanceRef.current;
    if (!pending || saveInFlightForRef.current !== null) {
      return;
    }
    pendingAppearanceRef.current = null;
    saveInFlightForRef.current = pending.userId;

    saveAccountAppearance(pending.userId, pending.patch)
      .catch((error: unknown) => {
        console.warn('Could not save appearance to the account:', error);
      })
      .finally(() => {
        saveInFlightForRef.current = null;
        // Edits made meanwhile wait for their debounce, if it is still running.
        if (persistTimerRef.current !== null) {
          return;
        }
        if (pendingAppearanceRef.current !== null) {
          flushAppearance();
          return;
        }
        // Nothing local is left, so the account record decides again. The SDK
        // merged the response into the auth store, so this reads our own write
        // plus anything another tab stored while this one was saving — the
        // change that had to be ignored is applied here instead of being
        // stamped as synchronized and lost.
        adoptAccountAppearance(currentAccountAppearance());
      });
  };

  // Debounced so dragging the custom colour picker sends one write, not dozens.
  const persistAppearance = (patch: Partial<AppearancePreferences>) => {
    const account = currentAccountAppearance();
    if (!account) {
      // Signed out: the choice lives in localStorage for this device only.
      // Ownership stays with the account that last painted the screen, so a
      // different account signing in still starts from the app defaults.
      if (appearanceOwnerRef.current === null) {
        appearanceOwnerRef.current = VISITOR_APPEARANCE_OWNER;
      }
      rememberAppearance(appearanceOwnerRef.current, appearanceRef.current);
      return;
    }
    rememberAppearance(account.userId, appearanceRef.current);
    const queued = pendingAppearanceRef.current;
    pendingAppearanceRef.current = {
      userId: account.userId,
      patch: queued && queued.userId === account.userId ? { ...queued.patch, ...patch } : patch,
    };
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      flushAppearance();
    }, PERSIST_DELAY_MS);
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    appearanceRef.current = { ...appearanceRef.current, theme: newTheme };
    remember(THEME_STORAGE_KEY, newTheme);
    persistAppearance({ themePreference: newTheme });
  };

  // The stage is chosen by the viewport alone: the phone frame on narrow
  // screens, the fluid web layout everywhere else.
  useEffect(() => {
    const query = window.matchMedia(NARROW_VIEWPORT_QUERY);
    const apply = () => setDeviceMode(query.matches ? 'mobile' : 'web');

    apply();
    query.addEventListener('change', apply);
    return () => { query.removeEventListener('change', apply); };
  }, []);

  const setAccentColor = (presetKey: AccentKey, hex?: string) => {
    setAccentKeyState(presetKey);
    appearanceRef.current = { ...appearanceRef.current, accentKey: presetKey };
    remember(ACCENT_PRESET_STORAGE_KEY, presetKey);
    if (presetKey === 'custom' && hex && HEX_COLOR.test(hex)) {
      setCustomHexState(hex);
      appearanceRef.current = { ...appearanceRef.current, customHex: hex };
      remember(ACCENT_CUSTOM_STORAGE_KEY, hex);
      persistAppearance({ accentPreset: presetKey, accentCustomHex: hex });
      return;
    }
    persistAppearance({ accentPreset: presetKey });
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        setTheme,
        deviceMode,
        accentKey,
        customHex,
        setAccentColor,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
