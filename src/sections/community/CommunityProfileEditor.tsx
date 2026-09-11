import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useLocale } from '@/contexts/LocaleContext';
import { communityMediaKindOf, compressCommunityImage, isCommunityMediaTooLarge } from '@/lib/community-media';
import { getPocketBaseErrorMessage, resolveCommunityFileUrl } from '@/lib/pocketbase/community';
import { CommunityAvatar } from './CommunityAvatar';
import {
  COMMUNITY_MAX_BIO_LENGTH,
  COMMUNITY_MAX_DISPLAY_NAME_LENGTH,
  COMMUNITY_MAX_HANDLE_LENGTH,
  COMMUNITY_MAX_LOCATION_LENGTH,
  type CommunityProfile,
  type CommunityProfilePatch,
} from '@/types/community';

// Editing sends one PATCH /api/community/me. The route is registered with
// bodyLimit(0) so a new avatar and banner ride along with the text fields in a
// single multipart request rather than three round trips.

interface CommunityProfileEditorProps {
  open: boolean;
  profile: CommunityProfile | null;
  onSave: (patch: CommunityProfilePatch) => Promise<CommunityProfile>;
  onClose: () => void;
}

export function CommunityProfileEditor({ open, profile, onSave, onClose }: CommunityProfileEditorProps) {
  const { t } = useLocale();
  const { user } = useAuth();
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [website, setWebsite] = useState('');
  const [avatar, setAvatar] = useState<File | null>(null);
  const [banner, setBanner] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [bannerPreview, setBannerPreview] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  // The dialog stays mounted for the life of the page, so every object URL a
  // preview created has to be released by hand rather than on unmount.
  const previewUrlsRef = useRef<string[]>([]);

  const releasePreviews = () => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = [];
  };

  useEffect(() => {
    if (!open || !profile) {
      return;
    }
    setHandle(profile.handle);
    setDisplayName(profile.displayName);
    setBio(profile.bio);
    setLocation(profile.location);
    setWebsite(profile.website);
    setAvatar(null);
    setBanner(null);
    setAvatarPreview('');
    setBannerPreview('');
    releasePreviews();
  }, [open, profile]);

  useEffect(() => {
    if (open) {
      return;
    }
    releasePreviews();
  }, [open]);

  const pickImage = async (file: File | undefined, target: 'avatar' | 'banner') => {
    if (!file) {
      return;
    }
    const kind = communityMediaKindOf(file);
    if (kind !== 'image') {
      toast.error(t('community.composer.unsupportedFile'));
      return;
    }
    if (isCommunityMediaTooLarge(file, kind)) {
      toast.error(t('community.composer.imageTooLarge'));
      return;
    }

    const compressed = await compressCommunityImage(file);
    const url = URL.createObjectURL(compressed);
    previewUrlsRef.current.push(url);
    if (target === 'avatar') {
      setAvatar(compressed);
      setAvatarPreview(url);
    } else {
      setBanner(compressed);
      setBannerPreview(url);
    }
  };

  const submit = async () => {
    setIsSaving(true);
    try {
      await onSave({
        handle: handle.trim().toLowerCase(),
        displayName: displayName.trim(),
        bio: bio.trim(),
        location: location.trim(),
        website: website.trim(),
        avatar,
        banner,
      });
      toast.success(t('community.editor.saved'));
      onClose();
    } catch (caught) {
      toast.error(getPocketBaseErrorMessage(caught, t('community.editor.failed')));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) { onClose(); } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('community.editor.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">{t('community.editor.banner')}</Label>
            <button
              type="button"
              className="block h-32 w-full overflow-hidden rounded-xl border border-[#E5E5E5] bg-[#F5F5F5]"
              onClick={() => bannerInputRef.current?.click()}
            >
              {bannerPreview || (profile && profile.bannerUrl) ? (
                <img
                  src={bannerPreview || resolveCommunityFileUrl(profile ? profile.bannerUrl : '')}
                  alt=""
                  className="h-32 w-full object-cover"
                />
              ) : (
                <span className="text-sm text-[#737373]">{t('community.editor.pickImage')}</span>
              )}
            </button>
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files ? event.target.files[0] : undefined;
                event.target.value = '';
                void pickImage(file, 'banner');
              }}
            />
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={() => avatarInputRef.current?.click()}>
              {avatarPreview ? (
                <img src={avatarPreview} alt="" className="size-16 rounded-full object-cover" />
              ) : (
                <CommunityAvatar
                  handle={profile ? profile.handle : (user?.email ? user.email.split('@')[0] : '')}
                  displayName={profile ? profile.displayName : (user?.name || '')}
                  avatarUrl={profile ? profile.avatarUrl || user?.avatar || '' : (user?.avatar || '')}
                  size="lg"
                />
              )}
            </button>
            <Button type="button" variant="outline" size="sm" onClick={() => avatarInputRef.current?.click()}>
              {t('community.editor.avatar')}
            </Button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files ? event.target.files[0] : undefined;
                event.target.value = '';
                void pickImage(file, 'avatar');
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="community-handle">{t('community.editor.handle')}</Label>
            <Input
              id="community-handle"
              value={handle}
              maxLength={COMMUNITY_MAX_HANDLE_LENGTH}
              onChange={(event) => setHandle(event.target.value)}
            />
            <p className="text-xs text-[#737373]">{t('community.editor.handleHint')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="community-display-name">{t('community.editor.displayName')}</Label>
            <Input
              id="community-display-name"
              value={displayName}
              maxLength={COMMUNITY_MAX_DISPLAY_NAME_LENGTH}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="community-bio">{t('community.editor.bio')}</Label>
            <Textarea
              id="community-bio"
              value={bio}
              rows={3}
              maxLength={COMMUNITY_MAX_BIO_LENGTH}
              onChange={(event) => setBio(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="community-location">{t('community.editor.location')}</Label>
            <Input
              id="community-location"
              value={location}
              maxLength={COMMUNITY_MAX_LOCATION_LENGTH}
              onChange={(event) => setLocation(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="community-website">{t('community.editor.website')}</Label>
            <Input
              id="community-website"
              value={website}
              inputMode="url"
              onChange={(event) => setWebsite(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" disabled={isSaving} onClick={() => void submit()}>
            {isSaving ? t('community.editor.saving') : t('community.editor.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
