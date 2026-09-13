import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Cancel01Icon,
  ImageAdd01Icon,
  Loading02Icon,
  Video01Icon,
  ViewOffIcon,
} from '@hugeicons/core-free-icons';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useLocale } from '@/contexts/LocaleContext';
import {
  communityMediaKindOf,
  compressCommunityImage,
  isCommunityMediaTooLarge,
  probeCommunityMedia,
} from '@/lib/community-media';
import { normalizeCommunityBody } from '@/lib/community-text';
import {
  getPocketBaseErrorMessage,
  resolveCommunityFileUrl,
  uploadCommunityMedia,
} from '@/lib/pocketbase/community';
import { cn } from '@/lib/utils';
import {
  COMMUNITY_MAX_BODY_LENGTH,
  COMMUNITY_MAX_MEDIA_PER_POST,
  type CommunityMedia,
  type CommunityPost,
} from '@/types/community';
import { CommunityAvatar } from './CommunityAvatar';

interface CommunityEditPostDialogProps {
  open: boolean;
  post: CommunityPost;
  onSave: (patch: { body: string; mediaIds: string[]; sensitive: boolean }) => Promise<boolean>;
  onClose: () => void;
}

interface PendingMedia {
  key: string;
  media: CommunityMedia | null;
  previewUrl: string;
  kind: 'image' | 'video';
  isUploading: boolean;
}

let editMediaKeyCounter = 0;
function nextEditMediaKey(): string {
  editMediaKeyCounter += 1;
  return 'em-' + editMediaKeyCounter;
}

