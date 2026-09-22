import { useTheme, ACCENT_PRESETS, type AccentKey, type DeviceMode } from '@/context/ThemeContext';
import { useLocale } from '@/contexts/LocaleContext';
import { Monitor, Globe, Smartphone, Moon, Sun } from 'lucide-react';
import { toast } from 'sonner';

export function DeviceToggleBar() {
  const {
    theme,
    resolvedTheme,
    setTheme,
    deviceMode,
    setDeviceMode,
    accentKey,
    customHex,
    setAccentColor,
  } = useTheme();
  const { t } = useLocale();

  const handleModeChange = (mode: DeviceMode) => {
    setDeviceMode(mode);
    const labels: Record<DeviceMode, string> = {
      desktop: 'Desktop App (1200px)',
      web: 'Web App (Fluid)',
      mobile: 'Mobile App (393px)',
    };
    toast.success(`Screen mode: ${labels[mode]}`);
  };

  const handleThemeChange = (newTheme: 'dark' | 'light') => {
    setTheme(newTheme);
    toast.success(`Theme: ${newTheme === 'dark' ? 'Dark 🌙' : 'Light ☀️'}`);
  };

  const handleAccentChange = (key: AccentKey) => {
    setAccentColor(key);
    const name = key === 'custom' ? 'Custom' : ACCENT_PRESETS[key]?.name;
    toast.success(`Accent: ${name} ✨`);
  };

  return (
    <div className="device-toggle-bar" role="toolbar" aria-label="Device, Theme and Accent Controls">
      <span className="device-toggle-label">Screen:</span>
      <div className="device-toggle-group">
        <button
          type="button"
          className={`device-toggle-btn ${deviceMode === 'desktop' ? 'active' : ''}`}
          onClick={() => handleModeChange('desktop')}
          title="Desktop App (1200px)"
        >
          <Monitor className="size-3.5" />
          <span className="hidden sm:inline">Desktop</span>
          <span className="device-dim">1200px</span>
        </button>
        <button
          type="button"
          className={`device-toggle-btn ${deviceMode === 'web' ? 'active' : ''}`}
          onClick={() => handleModeChange('web')}
          title="Web App (100% Fluid)"
        >
          <Globe className="size-3.5" />
          <span className="hidden sm:inline">Web App</span>
          <span className="device-dim">Fluid</span>
        </button>
        <button
          type="button"
          className={`device-toggle-btn ${deviceMode === 'mobile' ? 'active' : ''}`}
          onClick={() => handleModeChange('mobile')}
          title="Mobile App (393px phone frame)"
        >
          <Smartphone className="size-3.5" />
          <span className="hidden sm:inline">Mobile</span>
          <span className="device-dim">393px</span>
        </button>
      </div>

      <div className="top-controls-separator" />

      <span className="device-toggle-label">Theme:</span>
      <div className="theme-toggle-group">
        <button
          type="button"
          className={`theme-toggle-btn ${resolvedTheme === 'dark' ? 'active' : ''}`}
          onClick={() => handleThemeChange('dark')}
          title="Switch to Dark theme"
        >
          <Moon className="size-3.5" />
          <span>Dark</span>
        </button>
        <button
          type="button"
          className={`theme-toggle-btn ${resolvedTheme === 'light' ? 'active' : ''}`}
          onClick={() => handleThemeChange('light')}
          title="Switch to Light theme"
        >
          <Sun className="size-3.5" />
          <span>Light</span>
        </button>
      </div>

      <div className="top-controls-separator" />

      <span className="device-toggle-label">Accent:</span>
      <div className="accent-color-line-group" role="radiogroup" aria-label="Accent Palette">
        <button
          type="button"
          className={`accent-color-swatch ${accentKey === 'red' ? 'active' : ''}`}
          style={{ '--swatch-color': '#ff3b53' } as React.CSSProperties}
          onClick={() => handleAccentChange('red')}
          title="Crimson Red (Brand Signature)"
        />
        <button
          type="button"
          className={`accent-color-swatch ${accentKey === 'yellow' ? 'active' : ''}`}
          style={{ '--swatch-color': '#ffe600' } as React.CSSProperties}
          onClick={() => handleAccentChange('yellow')}
          title="Electric Yellow"
        />
        <button
          type="button"
          className={`accent-color-swatch ${accentKey === 'lime' ? 'active' : ''}`}
          style={{ '--swatch-color': '#10f57a' } as React.CSSProperties}
          onClick={() => handleAccentChange('lime')}
          title="Neon Lime"
        />
        <button
          type="button"
          className={`accent-color-swatch ${accentKey === 'cyan' ? 'active' : ''}`}
          style={{ '--swatch-color': '#00e5ff' } as React.CSSProperties}
          onClick={() => handleAccentChange('cyan')}
          title="Cyber Cyan"
        />
        <button
          type="button"
          className={`accent-color-swatch ${accentKey === 'purple' ? 'active' : ''}`}
          style={{ '--swatch-color': '#b066ff' } as React.CSSProperties}
          onClick={() => handleAccentChange('purple')}
          title="Electric Purple"
        />
        <button
          type="button"
          className={`accent-color-swatch ${accentKey === 'pink' ? 'active' : ''}`}
          style={{ '--swatch-color': '#ff2a85' } as React.CSSProperties}
          onClick={() => handleAccentChange('pink')}
          title="Hot Magenta"
        />
        <button
          type="button"
          className={`accent-color-swatch ${accentKey === 'orange' ? 'active' : ''}`}
          style={{ '--swatch-color': '#ff7a00' } as React.CSSProperties}
          onClick={() => handleAccentChange('orange')}
          title="Sunset Orange"
        />
        <div
          className={`accent-color-swatch custom-swatch ${accentKey === 'custom' ? 'active' : ''}`}
          style={{ '--swatch-color': customHex } as React.CSSProperties}
          title="Custom Color Picker"
        >
          <input
            type="color"
            value={customHex}
            onChange={(e) => setAccentColor('custom', e.target.value)}
            title="Custom Accent Color"
            aria-label="Custom Accent Color"
          />
        </div>
      </div>
    </div>
  );
}
