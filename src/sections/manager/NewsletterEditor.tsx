import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  BarChartIcon,
  Calendar01Icon,
  Calendar03Icon,
  Cancel01Icon,
  Delete02Icon,
  FloppyDiskIcon,
  Tag01Icon,
  UserIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { forwardRef, startTransition, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
import { NewsletterContent } from '@/components/newsletter/NewsletterContent';
import { NewsletterPollCard } from '@/components/newsletter/NewsletterPollCard';
import { NewsletterEventCard } from '@/components/newsletter/NewsletterEventCard';
import { cn } from '@/lib/utils';
import { eventDateTimeInput } from '@/lib/event-time';
import { AdvancedEditor, type AdvancedEditorHandle } from '../../components/editor/AdvancedEditor';
import { FileUploadZone } from '../../components/upload/FileUploadZone';
import { toast } from 'sonner';
import type { Newsletter, NewsletterEvent, NewsletterFormData, NewsletterPoll } from '../../types/newsletter';
import '../../components/editor/EditorStyles.css';

function normalizeFormData(data: NewsletterFormData) {
  return {
    title: data.title.trim(),
    subtitle: data.subtitle.trim(),
    content: data.content.trim(),
    author: data.author.trim(),
    coverImage: data.coverImage.trim(),
    tags: data.tags,
    status: data.status,
    poll: data.poll ? {
      question: data.poll.question.trim(),
      options: data.poll.options.map((o) => ({ id: o.id, text: o.text.trim() })),
    } : null,
    event: data.event ? {
      title: data.event.title.trim(),
      startDate: data.event.startDate.trim(),
      endDate: data.event.endDate?.trim() || '',
      location: data.event.location?.trim() || '',
      description: data.event.description?.trim() || '',
    } : null,
  };
}

function hasMeaningfulContent(data: NewsletterFormData): boolean {
  return Boolean(
    data.title.trim() ||
    data.subtitle.trim() ||
    data.content.replace(/<[^>]*>/g, '').trim() ||
    data.author.trim() ||
    data.coverImage.trim() ||
    data.tags.length ||
    data.poll?.question.trim() ||
    data.event?.title.trim()
  );
}

export interface NewsletterEditorHandle {
  prepareToLeave: () => { requiresConfirmation: boolean };
  savePublishedChanges: () => boolean;
}

interface NewsletterEditorProps {
  newsletter?: Newsletter | null;
  onSave: (data: NewsletterFormData) => void;
  onUpdate?: (id: string, data: Partial<NewsletterFormData>) => void;
  onAutoSave?: (id: string | null, data: Partial<NewsletterFormData>) => Promise<Newsletter | null> | Newsletter | null;
  onUploadPresentation?: (id: string, file: File) => Promise<{ newsletter: Newsletter; url: string; fileName: string; previewUrls?: string[]; previewStatus?: 'ready' | 'failed'; previewError?: string } | null> | { newsletter: Newsletter; url: string; fileName: string; previewUrls?: string[]; previewStatus?: 'ready' | 'failed'; previewError?: string } | null;
  onCancel: () => void;
  isEditing?: boolean;
}

export const NewsletterEditor = forwardRef<NewsletterEditorHandle, NewsletterEditorProps>(function NewsletterEditor({
  newsletter, 
  onSave, 
  onUpdate, 
  onAutoSave,
  onUploadPresentation,
  onCancel,
  isEditing = false 
}, ref) {
  const { formatDate, isRTL, t } = useLocale();
  const [showPreview, setShowPreview] = useState(false);
  const [formData, setFormData] = useState<NewsletterFormData>({
    title: '',
    subtitle: '',
    content: '',
    author: '',
    coverImage: '',
    tags: [],
    status: 'draft',
    poll: null,
    event: null,
  });
  const [tagInput, setTagInput] = useState('');
  const [autoSaveDraftId, setAutoSaveDraftId] = useState<string | null>(newsletter?.id ?? null);
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<Date | null>(null);
  const isHydratingFromNewsletter = useRef(false);
  const autoSaveTimeoutRef = useRef<number | null>(null);
  const contentEditorRef = useRef<AdvancedEditorHandle | null>(null);
  const isAutoSaveEnabled = Boolean(onAutoSave) && (!newsletter || newsletter.status === 'draft');
  const getCurrentFormData = useCallback((): NewsletterFormData => ({
    ...formData,
    content: contentEditorRef.current?.getHTML() ?? formData.content,
  }), [formData]);
  const publishedSnapshot = newsletter?.status === 'published'
    ? JSON.stringify(normalizeFormData({
        title: newsletter.title,
        subtitle: newsletter.subtitle,
        content: newsletter.content,
        author: newsletter.author,
        coverImage: newsletter.coverImage,
        tags: newsletter.tags,
        status: newsletter.status,
        poll: newsletter.poll ?? null,
        event: newsletter.event ?? null,
      }))
    : null;
  const currentSnapshot = JSON.stringify(normalizeFormData(formData));
  const hasUnsavedPublishedChanges = Boolean(
    newsletter?.status === 'published' &&
    publishedSnapshot &&
    publishedSnapshot !== currentSnapshot
  );

  useEffect(() => {
    if (newsletter) {
      isHydratingFromNewsletter.current = true;
      startTransition(() => {
        setFormData({
          title: newsletter.title,
          subtitle: newsletter.subtitle,
          content: newsletter.content,
          author: newsletter.author,
          coverImage: newsletter.coverImage,
          tags: newsletter.tags,
          status: newsletter.status,
          poll: newsletter.poll ? JSON.parse(JSON.stringify(newsletter.poll)) : null,
          event: newsletter.event ? JSON.parse(JSON.stringify(newsletter.event)) : null,
        });
        setAutoSaveDraftId(newsletter.id);
      });
    }
  }, [newsletter]);

  useEffect(() => {
    if (!isHydratingFromNewsletter.current) {
      return;
    }

    isHydratingFromNewsletter.current = false;
  }, [formData]);

  const flushDraftAutoSave = useCallback(() => {
    const nextFormData = getCurrentFormData();

    if (!isAutoSaveEnabled || !hasMeaningfulContent(nextFormData)) {
      return null;
    }

    if (autoSaveTimeoutRef.current) {
      window.clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }

    const result = onAutoSave?.(autoSaveDraftId, { ...nextFormData, status: 'draft' });
    if (result instanceof Promise) {
      result.then(savedDraft => {
        if (savedDraft) {
          setAutoSaveDraftId(savedDraft.id);
          setLastAutoSavedAt(new Date());
        }
      });
    } else if (result) {
      setAutoSaveDraftId(result.id);
      setLastAutoSavedAt(new Date());
    }

    return result;
  }, [autoSaveDraftId, getCurrentFormData, isAutoSaveEnabled, onAutoSave]);

  const handleUploadPresentation = useCallback(async (file: File) => {
    if (!onUploadPresentation) {
      return null;
    }

    let targetNewsletterId = autoSaveDraftId;

    if (!targetNewsletterId && onAutoSave) {
      const nextFormData = getCurrentFormData();
      const seedDraftResult = onAutoSave(null, {
        ...nextFormData,
        title: nextFormData.title.trim() || 'Untitled Draft',
        status: 'draft',
      });
      const seededDraft = seedDraftResult instanceof Promise ? await seedDraftResult : seedDraftResult;
      if (seededDraft) {
        targetNewsletterId = seededDraft.id;
        setAutoSaveDraftId(seededDraft.id);
        setLastAutoSavedAt(new Date());
      }
    }

    if (!targetNewsletterId) {
      toast.error(t('editor.presentationDraftRequired'));
      return null;
    }

    const uploadResult = onUploadPresentation(targetNewsletterId, file);
    const uploaded = uploadResult instanceof Promise ? await uploadResult : uploadResult;

    if (!uploaded) {
      return null;
    }

    setAutoSaveDraftId(uploaded.newsletter.id);
    setLastAutoSavedAt(new Date());

    return {
      src: uploaded.url,
      title: file.name,
      previewUrls: uploaded.previewUrls ?? [],
      previewStatus: uploaded.previewStatus,
      previewError: uploaded.previewError,
    };
  }, [autoSaveDraftId, getCurrentFormData, onAutoSave, onUploadPresentation, t]);

  useEffect(() => {
    if (!isAutoSaveEnabled || isHydratingFromNewsletter.current) {
      return;
    }

    if (!hasMeaningfulContent(formData)) {
      return;
    }

    autoSaveTimeoutRef.current = window.setTimeout(() => {
      flushDraftAutoSave();
    }, 800);

    return () => {
      if (autoSaveTimeoutRef.current) {
        window.clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }
    };
  }, [flushDraftAutoSave, formData, isAutoSaveEnabled]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isAutoSaveEnabled) {
        flushDraftAutoSave();
      }

      if (!hasUnsavedPublishedChanges) {
        return;
      }

      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [flushDraftAutoSave, hasUnsavedPublishedChanges, isAutoSaveEnabled]);

  const handleSave = useCallback((status: 'draft' | 'published', shouldToast = true): boolean => {
    const nextFormData = getCurrentFormData();

    if (!nextFormData.title.trim()) {
      toast.error(t('manager.enterTitleError'));
      return false;
    }
    if (!nextFormData.content.replace(/<[^>]*>/g, '').trim()) {
      toast.error(t('manager.enterContentError'));
      return false;
    }

    if (nextFormData.poll) {
      const q = nextFormData.poll.question.trim();
      const validOptions = nextFormData.poll.options.filter((o) => o.text.trim());
      if (q && validOptions.length < 2) {
        toast.error(t('manager.minTwoOptions'));
        return false;
      }
    }

    if (nextFormData.event) {
      if (!nextFormData.event.title.trim()) {
        toast.error(t('manager.eventTitle'));
        return false;
      }
      if (!nextFormData.event.startDate) {
        toast.error(t('manager.eventStartDate'));
        return false;
      }
    }

    const sanitizedPoll: NewsletterPoll | null = nextFormData.poll && nextFormData.poll.question.trim()
      ? {
          ...nextFormData.poll,
          question: nextFormData.poll.question.trim(),
          options: nextFormData.poll.options
            .map((opt, i) => ({
              id: opt.id || `opt-${i + 1}`,
              text: opt.text.trim(),
              votes: opt.votes || 0,
              voterUserIds: opt.voterUserIds || [],
            }))
            .filter((opt) => opt.text.length > 0),
        }
      : null;

    const sanitizedEvent: NewsletterEvent | null = nextFormData.event && nextFormData.event.title.trim() && nextFormData.event.startDate
      ? {
          ...nextFormData.event,
          title: nextFormData.event.title.trim(),
          startDate: nextFormData.event.startDate.trim(),
          endDate: nextFormData.event.endDate?.trim() || undefined,
          location: nextFormData.event.location?.trim() || undefined,
          description: nextFormData.event.description?.trim() || undefined,
          attendees: nextFormData.event.attendees || [],
        }
      : null;

    const data: NewsletterFormData = {
      ...nextFormData,
      poll: sanitizedPoll,
      event: sanitizedEvent,
      status,
    };
    
    if (isEditing && newsletter && onUpdate) {
      onUpdate(newsletter.id, data);
    } else {
      onSave(data);
    }

    if (shouldToast) {
      toast.success(status === 'published' ? t('manager.newsletterPublished') : t('manager.draftSaved'));
    }

    return true;
  }, [getCurrentFormData, isEditing, newsletter, onSave, onUpdate, t]);

  useImperativeHandle(ref, () => ({
    prepareToLeave: () => {
      if (isAutoSaveEnabled) {
        flushDraftAutoSave();
        return { requiresConfirmation: false };
      }

      return { requiresConfirmation: hasUnsavedPublishedChanges };
    },
    savePublishedChanges: () => {
      if (!newsletter || newsletter.status !== 'published') {
        return true;
      }

      return handleSave('published', false);
    },
  }), [flushDraftAutoSave, handleSave, hasUnsavedPublishedChanges, isAutoSaveEnabled, newsletter]);

  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData(prev => ({ ...prev, tags: [...prev.tags, tagInput.trim()] }));
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setFormData(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  const handleAddPoll = () => {
    setFormData((prev) => ({
      ...prev,
      poll: {
        id: `poll-${Date.now()}`,
        question: '',
        options: [
          { id: 'opt-1', text: '', votes: 0, voterUserIds: [] },
          { id: 'opt-2', text: '', votes: 0, voterUserIds: [] },
        ],
        createdAt: new Date().toISOString(),
      },
    }));
  };

  const handleRemovePoll = () => {
    setFormData((prev) => ({
      ...prev,
      poll: null,
    }));
  };

  const handleUpdatePollQuestion = (question: string) => {
    setFormData((prev) => (prev.poll ? {
      ...prev,
      poll: {
        ...prev.poll,
        question,
      },
    } : prev));
  };

  const handleAddPollOption = () => {
    setFormData((prev) => {
      if (!prev.poll) return prev;
      const nextId = `opt-${prev.poll.options.length + 1}`;
      return {
        ...prev,
        poll: {
          ...prev.poll,
          options: [...prev.poll.options, { id: nextId, text: '', votes: 0, voterUserIds: [] }],
        },
      };
    });
  };

  const handleUpdatePollOption = (index: number, text: string) => {
    setFormData((prev) => {
      if (!prev.poll) return prev;
      const nextOptions = [...prev.poll.options];
      if (nextOptions[index]) {
        nextOptions[index] = { ...nextOptions[index], text };
      }
      return {
        ...prev,
        poll: {
          ...prev.poll,
          options: nextOptions,
        },
      };
    });
  };

  const handleRemovePollOption = (index: number) => {
    setFormData((prev) => {
      if (!prev.poll || prev.poll.options.length <= 2) return prev;
      return {
        ...prev,
        poll: {
          ...prev.poll,
          options: prev.poll.options.filter((_, i) => i !== index),
        },
      };
    });
  };

  const handleAddEvent = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(14, 0, 0, 0);
    const startStr = tomorrow.toISOString().slice(0, 16);

    const endHour = new Date(tomorrow);
    endHour.setHours(15, 30, 0, 0);
    const endStr = endHour.toISOString().slice(0, 16);

    setFormData((prev) => ({
      ...prev,
      event: {
        id: `event-${Date.now()}`,
        title: prev.title.trim() ? `${prev.title.trim()}` : '',
        description: '',
        startDate: startStr,
        endDate: endStr,
        location: '',
        attendees: [],
      },
    }));
  };

  const handleRemoveEvent = () => {
    setFormData((prev) => ({
      ...prev,
      event: null,
    }));
  };

  const handleUpdateEvent = (fields: Partial<NewsletterEvent>) => {
    setFormData((prev) => (prev.event ? {
      ...prev,
      event: {
        ...prev.event,
        ...fields,
      },
    } : prev));
  };

  if (showPreview) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#171717]">{t('manager.preview')}</h2>
          <button
            onClick={() => setShowPreview(false)}
            className="btn-secondary flex items-center gap-2"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="w-4 h-4" />
            {t('manager.backToEditor')}
          </button>
        </div>

        {/* Preview Article */}
        <div className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
          {/* Cover Image */}
          {formData.coverImage && (
            <div className="relative h-64 lg:h-80">
              <img
                src={formData.coverImage}
                alt={formData.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            </div>
          )}

          {/* Content */}
          <div className="max-w-3xl mx-auto px-6 py-12">
            {/* Title */}
            <h1 className="text-3xl lg:text-4xl font-bold text-[#171717] mb-4" dir="auto">
              {formData.title}
            </h1>

            {/* Subtitle */}
            {formData.subtitle && (
              <p className="text-xl text-[#737373] mb-6" dir="auto">
                {formData.subtitle}
              </p>
            )}

            {/* Meta */}
            <div className="flex items-center gap-4 mb-8 pb-8 border-b border-[#E5E5E5]">
              <div className="w-10 h-10 bg-[#D93A3A]/10 rounded-full flex items-center justify-center">
                <HugeiconsIcon icon={UserIcon} className="w-5 h-5 text-[#D93A3A]" />
              </div>
              <div>
                <p className="font-medium text-[#171717]">{formData.author || t('manager.anonymous')}</p>
                <p className="text-sm text-[#737373]">
                  {formatDate(new Date(), { 
                    month: 'long', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })}
                </p>
              </div>
            </div>

            {/* Tags */}
            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-8">
                {formData.tags.map(tag => (
                  <span key={tag} className="tag tag-red">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Article Body */}
            <NewsletterContent
              html={formData.content}
              className="newsletter-article"
              dir="auto"
            />

            {/* Event Preview */}
            {formData.event && formData.event.title && formData.event.startDate && (
              <div className="mt-8">
                <NewsletterEventCard
                  event={formData.event}
                  newsletterId={autoSaveDraftId || 'preview'}
                  isInteractive={false}
                />
              </div>
            )}

            {/* Poll Preview */}
            {formData.poll && formData.poll.question && (
              <div className="mt-8">
                <NewsletterPollCard
                  poll={formData.poll}
                  newsletterId={autoSaveDraftId || 'preview'}
                  isInteractive={false}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-[#171717]">
          {isEditing ? t('manager.editNewsletter') : t('manager.createNewsletter')}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreview(true)}
            className="btn-secondary flex items-center gap-2"
          >
            <HugeiconsIcon icon={ViewIcon} className="w-4 h-4" />
            {t('manager.preview')}
          </button>
          <button
            onClick={onCancel}
            className="btn-secondary"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>

      {isAutoSaveEnabled && (
        <div className="flex items-center justify-between rounded-lg border border-[#E5E5E5] bg-white px-4 py-3 text-sm text-[#737373]">
          <span>{t('manager.autoSaveDraft')}</span>
          <span>{lastAutoSavedAt ? t('manager.lastSaved', { time: formatDate(lastAutoSavedAt, { hour: '2-digit', minute: '2-digit' }) }) : t('manager.waitingForChanges')}</span>
        </div>
      )}

      {/* Form */}
      <div className="space-y-6">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-[#171717] mb-2">
            {t('manager.titleRequired')}
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            dir={isRTL ? 'rtl' : 'ltr'}
            placeholder={t('manager.enterNewsletterTitle')}
            className="w-full text-lg font-semibold"
          />
        </div>

        {/* Subtitle */}
        <div>
          <label className="block text-sm font-medium text-[#171717] mb-2">
            {t('manager.subtitle')}
          </label>
          <input
            type="text"
            value={formData.subtitle}
            onChange={(e) => setFormData(prev => ({ ...prev, subtitle: e.target.value }))}
            dir={isRTL ? 'rtl' : 'ltr'}
            placeholder={t('manager.enterNewsletterSubtitle')}
            className="w-full"
          />
        </div>

        {/* Cover Image with Drag & Drop */}
        <div>
          <label className="block text-sm font-medium text-[#171717] mb-2">
            {t('manager.coverImage')}
          </label>
          <FileUploadZone
            value={formData.coverImage}
            onChange={(url) => setFormData(prev => ({ ...prev, coverImage: url }))}
            label={t('manager.uploadCoverImage')}
            maxSize={10}
          />
        </div>

        {/* Author */}
        <div>
          <label className="block text-sm font-medium text-[#171717] mb-2">
            {t('manager.author')}
          </label>
          <div className="relative">
            <HugeiconsIcon icon={UserIcon} className={cn('absolute top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A3A3]', isRTL ? 'right-3' : 'left-3')} />
            <input
              type="text"
              value={formData.author}
              onChange={(e) => setFormData(prev => ({ ...prev, author: e.target.value }))}
              dir={isRTL ? 'rtl' : 'ltr'}
              placeholder={t('manager.authorPlaceholder')}
              className={cn('w-full', isRTL ? 'pr-10' : 'pl-10')}
            />
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-[#171717] mb-2">
            {t('manager.tags')}
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <HugeiconsIcon icon={Tag01Icon} className={cn('absolute top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A3A3]', isRTL ? 'right-3' : 'left-3')} />
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
                dir={isRTL ? 'rtl' : 'ltr'}
                placeholder={t('manager.addTagPlaceholder')}
                className={cn('w-full', isRTL ? 'pr-10' : 'pl-10')}
              />
            </div>
            <button
              type="button"
              onClick={addTag}
              className="btn-secondary"
            >
              {t('manager.add')}
            </button>
          </div>
          {formData.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {formData.tags.map(tag => (
                <span key={tag} className="tag tag-red flex items-center gap-1">
                  {tag}
                  <button
                    onClick={() => removeTag(tag)}
                    className="hover:text-[#B91C1C]"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Content Editor */}
        <div>
          <label className="block text-sm font-medium text-[#171717] mb-2">
            {t('manager.content')} *
          </label>
          <AdvancedEditor
            ref={contentEditorRef}
            content={formData.content}
            onChange={(content) => setFormData(prev => ({ ...prev, content }))}
            placeholder={t('manager.editorPlaceholder')}
            title={formData.title || t('manager.editorTitleFallback')}
            onUploadPresentation={handleUploadPresentation}
          />
        </div>

        {/* Interactive Add-ons (Poll & Event) */}
        <div className="space-y-4 rounded-xl border border-[#E5E5E5] bg-[#FAFAFA] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[#171717]">
                {t('viewer.poll')} &amp; {t('viewer.event')}
              </h3>
              <p className="text-xs text-[#737373]">
                {t('manager.eventDescriptionPlaceholder')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!formData.poll && (
                <button
                  type="button"
                  onClick={handleAddPoll}
                  className="btn-secondary flex items-center gap-1.5 text-xs py-1.5"
                >
                  <HugeiconsIcon icon={BarChartIcon} className="w-3.5 h-3.5 -scale-y-100 text-[#D93A3A]" />
                  <span>{t('manager.addPoll')}</span>
                </button>
              )}
              {!formData.event && (
                <button
                  type="button"
                  onClick={handleAddEvent}
                  className="btn-secondary flex items-center gap-1.5 text-xs py-1.5"
                >
                  <HugeiconsIcon icon={Calendar01Icon} className="w-3.5 h-3.5 text-[#D93A3A]" />
                  <span>{t('manager.addEvent')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Poll Editor Card */}
          {formData.poll && (
            <div className="rounded-xl border border-[#E5E5E5] bg-white p-4 shadow-2xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#F0F0F0]">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-[#D93A3A]">
                    <HugeiconsIcon icon={BarChartIcon} className="w-4 h-4 -scale-y-100" />
                  </div>
                  <span className="font-semibold text-sm text-[#171717]">{t('manager.pollQuestion')}</span>
                </div>
                <button
                  type="button"
                  onClick={handleRemovePoll}
                  className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1 cursor-pointer"
                >
                  <HugeiconsIcon icon={Delete02Icon} className="w-3.5 h-3.5" />
                  <span>{t('manager.removePoll')}</span>
                </button>
              </div>

              <div>
                <input
                  type="text"
                  value={formData.poll.question}
                  onChange={(e) => handleUpdatePollQuestion(e.target.value)}
                  dir={isRTL ? 'rtl' : 'ltr'}
                  placeholder={t('manager.pollQuestionPlaceholder')}
                  className="w-full text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[#525252]">
                  {t('manager.pollOptions')}
                </label>
                {formData.poll.options.map((opt, idx) => (
                  <div key={opt.id || idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={opt.text}
                      onChange={(e) => handleUpdatePollOption(idx, e.target.value)}
                      dir={isRTL ? 'rtl' : 'ltr'}
                      placeholder={t('manager.pollOptionPlaceholder', { index: idx + 1 })}
                      className="flex-1 text-sm py-1.5"
                    />
                    {formData.poll!.options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemovePollOption(idx)}
                        className="p-1.5 text-[#A3A3A3] hover:text-red-600 transition-colors cursor-pointer"
                        title={t('manager.removeOption')}
                      >
                        <HugeiconsIcon icon={Delete02Icon} className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={handleAddPollOption}
                  className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[#D93A3A] hover:text-[#B91C1C] transition-colors cursor-pointer"
                >
                  <HugeiconsIcon icon={Add01Icon} className="w-3.5 h-3.5" />
                  <span>{t('manager.addOption')}</span>
                </button>
              </div>
            </div>
          )}

          {/* Event Editor Card */}
          {formData.event && (
            <div className="rounded-xl border border-[#E5E5E5] bg-white p-4 shadow-2xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#F0F0F0]">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-[#D93A3A]">
                    <HugeiconsIcon icon={Calendar03Icon} className="w-4 h-4" />
                  </div>
                  <span className="font-semibold text-sm text-[#171717]">{t('viewer.event')}</span>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveEvent}
                  className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1 cursor-pointer"
                >
                  <HugeiconsIcon icon={Delete02Icon} className="w-3.5 h-3.5" />
                  <span>{t('manager.removeEvent')}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-[#525252] mb-1">
                    {t('manager.eventTitle')} *
                  </label>
                  <input
                    type="text"
                    value={formData.event.title}
                    onChange={(e) => handleUpdateEvent({ title: e.target.value })}
                    dir={isRTL ? 'rtl' : 'ltr'}
                    placeholder={t('manager.eventTitlePlaceholder')}
                    className="w-full text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#525252] mb-1">
                    {t('manager.eventStartDate')} *
                  </label>
                  <input
                    type="datetime-local"
                    value={eventDateTimeInput(formData.event.startDate)}
                    onChange={(e) => handleUpdateEvent({ startDate: e.target.value })}
                    className="w-full text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#525252] mb-1">
                    {t('manager.eventEndDate')}
                  </label>
                  <input
                    type="datetime-local"
                    value={eventDateTimeInput(formData.event.endDate)}
                    onChange={(e) => handleUpdateEvent({ endDate: e.target.value })}
                    className="w-full text-sm"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-[#525252] mb-1">
                    {t('manager.eventLocation')}
                  </label>
                  <input
                    type="text"
                    value={formData.event.location || ''}
                    onChange={(e) => handleUpdateEvent({ location: e.target.value })}
                    dir={isRTL ? 'rtl' : 'ltr'}
                    placeholder={t('manager.eventLocationPlaceholder')}
                    className="w-full text-sm"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-[#525252] mb-1">
                    {t('manager.eventDescription')}
                  </label>
                  <textarea
                    rows={2}
                    value={formData.event.description || ''}
                    onChange={(e) => handleUpdateEvent({ description: e.target.value })}
                    dir={isRTL ? 'rtl' : 'ltr'}
                    placeholder={t('manager.eventDescriptionPlaceholder')}
                    className="w-full text-sm rounded-lg border border-[#E5E5E5] p-2.5 focus:border-[#D93A3A] focus:outline-hidden"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E5E5E5]">
          <button
            onClick={() => handleSave('draft')}
            className="btn-secondary flex items-center gap-2"
          >
            <HugeiconsIcon icon={FloppyDiskIcon} className="w-4 h-4" />
            {t('manager.saveAsDraft')}
          </button>
          <button
            onClick={() => handleSave('published')}
            className="btn-primary flex items-center gap-2"
          >
            <HugeiconsIcon icon={FloppyDiskIcon} className="w-4 h-4" />
            {t('manager.publishNewsletter')}
          </button>
        </div>
      </div>
    </div>
  );
});
