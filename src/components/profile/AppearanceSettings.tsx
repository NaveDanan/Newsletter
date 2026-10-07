import { Monitor, Moon, Sun } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ACCENT_PRESETS, useTheme, type AccentKey, type Theme } from '@/context/ThemeContext';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';

const THEME_OPTIONS: { value: Theme; Icon: typeof Monitor }[] = [
  { value: 'system', Icon: Monitor },
  { value: 'dark', Icon: Moon },
  { value: 'light', Icon: Sun },
];

const ACCENT_KEYS = Object.keys(ACCENT_PRESETS) as Exclude<AccentKey, 'custom'>[];

const PILL_FOCUS =
  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--primary-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)]';

/**
 * Theme and accent pickers for the profile page. ThemeContext applies each
 * choice instantly and saves it to the signed-in account, so this stays purely
 * presentational; the whole app recolouring is the confirmation.
 */
export function AppearanceSettings() {
  const { theme, setTheme, accentKey, customHex, setAccentColor } = useTheme();
  const { t } = useLocale();

  return (
    <Card className="border-[var(--border-subtle)] bg-[var(--bg-card)] rounded-3xl shadow-[var(--shadow-card)]">
      <CardHeader>
        <CardTitle className="text-base font-bold text-[var(--text-primary)]">
          {t('profile.appearance.title')}
        </CardTitle>
        <CardDescription className="text-[var(--text-secondary)]">
          {t('profile.appearance.hint')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-7">
        <section className="space-y-3">
          <div>
            <h3 id="appearance-theme-label" className="text-sm font-semibold text-[var(--text-primary)]">
              {t('profile.appearance.themeLabel')}
            </h3>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{t('profile.appearance.themeHint')}</p>
          </div>
          <div role="radiogroup" aria-labelledby="appearance-theme-label" className="flex flex-wrap gap-2">
            {THEME_OPTIONS.map(({ value, Icon }) => {
              const selected = theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setTheme(value)}
                  className={cn(
                    'flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                    PILL_FOCUS,
                    selected
                      ? 'border-transparent bg-[var(--primary-accent)] text-[var(--accent-contrast)] shadow-[0_2px_14px_var(--primary-accent-glow)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-pill)] text-[var(--text-secondary)] hover:bg-[var(--bg-pill-hover)] hover:text-[var(--text-primary)]',
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {t(`profile.appearance.theme.${value}`)}
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h3 id="appearance-accent-label" className="text-sm font-semibold text-[var(--text-primary)]">
              {t('profile.appearance.accentLabel')}
            </h3>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{t('profile.appearance.accentHint')}</p>
          </div>
          <div
            role="radiogroup"
            aria-labelledby="appearance-accent-label"
            className="flex flex-wrap gap-2"
          >
            {ACCENT_KEYS.map((key) => {
              const selected = accentKey === key;
              const name = t(`profile.appearance.accent.${key}`);
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setAccentColor(key)}
                  className={cn(
                    'flex items-center gap-2 rounded-full border py-1.5 pe-3.5 ps-2 text-xs font-semibold transition-colors',
                    PILL_FOCUS,
                    selected
                      ? 'border-[var(--primary-accent)] bg-[var(--bg-pill-hover)] text-[var(--text-primary)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-pill)] text-[var(--text-secondary)] hover:bg-[var(--bg-pill-hover)] hover:text-[var(--text-primary)]',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="size-4 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: ACCENT_PRESETS[key].color }}
                  />
                  {name}
                </button>
              );
            })}
          </div>

          <div
            className={cn(
              'flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors',
              accentKey === 'custom'
                ? 'border-[var(--primary-accent)] bg-[var(--bg-pill-hover)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-pill)]',
            )}
          >
            <input
              id="appearance-accent-custom"
              type="color"
              value={customHex}
              onChange={(event) => setAccentColor('custom', event.target.value)}
              className={cn('size-8 shrink-0 cursor-pointer rounded-full border-none bg-transparent p-0', PILL_FOCUS)}
            />
            <div className="min-w-0">
              <label
                htmlFor="appearance-accent-custom"
                className="block cursor-pointer text-xs font-semibold text-[var(--text-primary)]"
              >
                {t('profile.appearance.accent.custom')}
              </label>
              <span className="font-mono text-[11px] uppercase text-[var(--text-secondary)]" dir="ltr">
                {customHex}
              </span>
            </div>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