export function CommunityEditPostDialog({
  open,
  post,
  onSave,
  onClose,
}: CommunityEditPostDialogProps) {
  const { t } = useLocale();
  const [body, setBody] = useState(post.body);
  const [items, setItems] = useState<PendingMedia[]>([]);
  const [sensitive, setSensitive] = useState(Boolean(post.sensitive));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const itemsRef = useRef<PendingMedia[]>(items);
  itemsRef.current = items;

  useEffect(() => {
    if (open) {
      setBody(post.body);
      setSensitive(Boolean(post.sensitive));
      setIsSubmitting(false);

      const initialItems: PendingMedia[] = (post.media || []).map((m) => ({
        key: 'existing-' + m.id,
        media: m,
        previewUrl: resolveCommunityFileUrl(m.url),
        kind: m.kind,
        isUploading: false,
      }));
      setItems(initialItems);
    } else {
      // Revoke any created blob URLs
      itemsRef.current.forEach((item) => {
        if (item.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
      setItems([]);
    }
  }, [open, post]);

  useEffect(() => () => {
    itemsRef.current.forEach((item) => {
      if (item.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(item.previewUrl);
      }
    });
  }, []);

  const normalized = normalizeCommunityBody(body);
  const remaining = COMMUNITY_MAX_BODY_LENGTH - normalized.length;
  const isOverLimit = remaining < 0;

  const initialMediaIds = useMemo(() => (post.media || []).map((m) => m.id), [post.media]);
  const currentMediaIds = useMemo(
    () => items.map((item) => item.media?.id).filter((id): id is string => Boolean(id)),
    [items],
  );

  const hasMediaChanged =
    initialMediaIds.length !== currentMediaIds.length ||
    initialMediaIds.some((id, idx) => id !== currentMediaIds[idx]);
  const hasBodyChanged = normalized !== normalizeCommunityBody(post.body);
  const hasSensitiveChanged = sensitive !== Boolean(post.sensitive);
  const hasChanged = hasBodyChanged || hasMediaChanged || hasSensitiveChanged;

  const isUploading = items.some((item) => item.isUploading);
  const hasMedia = items.length > 0;

  const canSubmit =
    !isSubmitting &&
    !isUploading &&
    !isOverLimit &&
    (normalized.length > 0 || hasMedia || Boolean(post.quotedPost)) &&
    hasChanged;

  const addFiles = useCallback(async (files: File[]) => {
    const room = COMMUNITY_MAX_MEDIA_PER_POST - itemsRef.current.length;
    if (room <= 0) {
      toast.error(t('community.composer.mediaLimit', { count: COMMUNITY_MAX_MEDIA_PER_POST }));
      return;
    }

    for (const file of files.slice(0, room)) {
      const kind = communityMediaKindOf(file);
      if (!kind) {
        toast.error(t('community.composer.unsupportedFile'));
        continue;
      }
      if (isCommunityMediaTooLarge(file, kind)) {
        toast.error(t(kind === 'video' ? 'community.composer.videoTooLarge' : 'community.composer.imageTooLarge'));
        continue;
      }

      const key = nextEditMediaKey();
      const probe = await probeCommunityMedia(file, kind);
      setItems((current) => current.concat({
        key,
        media: null,
        previewUrl: probe.previewUrl,
        kind,
        isUploading: true,
      }));

      try {
        const payload = kind === 'image' ? await compressCommunityImage(file) : file;
        const media = await uploadCommunityMedia({
          file: payload,
          kind,
          width: probe.width,
          height: probe.height,
          durationMs: probe.durationMs,
        });
        setItems((current) => current.map((item) => (
          item.key === key ? { ...item, media, isUploading: false } : item
        )));
      } catch (caught) {
        setItems((current) => current.filter((item) => item.key !== key));
        if (probe.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(probe.previewUrl);
        }
        toast.error(getPocketBaseErrorMessage(caught, t('community.composer.uploadFailed')));
      }
    }
  }, [t]);

  const removeItem = useCallback((key: string) => {
    setItems((current) => {
      const target = current.find((item) => item.key === key);
      if (target && target.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return current.filter((item) => item.key !== key);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      return;
    }
    setIsSubmitting(true);
    const success = await onSave({
      body: normalized,
      mediaIds: currentMediaIds,
      sensitive: hasMedia ? sensitive : false,
    });
    setIsSubmitting(false);
    if (success) {
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent
        className="max-h-[85vh] gap-0 overflow-y-auto p-0 sm:max-w-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader className="border-b border-[#E5E5E5] px-4 py-3">
          <DialogTitle className="text-base font-bold text-[#171717]">
            {t('community.post.editPost')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="flex gap-3 p-4">
            {post.author ? (
              <CommunityAvatar
                handle={post.author.handle}
                displayName={post.author.displayName}
                avatarUrl={post.author.avatarUrl}
                size="md"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t('community.composer.placeholder')}
                className="min-h-[100px] resize-none border-none p-0 text-[16px] leading-relaxed shadow-none focus-visible:ring-0"
                autoFocus
                disabled={isSubmitting}
              />

              {items.length > 0 ? (
                <div className={cn('mt-3 grid gap-2', items.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
                  {items.map((item) => (
                    <div key={item.key} className="relative overflow-hidden rounded-2xl border border-[#E5E5E5] bg-[#F5F5F5]">
                      {item.kind === 'video' ? (
                        <video
                          src={item.media ? resolveCommunityFileUrl(item.media.url) : item.previewUrl}
                          className="h-36 w-full object-cover"
                          controls
                          preload="metadata"
                        />
                      ) : (
                        <img src={item.previewUrl} alt="" className="h-36 w-full object-cover" />
                      )}

                      {item.isUploading ? (
                        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/45 text-sm text-white">
                          <HugeiconsIcon icon={Loading02Icon} className="size-4 animate-spin" />
                          {t('community.composer.uploading')}
                        </div>
                      ) : null}

                      <button
                        type="button"
                        aria-label={t('community.composer.removeMedia')}
                        className="absolute end-2 top-2 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
                        onClick={() => removeItem(item.key)}
                      >
                        <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E5E5E5] px-4 py-2.5 sm:justify-between">
            <div className="flex items-center gap-1">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = '';
                  void addFiles(files);
                }}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = '';
                  void addFiles(files);
                }}
              />

              <button
                type="button"
                aria-label={t('community.composer.addImage')}
                title={t('community.composer.addImage')}
                disabled={items.length >= COMMUNITY_MAX_MEDIA_PER_POST || isSubmitting}
                className="rounded-full p-2 text-[#D93A3A] transition-colors hover:bg-[#D93A3A]/10 disabled:opacity-40"
                onClick={() => imageInputRef.current?.click()}
              >
                <HugeiconsIcon icon={ImageAdd01Icon} className="size-5" />
              </button>

              <button
                type="button"
                aria-label={t('community.composer.addVideo')}
                title={t('community.composer.addVideo')}
                disabled={items.length >= COMMUNITY_MAX_MEDIA_PER_POST || isSubmitting}
                className="rounded-full p-2 text-[#D93A3A] transition-colors hover:bg-[#D93A3A]/10 disabled:opacity-40"
                onClick={() => videoInputRef.current?.click()}
              >
                <HugeiconsIcon icon={Video01Icon} className="size-5" />
              </button>

              {hasMedia ? (
                <button
                  type="button"
                  aria-pressed={sensitive}
                  title={t('community.composer.sensitive')}
                  className={cn(
                    'rounded-full p-2 transition-colors',
                    sensitive ? 'bg-[#D93A3A]/10 text-[#D93A3A]' : 'text-[#737373] hover:bg-[#F5F5F5]',
                  )}
                  onClick={() => setSensitive((current) => !current)}
                >
                  <HugeiconsIcon icon={ViewOffIcon} className="size-5" />
                </button>
              ) : null}
            </div>

            <div className="flex items-center gap-3 ms-auto">
              <span
                className={`text-xs ${isOverLimit ? 'font-bold text-[#D93A3A]' : 'text-[#737373]'}`}
              >
                {isOverLimit
                  ? t('community.composer.overLimit')
                  : t('community.composer.remaining', { count: remaining })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-full font-medium"
                onClick={onClose}
                disabled={isSubmitting}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                size="sm"
                className="rounded-full bg-[#D93A3A] px-5 font-bold text-white hover:bg-[#C13232]"
                disabled={!canSubmit}
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-1.5">
                    <HugeiconsIcon icon={Loading02Icon} className="size-3.5 animate-spin" />
                    {t('community.post.savingEdit')}
                  </span>
                ) : (
                  t('community.post.saveEdit')
                )}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
