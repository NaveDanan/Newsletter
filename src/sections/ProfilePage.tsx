import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon, GlobeIcon } from '@hugeicons/core-free-icons';
import { AppearanceSettings } from '@/components/profile/AppearanceSettings';
import { NotificationPreferences } from '@/components/profile/NotificationPreferences';
import { ProfileIdentityEditor } from '@/components/profile/ProfileIdentityEditor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useLocale } from '@/contexts/LocaleContext';
import { useCommunitySession } from '@/hooks/useCommunitySession';

interface ProfilePageProps {
  onBack: () => void;
}

export function ProfilePage({ onBack }: ProfilePageProps) {
  const { user, isAuthenticated } = useAuth();
  const { t, isRTL, toggleLocale } = useLocale();
  // The community session owns the public profile record. Only the real record
  // is editable; the hook's signed-in placeholder must never be saved back.
  const { session, isLoading, error, refresh, saveProfile } = useCommunitySession(isAuthenticated);
  const profile = session?.profile ?? null;

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] transition-colors">
      <header className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[var(--bg-app)]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="rtl-rotate-180 size-4" />
            {t('common.back')}
          </button>
          <h1 className="ms-auto text-sm font-bold text-[var(--text-primary)]">{t('profile.title')}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h2 className="text-2xl font-extrabold text-[var(--text-primary)] tracking-tight">{t('profile.title')}</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{t('profile.subtitle')}</p>
        </div>

        <Card className="border-[var(--border-subtle)] bg-[var(--bg-card)] rounded-3xl shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base font-bold text-[var(--text-primary)]">{t('profile.publicTitle')}</CardTitle>
            <CardDescription className="text-[var(--text-secondary)]">{t('profile.publicHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="aspect-[4/1] w-full rounded-3xl" />
            ) : profile ? (
              <ProfileIdentityEditor key={profile.id} profile={profile} onSave={saveProfile} />
            ) : (
              <div className="space-y-3 rounded-2xl border border-dashed border-[var(--border-subtle)] p-5 text-sm text-[var(--text-secondary)]">
                <p>{error || t('profile.loadFailed')}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full border-[var(--border-subtle)] text-[var(--text-primary)]"
                  onClick={() => { void refresh(); }}
                >
                  {t('community.feed.retry')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-[var(--border-subtle)] bg-[var(--bg-card)] rounded-3xl shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base font-bold text-[var(--text-primary)]">{t('profile.detailsTitle')}</CardTitle>
            <CardDescription className="text-[var(--text-secondary)]">{t('profile.detailsHint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="profile-email" className="text-sm font-semibold text-[var(--text-primary)]">
                {t('profile.emailLabel')}
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="profile-email"
                  value={user.email}
                  readOnly
                  disabled
                  className="max-w-sm bg-[var(--bg-input)] opacity-75 border-[var(--border-subtle)] text-[var(--text-muted)] rounded-full px-4 h-10"
                />
                {!user.verified ? (
                  <Badge variant="outline" className="border-amber-500/40 text-amber-500 bg-amber-500/10 rounded-full px-3 py-1">
                    {t('profile.notVerified')}
                  </Badge>
                ) : null}
              </div>
              <p className="text-xs text-[var(--text-muted)]">{t('profile.emailHint')}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-[var(--text-primary)]">{t('profile.roleLabel')}</Label>
              <div>
                <Badge variant="secondary" className="bg-[var(--bg-pill)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-full px-3 py-1">
                  {t(`role.${user.role}`)}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[var(--border-subtle)] bg-[var(--bg-card)] rounded-3xl shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base font-bold text-[var(--text-primary)]">{t('profile.languageTitle')}</CardTitle>
            <CardDescription className="text-[var(--text-secondary)]">
              {t('profile.languageHint')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              className="gap-2 rounded-full border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-pill-hover)] text-[var(--text-primary)]"
              onClick={toggleLocale}
            >
              <HugeiconsIcon icon={GlobeIcon} className="size-4" />
              {isRTL ? t('common.switchToEnglish') : t('common.switchToHebrew')}
            </Button>
          </CardContent>
        </Card>

        <AppearanceSettings />

        <NotificationPreferences key={user.id} />
      </main>
    </div>
  );
}
