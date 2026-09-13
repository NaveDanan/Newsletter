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
    <div className="min-h-screen bg-[#FAFAFA]">
      <header className="sticky top-0 z-50 border-b border-[#E5E5E5] bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-medium text-[#737373] transition-colors hover:text-[#171717]"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="rtl-rotate-180 size-4" />
            {t('common.back')}
          </button>
          <h1 className="ms-auto text-sm font-semibold text-[#171717]">{t('profile.title')}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h2 className="text-2xl font-bold text-[#171717]">{t('profile.title')}</h2>
          <p className="mt-1 text-sm text-[#737373]">{t('profile.subtitle')}</p>
        </div>

        <Card className="border-[#E5E5E5] bg-white">
          <CardHeader>
            <CardTitle className="text-base text-[#171717]">{t('profile.pictureTitle')}</CardTitle>
            <CardDescription className="text-[#737373]">{t('profile.pictureHint')}</CardDescription>
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
                    className="absolute -bottom-1 -end-1 flex size-8 items-center justify-center rounded-full border border-[#E5E5E5] bg-white text-[#737373] shadow-sm transition-colors hover:text-[#171717] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D93A3A] focus-visible:ring-offset-2 disabled:opacity-50"
                  >
                    <HugeiconsIcon icon={Camera01Icon} className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align={isRTL ? 'end' : 'start'}
                  sideOffset={8}
                  className="w-48 rounded-xl border border-[#E5E5E5] bg-white p-1.5 shadow-lg"
                >
                  <DropdownMenuItem
                    className="cursor-pointer gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#171717] focus:bg-[#F3F4F6] focus:text-[#171717]"
                    onSelect={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    <HugeiconsIcon icon={Camera01Icon} className="size-4 text-[#737373]" />
                    {t('profile.uploadImage')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#171717] focus:bg-[#F3F4F6] focus:text-[#171717]"
                    onSelect={() => { void handleEditAvatar(); }}
                    disabled={!user.avatar || isUploading || isPreparingAvatar}
                  >
                    <HugeiconsIcon icon={PencilEdit01Icon} className="size-4 text-[#737373]" />
                    {t('profile.editImage')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-1 bg-[#E5E5E5]" />
                  <DropdownMenuItem
                    className="cursor-pointer gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#D93A3A] focus:bg-[#FEE2E2] focus:text-[#B91C1C]"
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

        <Card className="border-[#E5E5E5] bg-white">
          <CardHeader>
            <CardTitle className="text-base text-[#171717]">{t('profile.detailsTitle')}</CardTitle>
            <CardDescription className="text-[#737373]">{t('profile.detailsHint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="profile-name" className="text-[#171717]">
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
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-email" className="text-[#171717]">
                {t('profile.emailLabel')}
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="profile-email"
                  value={user.email}
                  readOnly
                  disabled
                  className="max-w-sm bg-[#F3F4F6]"
                />
                {!user.verified ? (
                  <Badge variant="outline" className="border-[#F59E0B] text-[#B45309]">
                    {t('profile.notVerified')}
                  </Badge>
                ) : null}
              </div>
              <p className="text-xs text-[#737373]">{t('profile.emailHint')}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-[#171717]">{t('profile.roleLabel')}</Label>
              <div>
                <Badge variant="secondary">{t(`role.${user.role}`)}</Badge>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                className="bg-[#D93A3A] text-white hover:bg-[#B91C1C]"
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

        <Card className="border-[#E5E5E5] bg-white">
          <CardHeader>
            <CardTitle className="text-base text-[#171717]">{t('profile.languageTitle')}</CardTitle>
            <CardDescription className="text-[#737373]">
              {t('profile.languageHint')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="outline" className="gap-2" onClick={toggleLocale}>
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
