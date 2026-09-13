import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  BarChartIcon,
  Calendar03Icon,
  Cancel01Icon,
  Delete02Icon,
  ImageAdd01Icon,
  Loading02Icon,
  ViewOffIcon,
  Video01Icon,
} from '@hugeicons/core-free-icons';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useLocale } from '@/contexts/LocaleContext';
import type { NewsletterEvent, NewsletterPoll } from '@/types/newsletter';
import {
  communityMediaKindOf,
  compressCommunityImage,
  isCommunityMediaTooLarge,
  probeCommunityMedia,
} from '@/lib/community-media';
import { firstCommunityUrl, normalizeCommunityBody } from '@/lib/community-text';
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
  const { isRTL, t } = useLocale();
  const { isAuthenticated, profile, requireAuth } = useCommunity();
  const { user } = useAuth();
  const [body, setBody] = useState('');
  const [items, setItems] = useState<PendingMedia[]>([]);
  const [sensitive, setSensitive] = useState(false);
  const [preview, setPreview] = useState<CommunityLinkPreview | null>(null);
  const [previewDismissed, setPreviewDismissed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [poll, setPoll] = useState<NewsletterPoll | null>(null);
  const [event, setEvent] = useState<NewsletterEvent | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const clientIdRef = useRef(newClientId());
  const itemsRef = useRef<PendingMedia[]>(items);
  itemsRef.current = items;

  // Normalized the way the server's trimBody normalizes, so the counter, the
  // submit gate and the payload all describe one and the same string and the
  // composer can never accept a body the post route will reject.
  const normalizedBody = useMemo(() => normalizeCommunityBody(body), [body]);
  const length = normalizedBody.length;
  const remaining = COMMUNITY_MAX_BODY_LENGTH - length;
  const isOverLimit = remaining < 0;
  const isUploading = items.some((item) => item.isUploading);
  const hasMedia = items.length > 0;
  const hasPoll = Boolean(poll && poll.question.trim() && poll.options.filter((o) => o.text.trim()).length >= 2);
  const hasEvent = Boolean(event && event.title.trim() && event.startDate);
  const canSubmit = !isSubmitting && !isUploading && !isOverLimit
    && (length > 0 || hasMedia || Boolean(quoted) || hasPoll || hasEvent);

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
  const url = useMemo(() => firstCommunityUrl(normalizedBody), [normalizedBody]);

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

    if (poll) {
      if (!poll.question.trim()) {
        toast.error(t('manager.pollQuestion'));
        return;
      }
      const validOptions = poll.options.filter((o) => o.text.trim());
      if (validOptions.length < 2) {
        toast.error(t('manager.minTwoOptions'));
        return;
      }
    }

    if (event) {
      if (!event.title.trim()) {
        toast.error(t('manager.eventTitle'));
        return;
      }
      if (!event.startDate) {
        toast.error(t('manager.eventStartDate'));
        return;
      }
    }

    const sanitizedPoll: NewsletterPoll | null = poll && poll.question.trim()
      ? {
          ...poll,
          question: poll.question.trim(),
          options: poll.options
            .map((opt, i) => ({
              id: opt.id || `opt-${i + 1}`,
              text: opt.text.trim(),
              votes: opt.votes || 0,
              voterUserIds: opt.voterUserIds || [],
            }))
            .filter((opt) => opt.text.length > 0),
        }
      : null;

    const sanitizedEvent: NewsletterEvent | null = event && event.title.trim() && event.startDate
      ? {
          ...event,
          title: event.title.trim(),
          startDate: event.startDate.trim(),
          endDate: event.endDate?.trim() || undefined,
          location: event.location?.trim() || undefined,
          description: event.description?.trim() || undefined,
          attendees: event.attendees || [],
        }
      : null;

    setIsSubmitting(true);
    try {
      const post = await createCommunityPost({
        body: normalizedBody,
        mediaIds: items.map((item) => (item.media ? item.media.id : '')).filter(Boolean),
        parentId: parent ? parent.id : '',
        quotedPostId: quoted ? quoted.id : '',
        clientId: clientIdRef.current,
        sensitive,
        poll: sanitizedPoll,
        event: sanitizedEvent,
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
      setPoll(null);
      setEvent(null);
      clientIdRef.current = newClientId();
      toast.success(t(parent ? 'community.composer.replied' : 'community.composer.posted'));
      onPosted(post);
    } catch (caught) {
      toast.error(getPocketBaseErrorMessage(caught, t('community.composer.postFailed')));
    } finally {
      setIsSubmitting(false);
    }
  }, [canSubmit, event, isAuthenticated, items, normalizedBody, onPosted, parent, poll, quoted, requireAuth, sensitive, t]);

  const placeholderKey = parent
    ? 'community.composer.replyPlaceholder'
    : quoted
      ? 'community.composer.quotePlaceholder'
      : 'community.composer.placeholder';

  const authorAvatarUrl = profile?.avatarUrl || user?.avatar || '';
  const authorDisplayName = profile?.displayName || user?.name || '';
  const authorHandle = profile?.handle || (user?.email ? user.email.split('@')[0] : '');

  const handleTogglePoll = () => {
    if (poll) {
      setPoll(null);
    } else {
      setPoll({
        id: `poll-${Date.now()}`,
        question: '',
        options: [
          { id: 'opt-1', text: '', votes: 0, voterUserIds: [] },
          { id: 'opt-2', text: '', votes: 0, voterUserIds: [] },
        ],
        createdAt: new Date().toISOString(),
      });
    }
  };

  const handleUpdatePollOption = (index: number, text: string) => {
    setPoll((prev) => {
      if (!prev) return prev;
      const nextOptions = [...prev.options];
      if (nextOptions[index]) {
        nextOptions[index] = { ...nextOptions[index], text };
      }
      return { ...prev, options: nextOptions };
    });
  };

  const handleAddPollOption = () => {
    setPoll((prev) => {
      if (!prev) return prev;
      const nextId = `opt-${prev.options.length + 1}`;
      return {
        ...prev,
        options: [...prev.options, { id: nextId, text: '', votes: 0, voterUserIds: [] }],
      };
    });
  };

  const handleRemovePollOption = (index: number) => {
    setPoll((prev) => {
      if (!prev || prev.options.length <= 2) return prev;
      return {
        ...prev,
        options: prev.options.filter((_, i) => i !== index),
      };
    });
  };

  const handleToggleEvent = () => {
    if (event) {
      setEvent(null);
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(14, 0, 0, 0);
      const startStr = tomorrow.toISOString().slice(0, 16);
      const endHour = new Date(tomorrow);
      endHour.setHours(15, 30, 0, 0);
      const endStr = endHour.toISOString().slice(0, 16);

      setEvent({
        id: `event-${Date.now()}`,
        title: '',
        description: '',
        startDate: startStr,
        endDate: endStr,
        location: '',
        attendees: [],
      });
    }
  };

  const handleUpdateEvent = (fields: Partial<NewsletterEvent>) => {
    setEvent((prev) => (prev ? { ...prev, ...fields } : prev));
  };

  return (
    <div className={cn('flex gap-3 px-4 py-3', className)}>
      <CommunityAvatar
        handle={authorHandle}
        displayName={authorDisplayName}
        avatarUrl={authorAvatarUrl}
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
            removeLabel={t('community.composer.removePreview')}
            onRemove={() => {
              setPreview(null);
              setPreviewDismissed(true);
            }}
          />
        ) : null}

        {quoted ? <CommunityQuotedPost post={quoted} /> : null}

        {/* Poll Builder */}
        {poll ? (
          <div className="mt-3 rounded-2xl border border-[#E5E5E5] bg-[#FAFAFA] p-3.5 sm:p-4">
            <div className="mb-3 flex items-center justify-between border-b border-[#EBEBEB] pb-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#171717]">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#D93A3A]/10 text-[#D93A3A]">
                  <HugeiconsIcon icon={BarChartIcon} className="size-3.5 -scale-y-100" />
                </div>
                <span>{t('viewer.poll')}</span>
              </div>
              <button
                type="button"
                aria-label={t('manager.removePoll')}
                title={t('manager.removePoll')}
                className="rounded-full p-1 text-[#737373] hover:bg-neutral-200 hover:text-red-600 transition-colors cursor-pointer"
                onClick={() => setPoll(null)}
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
              </button>
            </div>

            <input
              type="text"
              value={poll.question}
              onChange={(e) => setPoll((prev) => prev ? { ...prev, question: e.target.value } : prev)}
              dir={isRTL ? 'rtl' : 'ltr'}
              placeholder={t('manager.pollQuestionPlaceholder')}
              className="mb-3 w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#171717] focus:border-[#D93A3A] focus:outline-hidden"
            />

            <div className="space-y-2">
              {poll.options.map((opt, idx) => (
                <div key={opt.id || idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={opt.text}
                    onChange={(e) => handleUpdatePollOption(idx, e.target.value)}
                    dir={isRTL ? 'rtl' : 'ltr'}
                    placeholder={t('manager.pollOptionPlaceholder', { index: idx + 1 })}
                    className="flex-1 rounded-xl border border-[#E5E5E5] bg-white px-3 py-1.5 text-sm text-[#171717] focus:border-[#D93A3A] focus:outline-hidden"
                  />
                  {poll.options.length > 2 && (
                    <button
                      type="button"
                      aria-label={t('manager.removeOption')}
                      title={t('manager.removeOption')}
                      onClick={() => handleRemovePollOption(idx)}
                      className="p-1.5 text-[#A3A3A3] hover:text-red-600 transition-colors cursor-pointer"
                    >
                      <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddPollOption}
                className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-[#D93A3A] hover:text-[#B91C1C] transition-colors cursor-pointer"
              >
                <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
                <span>{t('manager.addOption')}</span>
              </button>
            </div>
          </div>
        ) : null}

        {/* Scheduled Event Builder */}
        {event ? (
          <div className="mt-3 rounded-2xl border border-[#E5E5E5] bg-[#FAFAFA] p-3.5 sm:p-4">
            <div className="mb-3 flex items-center justify-between border-b border-[#EBEBEB] pb-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#171717]">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#D93A3A]/10 text-[#D93A3A]">
                  <HugeiconsIcon icon={Calendar03Icon} className="size-3.5" />
                </div>
                <span>{t('viewer.event')}</span>
              </div>
              <button
                type="button"
                aria-label={t('manager.removeEvent')}
                title={t('manager.removeEvent')}
                className="rounded-full p-1 text-[#737373] hover:bg-neutral-200 hover:text-red-600 transition-colors cursor-pointer"
                onClick={() => setEvent(null)}
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#525252] mb-1">
                  {t('manager.eventTitle')} *
                </label>
                <input
                  type="text"
                  value={event.title}
                  onChange={(e) => handleUpdateEvent({ title: e.target.value })}
                  dir={isRTL ? 'rtl' : 'ltr'}
                  placeholder={t('manager.eventTitlePlaceholder')}
                  className="w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-1.5 text-sm text-[#171717] focus:border-[#D93A3A] focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#525252] mb-1">
                    {t('manager.eventStartDate')} *
                  </label>
                  <input
                    type="datetime-local"
                    value={event.startDate ? event.startDate.slice(0, 16) : ''}
                    onChange={(e) => handleUpdateEvent({ startDate: e.target.value })}
                    className="w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-1.5 text-sm text-[#171717] focus:border-[#D93A3A] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#525252] mb-1">
                    {t('manager.eventEndDate')}
                  </label>
                  <input
                    type="datetime-local"
                    value={event.endDate ? event.endDate.slice(0, 16) : ''}
                    onChange={(e) => handleUpdateEvent({ endDate: e.target.value })}
                    className="w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-1.5 text-sm text-[#171717] focus:border-[#D93A3A] focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#525252] mb-1">
                  {t('manager.eventLocation')}
                </label>
                <input
                  type="text"
                  value={event.location || ''}
                  onChange={(e) => handleUpdateEvent({ location: e.target.value })}
                  dir={isRTL ? 'rtl' : 'ltr'}
                  placeholder={t('manager.eventLocationPlaceholder')}
                  className="w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-1.5 text-sm text-[#171717] focus:border-[#D93A3A] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#525252] mb-1">
                  {t('manager.eventDescription')}
                </label>
                <textarea
                  rows={2}
                  value={event.description || ''}
                  onChange={(e) => handleUpdateEvent({ description: e.target.value })}
                  dir={isRTL ? 'rtl' : 'ltr'}
                  placeholder={t('manager.eventDescriptionPlaceholder')}
                  className="w-full rounded-xl border border-[#E5E5E5] bg-white p-2.5 text-sm text-[#171717] focus:border-[#D93A3A] focus:outline-hidden"
                />
              </div>
            </div>
          </div>
        ) : null}

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

            <button
              type="button"
              aria-label={t('viewer.poll')}
              title={t('viewer.poll')}
              aria-pressed={Boolean(poll)}
              className={cn(
                'rounded-full p-2 transition-colors cursor-pointer',
                poll ? 'bg-[#D93A3A]/10 text-[#D93A3A]' : 'text-[#D93A3A] hover:bg-[#D93A3A]/10',
              )}
              onClick={handleTogglePoll}
            >
              <HugeiconsIcon icon={BarChartIcon} className="size-5 -scale-y-100" />
            </button>

            <button
              type="button"
              aria-label={t('viewer.event')}
              title={t('viewer.event')}
              aria-pressed={Boolean(event)}
              className={cn(
                'rounded-full p-2 transition-colors cursor-pointer',
                event ? 'bg-[#D93A3A]/10 text-[#D93A3A]' : 'text-[#D93A3A] hover:bg-[#D93A3A]/10',
              )}
              onClick={handleToggleEvent}
            >
              <HugeiconsIcon icon={Calendar03Icon} className="size-5" />
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
