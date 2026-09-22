import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type DeviceMode = 'desktop' | 'web' | 'mobile';
export type AccentKey = 'red' | 'yellow' | 'lime' | 'cyan' | 'purple' | 'pink' | 'orange' | 'custom';

export interface AccentPreset {
  name: string;
  color: string;
  hover: string;
  glow: string;
  ambient: string;
  contrast: string;
}

export const ACCENT_PRESETS: Record<Exclude<AccentKey, 'custom'>, AccentPreset> = {
  red: {
    name: 'Crimson Red',
    color: '#ff3b53',
    hover: '#e8253e',
    glow: 'rgba(255, 59, 83, 0.38)',
    ambient: 'rgba(255, 59, 83, 0.06)',
    contrast: '#ffffff',
  },
  yellow: {
    name: 'Electric Yellow',
    color: '#ffe600',
    hover: '#f3dc00',
    glow: 'rgba(255, 230, 0, 0.35)',
    ambient: 'rgba(255, 230, 0, 0.05)',
    contrast: '#121214',
  },
  lime: {
    name: 'Neon Lime',
    color: '#10f57a',
    hover: '#00e66b',
    glow: 'rgba(16, 245, 122, 0.35)',
    ambient: 'rgba(16, 245, 122, 0.05)',
    contrast: '#121214',
  },
  cyan: {
    name: 'Cyber Cyan',
    color: '#00e5ff',
    hover: '#00ccee',
    glow: 'rgba(0, 229, 255, 0.35)',
    ambient: 'rgba(0, 229, 255, 0.05)',
    contrast: '#121214',
  },
  purple: {
    name: 'Electric Purple',
    color: '#b066ff',
    hover: '#9c42ff',
    glow: 'rgba(176, 102, 255, 0.38)',
    ambient: 'rgba(176, 102, 255, 0.06)',
    contrast: '#ffffff',
  },
  pink: {
    name: 'Hot Magenta',
    color: '#ff2a85',
    hover: '#f71a78',
    glow: 'rgba(255, 42, 133, 0.38)',
    ambient: 'rgba(255, 42, 133, 0.06)',
    contrast: '#ffffff',
  },
  orange: {
    name: 'Sunset Orange',
    color: '#ff7a00',
    hover: '#f26e00',
    glow: 'rgba(255, 122, 0, 0.38)',
    ambient: 'rgba(255, 122, 0, 0.06)',
    contrast: '#ffffff',
  },
};

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

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  deviceMode: DeviceMode;
  setDeviceMode: (mode: DeviceMode) => void;
  accentKey: AccentKey;
  customHex: string;
  setAccentColor: (presetKey: AccentKey, customHex?: string) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('artsocial-theme') as Theme;
      return saved || 'dark';
    }
    return 'dark';
  });

  const [deviceMode, setDeviceModeState] = useState<DeviceMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('artsocial-device-mode') as DeviceMode;
      return saved || 'web';
    }
    return 'web';
  });

  const [accentKey, setAccentKeyState] = useState<AccentKey>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('artsocial-accent-preset') as AccentKey;
      return saved || 'red';
    }
    return 'red';
  });

  const [customHex, setCustomHexState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('artsocial-accent-custom');
      return saved || '#ff3b53';
    }
    return '#ff3b53';
  });

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

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem('artsocial-theme', newTheme);
    } catch {}
  };

  const setDeviceMode = (mode: DeviceMode) => {
    setDeviceModeState(mode);
    try {
      localStorage.setItem('artsocial-device-mode', mode);
    } catch {}
  };

  // Narrow viewports cannot host the desktop/web stage, so the phone frame takes
  // over automatically and the previous choice is restored when there is room again.
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');

    const apply = () => {
      setDeviceModeState((current) => {
        if (query.matches) {
          return 'mobile';
        }
        if (current !== 'mobile') {
          return current;
        }
        const saved = localStorage.getItem('artsocial-device-mode') as DeviceMode | null;
        return saved && saved !== 'mobile' ? saved : 'web';
      });
    };

    apply();
    query.addEventListener('change', apply);
    return () => { query.removeEventListener('change', apply); };
  }, []);

  const setAccentColor = (presetKey: AccentKey, hex?: string) => {
    setAccentKeyState(presetKey);
    try {
      localStorage.setItem('artsocial-accent-preset', presetKey);
    } catch {}
    if (presetKey === 'custom' && hex) {
      setCustomHexState(hex);
      try {
        localStorage.setItem('artsocial-accent-custom', hex);
      } catch {}
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        setTheme,
        deviceMode,
        setDeviceMode,
        accentKey,
        customHex,
        setAccentColor,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
