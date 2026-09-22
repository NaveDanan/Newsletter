import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon, Camera01Icon, Delete02Icon, GlobeIcon, PencilEdit01Icon } from '@hugeicons/core-free-icons';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { UserAvatarCircle } from '@/components/UserAvatarCircle';
import { ImageCropperDialog } from '@/components/profile/ImageCropperDialog';
import { NotificationPreferences } from '@/components/profile/NotificationPreferences';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useLocale } from '@/contexts/LocaleContext';
import { removeUserAvatar, uploadUserAvatar } from '@/lib/pocketbase/profile';

const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/webp,image/gif,image/avif';

interface ProfilePageProps {
  onBack: () => void;
}

export function ProfilePage({ onBack }: ProfilePageProps) {
  const { user, updateProfile } = useAuth();
  const { t, dir, isRTL, toggleLocale } = useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPreparingAvatar, setIsPreparingAvatar] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  // Seeded once, deliberately not synced from an effect: this page is the only
  // writer of `user.name`, and `react-hooks/set-state-in-effect` is an error here.
  const [name, setName] = useState(() => user?.name ?? '');

  if (!user) {
    return null;
  }

  const handlePickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    // Cleared so re-picking the same file still fires a change event.
    event.target.value = '';
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error(t('profile.invalidImage'));
      return;
    }
    setPendingFile(file);
  };

  const handleCropApply = async (blob: Blob) => {
    if (isUploading) {
      return;
    }
    setIsUploading(true);
    try {
      // The SDK merges the updated record into authStore, so every avatar in the
      // app (header, this page, comment threads) refreshes without a reload.
      await uploadUserAvatar(user.id, blob);
      setPendingFile(null);
      toast.success(t('profile.avatarUpdated'));
    } catch (error) {
      console.error('Avatar upload failed:', error);
      toast.error(error instanceof Error ? error.message : t('profile.avatarFailed'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleEditAvatar = async () => {
    if (!user.avatar || isUploading || isPreparingAvatar) {
      return;
    }

    setIsPreparingAvatar(true);
    try {
      const response = await fetch(user.avatar);
      if (!response.ok) {
        throw new Error(t('profile.avatarEditFailed'));
      }

      const blob = await response.blob();
      setPendingFile(new File([blob], 'profile-avatar', { type: blob.type || 'image/png' }));
    } catch (error) {
      console.error('Avatar edit preparation failed:', error);
      toast.error(error instanceof Error ? error.message : t('profile.avatarEditFailed'));
    } finally {
      setIsPreparingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (isUploading) {
      return;
    }
    setIsUploading(true);
    try {
      await removeUserAvatar(user.id);
      toast.success(t('profile.avatarRemoved'));
    } catch (error) {
      console.error('Avatar removal failed:', error);
      toast.error(error instanceof Error ? error.message : t('profile.avatarFailed'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t('profile.nameRequired'));
      return;
    }
    setIsSavingName(true);
    const ok = await updateProfile({ name: trimmed });
    setIsSavingName(false);
    if (ok) {
      setName(trimmed);
      toast.success(t('profile.saved'));
    }
  };

  const isNameDirty = name.trim() !== user.name && name.trim().length > 0;

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
            <CardTitle className="text-base font-bold text-[var(--text-primary)]">{t('profile.pictureTitle')}</CardTitle>
            <CardDescription className="text-[var(--text-secondary)]">{t('profile.pictureHint')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-5">
            <div className="relative">
              <UserAvatarCircle name={user.name} email={user.email} src={user.avatar} size={96} />
              <DropdownMenu dir={dir}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={isUploading || isPreparingAvatar}
                    aria-label={t('profile.pictureActions')}
                    className="absolute -bottom-1 -end-1 flex size-8 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] shadow-sm transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-accent)] disabled:opacity-50"
                  >
                    <HugeiconsIcon icon={Camera01Icon} className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align={isRTL ? 'end' : 'start'}
                  sideOffset={8}
                  className="w-48 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-1.5 shadow-xl backdrop-blur-xl"
                >
                  <DropdownMenuItem
                    className="cursor-pointer gap-2.5 rounded-xl px-2.5 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-pill-hover)] focus:bg-[var(--bg-pill-hover)]"
                    onSelect={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    <HugeiconsIcon icon={Camera01Icon} className="size-4 text-[var(--text-secondary)]" />
                    {t('profile.uploadImage')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer gap-2.5 rounded-xl px-2.5 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-pill-hover)] focus:bg-[var(--bg-pill-hover)]"
                    onSelect={() => { void handleEditAvatar(); }}
                    disabled={!user.avatar || isUploading || isPreparingAvatar}
                  >
                    <HugeiconsIcon icon={PencilEdit01Icon} className="size-4 text-[var(--text-secondary)]" />
                    {t('profile.editImage')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-1 bg-[var(--border-subtle)]" />
                  <DropdownMenuItem
                    className="cursor-pointer gap-2.5 rounded-xl px-2.5 py-2 text-sm text-[var(--primary-accent)] hover:bg-[var(--primary-accent)]/10 focus:bg-[var(--primary-accent)]/10"
                    onSelect={() => { void handleRemoveAvatar(); }}
                    disabled={!user.avatar || isUploading}
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="size-4 text-current" />
                    {t('profile.removeImage')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              className="hidden"
              onChange={handlePickFile}
            />
          </CardContent>
        </Card>

        <Card className="border-[var(--border-subtle)] bg-[var(--bg-card)] rounded-3xl shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base font-bold text-[var(--text-primary)]">{t('profile.detailsTitle')}</CardTitle>
            <CardDescription className="text-[var(--text-secondary)]">{t('profile.detailsHint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="profile-name" className="text-sm font-semibold text-[var(--text-primary)]">
                {t('profile.nameLabel')}
              </Label>
              <Input
                id="profile-name"
                value={name}
                placeholder={t('profile.namePlaceholder')}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                maxLength={80}
                className="bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-primary)] rounded-full px-4 h-10"
              />
            </div>

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

            <div className="flex justify-end">
              <Button
                type="button"
                className="btn-hire-me"
                onClick={() => {
                  void handleSaveName();
                }}
                disabled={!isNameDirty || isSavingName}
              >
                {isSavingName ? t('profile.saving') : t('profile.save')}
              </Button>
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
        <NotificationPreferences key={user.id} />
      </main>

      {pendingFile ? (
        <ImageCropperDialog
          file={pendingFile}
          shape="avatar"
          onCancel={() => {
            setPendingFile(null);
          }}
          onApply={handleCropApply}
        />
      ) : null}
    </div>
  );
}
