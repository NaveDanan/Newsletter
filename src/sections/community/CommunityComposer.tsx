import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Cancel01Icon,
  ImageAdd01Icon,
  Loading02Icon,
  ViewOffIcon,
  Video01Icon,
} from '@hugeicons/core-free-icons';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useLocale } from '@/contexts/LocaleContext';
import {
  communityMediaKindOf,
  compressCommunityImage,
  isCommunityMediaTooLarge,
  probeCommunityMedia,
} from '@/lib/community-media';
import { communityBodyLength, firstCommunityUrl } from '@/lib/community-text';
import {
  createCommunityPost,
  fetchCommunityLinkPreview,
  getPocketBaseErrorMessage,
  resolveCommunityFileUrl,
  uploadCommunityMedia,
} from '@/lib/pocketbase/community';
import { cn } from '@/lib/utils';
import { CommunityAvatar } from './CommunityAvatar';
import { useCommunity } from './CommunityContext';
import { CommunityLinkPreviewCard } from './CommunityLinkPreviewCard';
import { CommunityQuotedPost } from './CommunityQuotedPost';
import {
  COMMUNITY_MAX_BODY_LENGTH,
  COMMUNITY_MAX_MEDIA_PER_POST,
  type CommunityLinkPreview,
  type CommunityMedia,
  type CommunityPost,
} from '@/types/community';

// The composer uploads each attachment as soon as it is picked, so the post
// itself only ever carries media ids. That keeps POST /api/community/posts
// under its 128 KB body limit and means a slow video is already on the server
// by the time the author finishes typing.

interface CommunityComposerProps {
  /** The post being replied to, if any. */
  parent?: CommunityPost | null;
  /** The post being quoted, if any. */
  quoted?: CommunityPost | null;
  onPosted: (post: CommunityPost) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  compact?: boolean;
  className?: string;
}

interface PendingMedia {
  key: string;
  media: CommunityMedia | null;
  previewUrl: string;
  kind: 'image' | 'video';
  isUploading: boolean;
}

let mediaKeyCounter = 0;

function nextMediaKey(): string {
  mediaKeyCounter += 1;
  return 'm' + mediaKeyCounter;
}

// An idempotency key so a retried submit after a flaky response never creates a
// second post. crypto.randomUUID is present in every browser this app targets,
// but the fallback keeps the composer usable on an insecure origin.
function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
}

