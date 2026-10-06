import { HugeiconsIcon } from '@hugeicons/react';
import { Camera01Icon, Delete02Icon, Image01Icon, PencilEdit01Icon } from '@hugeicons/core-free-icons';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImageCropperDialog } from '@/components/profile/ImageCropperDialog';
import type { CropShape } from '@/components/profile/cropGeometry';
import { UserAvatarCircle } from '@/components/UserAvatarCircle';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useLocale } from '@/contexts/LocaleContext';
import { getPocketBaseErrorMessage } from '@/lib/pocketbase/community';
import { removeUserAvatar, updateUserName, uploadUserAvatar } from '@/lib/pocketbase/profile';
import {
  COMMUNITY_MAX_BIO_LENGTH,
  COMMUNITY_MAX_DISPLAY_NAME_LENGTH,
  COMMUNITY_MAX_HANDLE_LENGTH,
  COMMUNITY_MAX_LOCATION_LENGTH,
  type CommunityProfile,
  type CommunityProfilePatch,
} from '@/types/community';

const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/webp,image/gif,image/avif';

interface ImageActionsMenuProps {
  label: string;
  disabled: boolean;
  canEdit: boolean;
  onUpload: () => void;
  onEdit: () => void;
  onRemove: () => void;
  className: string;
}

