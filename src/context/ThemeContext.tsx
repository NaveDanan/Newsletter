import { createContext, useContext } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type DeviceMode = 'web' | 'mobile';
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

export interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  deviceMode: DeviceMode;
  accentKey: AccentKey;
  customHex: string;
  setAccentColor: (presetKey: AccentKey, customHex?: string) => void;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
