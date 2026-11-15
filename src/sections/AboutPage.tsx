import { HugeiconsIcon } from '@hugeicons/react';
import { Github01Icon } from '@hugeicons/core-free-icons';
import { ArrowLeft, Building2, Globe2, Scale, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/contexts/LocaleContext';
import { APP_VERSION } from '@/lib/app-version';

const NJ_LABS_GITHUB_URL = 'https://github.com/NJ-Labs/';
const NJ_LABS_SITE_URL = 'https://nj-labs.com';
const NJ_LABS_LOGO = '/nj-labs-logo.png';

interface AboutPageProps {
  onBack: () => void;
}

function AboutPoint({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-4 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card-alt)] p-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-pill)] text-[var(--primary-accent)]">
        {icon}
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-bold text-[var(--text-primary)]">{title}</h3>
        <p className="text-sm leading-6 text-[var(--text-secondary)]">{children}</p>
      </div>
    </div>
  );
}

export function AboutPage({ onBack }: AboutPageProps) {
  const { t, locale } = useLocale();
  const BackIcon = ArrowLeft;

  return (
    <div className="min-h-screen px-4 py-8 sm:py-12">
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <div>
          <Button type="button" variant="ghost" className="gap-2 px-2 text-[var(--text-muted)]" onClick={onBack}>
            <BackIcon className={locale === 'he' ? 'h-4 w-4 rotate-180' : 'h-4 w-4'} />
            {t('about.backHome')}
          </Button>
        </div>

        <header className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <img
            src={NJ_LABS_LOGO}
            alt={t('about.logoAlt')}
            width={112}
            height={112}
            className="h-24 w-24 shrink-0 object-contain sm:h-28 sm:w-28"
          />
          <div className="space-y-3">
            <p className="text-xs font-extrabold uppercase tracking-[0.24em] text-[var(--primary-accent)]">{t('about.eyebrow')}</p>
            <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-[var(--text-primary)] sm:text-4xl">{t('about.title')}</h1>
            <p className="inline-flex items-center rounded-full border border-[var(--border-card)] bg-[var(--bg-pill)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]" dir="ltr">
              {t('footer.version', { version: APP_VERSION })}
            </p>
          </div>
        </header>

        <section className="space-y-4 text-base leading-7 text-[var(--text-secondary)]">
          <p>{t('about.intro')}</p>
          <p>{t('about.mission')}</p>
        </section>

        <section className="grid gap-4">
          <AboutPoint icon={<Building2 className="h-5 w-5" />} title={t('about.onPremTitle')}>
            {t('about.onPremBody')}
          </AboutPoint>
          <AboutPoint icon={<Users className="h-5 w-5" />} title={t('about.voiceTitle')}>
            {t('about.voiceBody')}
          </AboutPoint>
          <AboutPoint icon={<Globe2 className="h-5 w-5" />} title={t('about.anywhereTitle')}>
            {t('about.anywhereBody')}
          </AboutPoint>
        </section>

        <section className="space-y-3 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--text-primary)]">
            <Scale className="h-5 w-5 text-[var(--primary-accent)]" />
            {t('about.legalTitle')}
          </h2>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">{t('about.ownership')}</p>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">{t('about.restrictions')}</p>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">{t('about.license')}</p>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border-card)] pt-6">
          <p className="text-sm text-[var(--text-muted)]">{t('about.madeBy')}</p>
          <div className="flex items-center gap-3">
            <a
              href={NJ_LABS_GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('about.githubLabel')}
              title={t('about.githubLabel')}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-card)] bg-[var(--bg-pill)] text-[var(--text-primary)] transition-colors hover:border-[var(--primary-accent)] hover:text-[var(--primary-accent)]"
            >
              <HugeiconsIcon icon={Github01Icon} className="h-5 w-5" />
            </a>
            <a
              href={NJ_LABS_SITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('about.siteLabel')}
              title={t('about.siteLabel')}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-card)] bg-[var(--bg-pill)] transition-colors hover:border-[var(--primary-accent)]"
            >
              <img src={NJ_LABS_LOGO} alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain" />
            </a>
          </div>
        </footer>
      </article>
    </div>
  );
}