function ImageActionsMenu({ label, disabled, canEdit, onUpload, onEdit, onRemove, className }: ImageActionsMenuProps) {
  const { t, dir, isRTL } = useLocale();

  return (
    <DropdownMenu dir={dir}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={label}
          className={`flex items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] shadow-xs transition-colors hover:text-[var(--text-primary)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--primary-accent)] disabled:opacity-50 ${className}`}
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
          onSelect={onUpload}
          disabled={disabled}
        >
          <HugeiconsIcon icon={Camera01Icon} className="size-4 text-[var(--text-secondary)]" />
          {t('profile.uploadImage')}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer gap-2.5 rounded-xl px-2.5 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-pill-hover)] focus:bg-[var(--bg-pill-hover)]"
          onSelect={onEdit}
          disabled={disabled || !canEdit}
        >
          <HugeiconsIcon icon={PencilEdit01Icon} className="size-4 text-[var(--text-secondary)]" />
          {t('profile.editImage')}
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1 bg-[var(--border-subtle)]" />
        <DropdownMenuItem
          className="cursor-pointer gap-2.5 rounded-xl px-2.5 py-2 text-sm text-[var(--primary-accent)] hover:bg-[var(--primary-accent)]/10 focus:bg-[var(--primary-accent)]/10"
          onSelect={onRemove}
          disabled={disabled || !canEdit}
        >
          <HugeiconsIcon icon={Delete02Icon} className="size-4 text-current" />
          {t('profile.removeImage')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ProfileIdentityEditorProps {
  profile: CommunityProfile;
  onSave: (patch: CommunityProfilePatch) => Promise<CommunityProfile>;
}

/**
 * The single implementation of "edit my profile": the cover band, the avatar
 * overlapping it and the public identity fields, shared by the site and the
 * community (whose "Edit profile" button routes to this page).
 *
 * The avatar is the account avatar (`users.avatar`, shown everywhere and synced
 * into the community by a server hook); the cover and text fields belong to
 * the community profile, which is what other people see. Key this on the
 * profile id so the fields seed from props without an effect.
 */
export function ProfileIdentityEditor({ profile, onSave }: ProfileIdentityEditorProps) {
  const { t } = useLocale();
  const { user } = useAuth();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [handle, setHandle] = useState(profile.handle);
  const [displayName, setDisplayName] = useState(() => profile.displayName || user?.name || '');
  const [bio, setBio] = useState(profile.bio);
  const [location, setLocation] = useState(profile.location);
  const [website, setWebsite] = useState(profile.website);
  const [pending, setPending] = useState<{ file: File; shape: CropShape } | null>(null);
  const [busyImage, setBusyImage] = useState<CropShape | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const coverUrl = profile.bannerUrl;
  // Profiles from before the unified editor may show a community-only avatar
  // while the account has none. It stays manageable here until replaced.
  const [communityOnlyAvatar, setCommunityOnlyAvatar] = useState(() => (user?.avatar ? '' : profile.avatarUrl));
  const avatarUrl = user?.avatar || communityOnlyAvatar;

  if (!user) {
    return null;
  }

  const pickFile = (event: React.ChangeEvent<HTMLInputElement>, shape: CropShape) => {
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
    setPending({ file, shape });
  };

  const openExistingImage = async (shape: CropShape) => {
    const source = shape === 'avatar' ? avatarUrl : coverUrl;
    if (!source || busyImage) {
      return;
    }
    const failure = shape === 'avatar' ? t('profile.avatarEditFailed') : t('profile.coverEditFailed');
    setBusyImage(shape);
    try {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(failure);
      }
      const blob = await response.blob();
      setPending({ file: new File([blob], `profile-${shape}`, { type: blob.type || 'image/png' }), shape });
    } catch (error) {
      console.error('Image edit preparation failed:', error);
      toast.error(error instanceof Error ? error.message : failure);
    } finally {
      setBusyImage(null);
    }
  };

  const applyCrop = async (blob: Blob) => {
    const shape = pending?.shape;
    if (!shape || busyImage) {
      return;
    }
    setBusyImage(shape);
    try {
      if (shape === 'avatar') {
        // The SDK merges the updated record into authStore, so every avatar in
        // the app refreshes without a reload. The server hook then drops any
        // community-only avatar in favour of this one.
        await uploadUserAvatar(user.id, blob);
        setCommunityOnlyAvatar('');
        toast.success(t('profile.avatarUpdated'));
      } else {
        await onSave({ banner: new File([blob], `cover-${Date.now()}.png`, { type: blob.type || 'image/png' }) });
        toast.success(t('profile.coverUpdated'));
      }
      setPending(null);
    } catch (error) {
      console.error('Image upload failed:', error);
      toast.error(getPocketBaseErrorMessage(error, t(shape === 'avatar' ? 'profile.avatarFailed' : 'profile.coverFailed')));
    } finally {
      setBusyImage(null);
    }
  };

  const removeImage = async (shape: CropShape) => {
    if (busyImage) {
      return;
    }
    setBusyImage(shape);
    try {
      if (shape === 'avatar') {
        if (user.avatar) {
          // The server hook clears the community copy along with it.
          await removeUserAvatar(user.id);
        } else {
          await onSave({ removeAvatar: true });
        }
        setCommunityOnlyAvatar('');
        toast.success(t('profile.avatarRemoved'));
      } else {
        await onSave({ removeBanner: true });
        toast.success(t('profile.coverRemoved'));
      }
    } catch (error) {
      console.error('Image removal failed:', error);
      toast.error(getPocketBaseErrorMessage(error, t(shape === 'avatar' ? 'profile.avatarFailed' : 'profile.coverFailed')));
    } finally {
      setBusyImage(null);
    }
  };

  const save = async () => {
    const nextDisplayName = displayName.trim();
    if (!nextDisplayName) {
      toast.error(t('profile.nameRequired'));
      return;
    }
    setIsSaving(true);
    try {
      // The community profile goes first because the server validates the
      // handle and website there; the account name only follows a valid save.
      await onSave({
        handle: handle.trim().toLowerCase(),
        displayName: nextDisplayName,
        bio: bio.trim(),
        location: location.trim(),
        website: website.trim(),
      });
      if (nextDisplayName !== user.name) {
        // `users.name` is what the header, comments and mentions render, so the
        // one display name edited here has to land in both places.
        await updateUserName(user.id, nextDisplayName);
      }
      toast.success(t('profile.saved'));
    } catch (error) {
      toast.error(getPocketBaseErrorMessage(error, t('community.editor.failed')));
    } finally {
      setIsSaving(false);
    }
  };

  const busy = isSaving || busyImage !== null;

  return (
    <div className="space-y-5">
      <div className="relative">
        <div className="aspect-[4/1] w-full overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-pill)]">
          {coverUrl ? (
            <img src={coverUrl} alt={t('profile.coverAlt')} className="size-full object-cover" />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-1.5 text-[var(--text-secondary)]">
              <HugeiconsIcon icon={Image01Icon} className="size-5" />
              <span className="text-xs font-medium">{t('profile.coverEmpty')}</span>
            </div>
          )}
        </div>

        <ImageActionsMenu
          label={t('profile.coverActions')}
          disabled={busy}
          canEdit={Boolean(coverUrl)}
          onUpload={() => coverInputRef.current?.click()}
          onEdit={() => { void openExistingImage('cover'); }}
          onRemove={() => { void removeImage('cover'); }}
          className="absolute end-3 top-3 size-9"
        />

        <div className="absolute -bottom-10 start-5">
          <div className="rounded-full ring-4 ring-[var(--bg-card)]">
            <UserAvatarCircle name={user.name} email={user.email} src={avatarUrl} size={88} />
          </div>
          <ImageActionsMenu
            label={t('profile.pictureActions')}
            disabled={busy}
            canEdit={Boolean(avatarUrl)}
            onUpload={() => avatarInputRef.current?.click()}
            onEdit={() => { void openExistingImage('avatar'); }}
            onRemove={() => { void removeImage('avatar'); }}
            className="absolute -bottom-1 -end-1 size-8"
          />
        </div>
      </div>

      <input
        ref={avatarInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        className="hidden"
        onChange={(event) => pickFile(event, 'avatar')}
      />
      <input
        ref={coverInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        className="hidden"
        onChange={(event) => pickFile(event, 'cover')}
      />

      <div className="space-y-5 pt-12">
        <div className="space-y-2">
          <Label htmlFor="profile-display-name" className="text-sm font-semibold text-[var(--text-primary)]">
            {t('profile.nameLabel')}
          </Label>
          <Input
            id="profile-display-name"
            value={displayName}
            placeholder={t('profile.namePlaceholder')}
            maxLength={COMMUNITY_MAX_DISPLAY_NAME_LENGTH}
            onChange={(event) => setDisplayName(event.target.value)}
            className="h-10 rounded-full border-[var(--border-subtle)] bg-[var(--bg-input)] px-4 text-[var(--text-primary)]"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="profile-handle" className="text-sm font-semibold text-[var(--text-primary)]">
            {t('community.editor.handle')}
          </Label>
          <Input
            id="profile-handle"
            value={handle}
            dir="ltr"
            maxLength={COMMUNITY_MAX_HANDLE_LENGTH}
            onChange={(event) => setHandle(event.target.value)}
            className="h-10 rounded-full border-[var(--border-subtle)] bg-[var(--bg-input)] px-4 text-[var(--text-primary)]"
          />
          <p className="text-xs text-[var(--text-muted)]">{t('community.editor.handleHint')}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="profile-bio" className="text-sm font-semibold text-[var(--text-primary)]">
            {t('community.editor.bio')}
          </Label>
          <Textarea
            id="profile-bio"
            value={bio}
            rows={3}
            maxLength={COMMUNITY_MAX_BIO_LENGTH}
            onChange={(event) => setBio(event.target.value)}
            className="rounded-2xl border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--text-primary)]"
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="profile-location" className="text-sm font-semibold text-[var(--text-primary)]">
              {t('community.editor.location')}
            </Label>
            <Input
              id="profile-location"
              value={location}
              maxLength={COMMUNITY_MAX_LOCATION_LENGTH}
              onChange={(event) => setLocation(event.target.value)}
              className="h-10 rounded-full border-[var(--border-subtle)] bg-[var(--bg-input)] px-4 text-[var(--text-primary)]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-website" className="text-sm font-semibold text-[var(--text-primary)]">
              {t('community.editor.website')}
            </Label>
            <Input
              id="profile-website"
              value={website}
              inputMode="url"
              dir="ltr"
              onChange={(event) => setWebsite(event.target.value)}
              className="h-10 rounded-full border-[var(--border-subtle)] bg-[var(--bg-input)] px-4 text-[var(--text-primary)]"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="button" className="btn-hire-me" disabled={busy} onClick={() => { void save(); }}>
            {isSaving ? t('profile.saving') : t('profile.save')}
          </Button>
        </div>
      </div>

      {pending ? (
        <ImageCropperDialog
          file={pending.file}
          shape={pending.shape}
          onCancel={() => setPending(null)}
          onApply={applyCrop}
        />
      ) : null}
    </div>
  );
}