export function CommunityComposer({
  parent = null,
  quoted = null,
  onPosted,
  onCancel,
  autoFocus = false,
  compact = false,
  className,
}: CommunityComposerProps) {
  const { t } = useLocale();
  const { isAuthenticated, profile, requireAuth } = useCommunity();
  const [body, setBody] = useState('');
  const [items, setItems] = useState<PendingMedia[]>([]);
  const [sensitive, setSensitive] = useState(false);
  const [preview, setPreview] = useState<CommunityLinkPreview | null>(null);
  const [previewDismissed, setPreviewDismissed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const clientIdRef = useRef(newClientId());
  const itemsRef = useRef<PendingMedia[]>(items);
  itemsRef.current = items;

  const length = communityBodyLength(body);
  const remaining = COMMUNITY_MAX_BODY_LENGTH - length;
  const isOverLimit = remaining < 0;
  const isUploading = items.some((item) => item.isUploading);
  const hasMedia = items.length > 0;
  const canSubmit = !isSubmitting && !isUploading && !isOverLimit
    && (body.trim().length > 0 || hasMedia || Boolean(quoted));

  useEffect(() => {
    if (autoFocus) {
      textareaRef.current?.focus();
    }
  }, [autoFocus]);

  // Object URLs are revoked on unmount so a long composing session does not
  // pin every discarded attachment in memory. The ref carries the latest list
  // into a cleanup that must run exactly once.
  useEffect(() => () => {
    itemsRef.current.forEach((item) => {
      if (item.previewUrl.slice(0, 5) === 'blob:') {
        URL.revokeObjectURL(item.previewUrl);
      }
    });
  }, []);

  // A link preview only appears when there is no attached media, matching how
  // the card renders it, and it is debounced so typing a URL does not fire a
  // request per keystroke.
  const url = useMemo(() => firstCommunityUrl(body), [body]);

  useEffect(() => {
    if (!url || hasMedia || quoted || previewDismissed) {
      setPreview(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetchCommunityLinkPreview(url)
        .then((result) => {
          if (!cancelled && result && result.title) {
            setPreview(result);
          }
        })
        .catch(() => {
          // An unreachable target is not an error the author needs to see.
        });
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [hasMedia, previewDismissed, quoted, url]);

  const addFiles = useCallback(async (files: File[]) => {
    if (!isAuthenticated) {
      requireAuth();
      return;
    }

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

      const key = nextMediaKey();
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
        if (probe.previewUrl.slice(0, 5) === 'blob:') {
          URL.revokeObjectURL(probe.previewUrl);
        }
        toast.error(getPocketBaseErrorMessage(caught, t('community.composer.uploadFailed')));
      }
    }
  }, [isAuthenticated, requireAuth, t]);

  const removeItem = useCallback((key: string) => {
    setItems((current) => {
      const target = current.find((item) => item.key === key);
      if (target && target.previewUrl.slice(0, 5) === 'blob:') {
        URL.revokeObjectURL(target.previewUrl);
      }
      return current.filter((item) => item.key !== key);
    });
  }, []);

  const submit = useCallback(async () => {
    if (!isAuthenticated) {
      requireAuth();
      return;
    }
    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);
    try {
      const post = await createCommunityPost({
        body: body.trim(),
        mediaIds: items.map((item) => (item.media ? item.media.id : '')).filter(Boolean),
        parentId: parent ? parent.id : '',
        quotedPostId: quoted ? quoted.id : '',
        clientId: clientIdRef.current,
        sensitive,
      });

      items.forEach((item) => {
        if (item.previewUrl.slice(0, 5) === 'blob:') {
          URL.revokeObjectURL(item.previewUrl);
        }
      });

      setBody('');
      setItems([]);
      setSensitive(false);
      setPreview(null);
      setPreviewDismissed(false);
      clientIdRef.current = newClientId();
      toast.success(t(parent ? 'community.composer.replied' : 'community.composer.posted'));
      onPosted(post);
    } catch (caught) {
      toast.error(getPocketBaseErrorMessage(caught, t('community.composer.postFailed')));
    } finally {
      setIsSubmitting(false);
    }
  }, [body, canSubmit, isAuthenticated, items, onPosted, parent, quoted, requireAuth, sensitive, t]);

  const placeholderKey = parent
    ? 'community.composer.replyPlaceholder'
    : quoted
      ? 'community.composer.quotePlaceholder'
      : 'community.composer.placeholder';

  return (
    <div className={cn('flex gap-3 px-4 py-3', className)}>
      <CommunityAvatar
        handle={profile ? profile.handle : ''}
        displayName={profile ? profile.displayName : ''}
        avatarUrl={profile ? profile.avatarUrl : ''}
        size={compact ? 'md' : 'lg'}
      />

      <div className="min-w-0 flex-1">
        <Textarea
          ref={textareaRef}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            setPreviewDismissed(false);
          }}
          onKeyDown={(event) => {
            // Ctrl or Cmd with Enter posts, exactly like X.
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={t(placeholderKey)}
          rows={compact ? 2 : 3}
          className="min-h-[60px] resize-none border-none bg-transparent px-0 text-[17px] shadow-none focus-visible:ring-0"
        />

        {items.length > 0 ? (
          <div className={cn('mt-2 grid gap-2', items.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
            {items.map((item) => (
              <div key={item.key} className="relative overflow-hidden rounded-2xl border border-[#E5E5E5] bg-[#F5F5F5]">
                {item.kind === 'video' ? (
                  <video
                    src={item.media ? resolveCommunityFileUrl(item.media.url) : item.previewUrl}
                    className="h-40 w-full object-cover"
                    controls
                    preload="metadata"
                  />
                ) : (
                  <img src={item.previewUrl} alt="" className="h-40 w-full object-cover" />
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

        {preview && !hasMedia && !quoted ? (
          <CommunityLinkPreviewCard
            preview={preview}
            onRemove={() => {
              setPreview(null);
              setPreviewDismissed(true);
            }}
          />
        ) : null}

        {quoted ? <CommunityQuotedPost post={quoted} /> : null}

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#F5F5F5] pt-2">
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
              disabled={items.length >= COMMUNITY_MAX_MEDIA_PER_POST}
              className="rounded-full p-2 text-[#D93A3A] transition-colors hover:bg-[#D93A3A]/10 disabled:opacity-40"
              onClick={() => imageInputRef.current?.click()}
            >
              <HugeiconsIcon icon={ImageAdd01Icon} className="size-5" />
            </button>

            <button
              type="button"
              aria-label={t('community.composer.addVideo')}
              title={t('community.composer.addVideo')}
              disabled={items.length >= COMMUNITY_MAX_MEDIA_PER_POST}
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

          <div className="flex items-center gap-3">
            {length > 0 ? (
              <span className={cn('text-xs', isOverLimit ? 'text-[#D93A3A]' : 'text-[#737373]')}>
                {isOverLimit
                  ? t('community.composer.overLimit')
                  : t('community.composer.remaining', { count: remaining })}
              </span>
            ) : null}

            {onCancel ? (
              <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                {t('common.cancel')}
              </Button>
            ) : null}

            <Button
              type="button"
              size="sm"
              disabled={!canSubmit}
              className="rounded-full bg-[#D93A3A] px-5 text-white hover:bg-[#C13232]"
              onClick={() => void submit()}
            >
              {isSubmitting
                ? t('community.composer.posting')
                : t(parent ? 'community.composer.reply' : 'community.composer.post')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
