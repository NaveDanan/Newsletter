import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, FloppyDiskIcon, Tag01Icon, UserIcon, ViewIcon } from "@hugeicons/core-free-icons";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AdvancedEditor, type AdvancedEditorHandle } from '../../components/editor/AdvancedEditor';
import { FileUploadZone } from '../../components/upload/FileUploadZone';
import { toast } from 'sonner';
import type { Newsletter, NewsletterFormData } from '../../types/newsletter';
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
  };
}

function hasMeaningfulContent(data: NewsletterFormData): boolean {
  return Boolean(
    data.title.trim() ||
    data.subtitle.trim() ||
    data.content.replace(/<[^>]*>/g, '').trim() ||
    data.author.trim() ||
    data.coverImage.trim() ||
    data.tags.length
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
  onCancel: () => void;
  isEditing?: boolean;
}

export const NewsletterEditor = forwardRef<NewsletterEditorHandle, NewsletterEditorProps>(function NewsletterEditor({
  newsletter, 
  onSave, 
  onUpdate, 
  onAutoSave,
  onCancel,
  isEditing = false 
}, ref) {
  const [showPreview, setShowPreview] = useState(false);
  const [formData, setFormData] = useState<NewsletterFormData>({
    title: '',
    subtitle: '',
    content: '',
    author: '',
    coverImage: '',
    tags: [],
    status: 'draft',
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
  const liveFormData = getCurrentFormData();
  const publishedSnapshot = newsletter?.status === 'published'
    ? JSON.stringify(normalizeFormData({
        title: newsletter.title,
        subtitle: newsletter.subtitle,
        content: newsletter.content,
        author: newsletter.author,
        coverImage: newsletter.coverImage,
        tags: newsletter.tags,
        status: newsletter.status,
      }))
    : null;
  const currentSnapshot = JSON.stringify(normalizeFormData(liveFormData));
  const hasUnsavedPublishedChanges = Boolean(
    newsletter?.status === 'published' &&
    publishedSnapshot &&
    publishedSnapshot !== currentSnapshot
  );

  useEffect(() => {
    if (newsletter) {
      isHydratingFromNewsletter.current = true;
      setFormData({
        title: newsletter.title,
        subtitle: newsletter.subtitle,
        content: newsletter.content,
        author: newsletter.author,
        coverImage: newsletter.coverImage,
        tags: newsletter.tags,
        status: newsletter.status,
      });
      setAutoSaveDraftId(newsletter.id);
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

  useEffect(() => {
    if (!isAutoSaveEnabled || isHydratingFromNewsletter.current) {
      return;
    }

    if (!hasMeaningfulContent(liveFormData)) {
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
  }, [flushDraftAutoSave, isAutoSaveEnabled, liveFormData]);

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

  function handleSave(status: 'draft' | 'published', shouldToast = true): boolean {
    const nextFormData = getCurrentFormData();

    if (!nextFormData.title.trim()) {
      toast.error('Please enter a title');
      return false;
    }
    if (!nextFormData.content.replace(/<[^>]*>/g, '').trim()) {
      toast.error('Please add some content');
      return false;
    }

    const data = { ...nextFormData, status };
    
    if (isEditing && newsletter && onUpdate) {
      onUpdate(newsletter.id, data);
    } else {
      onSave(data);
    }

    if (shouldToast) {
      toast.success(status === 'published' ? 'Newsletter published!' : 'Draft saved!');
    }

    return true;
  }

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
  }), [flushDraftAutoSave, hasUnsavedPublishedChanges, isAutoSaveEnabled, newsletter]);

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

  if (showPreview) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#171717]">Preview</h2>
          <button
            onClick={() => setShowPreview(false)}
            className="btn-secondary flex items-center gap-2"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="w-4 h-4" />
            Back to Editor
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
            <h1 className="text-3xl lg:text-4xl font-bold text-[#171717] mb-4">
              {formData.title}
            </h1>

            {/* Subtitle */}
            {formData.subtitle && (
              <p className="text-xl text-[#737373] mb-6">
                {formData.subtitle}
              </p>
            )}

            {/* Meta */}
            <div className="flex items-center gap-4 mb-8 pb-8 border-b border-[#E5E5E5]">
              <div className="w-10 h-10 bg-[#D93A3A]/10 rounded-full flex items-center justify-center">
                <HugeiconsIcon icon={UserIcon} className="w-5 h-5 text-[#D93A3A]" />
              </div>
              <div>
                <p className="font-medium text-[#171717]">{formData.author || 'Anonymous'}</p>
                <p className="text-sm text-[#737373]">
                  {new Date().toLocaleDateString('en-US', { 
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
            <div 
              className="newsletter-article"
              dangerouslySetInnerHTML={{ __html: formData.content }}
            />
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
          {isEditing ? 'Edit Newsletter' : 'Create Newsletter'}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreview(true)}
            className="btn-secondary flex items-center gap-2"
          >
            <HugeiconsIcon icon={ViewIcon} className="w-4 h-4" />
            Preview
          </button>
          <button
            onClick={onCancel}
            className="btn-secondary"
          >
            Cancel
          </button>
        </div>
      </div>

      {isAutoSaveEnabled && (
        <div className="flex items-center justify-between rounded-lg border border-[#E5E5E5] bg-white px-4 py-3 text-sm text-[#737373]">
          <span>Changes are saved automatically as a draft.</span>
          <span>{lastAutoSavedAt ? `Last saved ${lastAutoSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Waiting for changes'}</span>
        </div>
      )}

      {/* Form */}
      <div className="space-y-6">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-[#171717] mb-2">
            Title *
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            placeholder="Enter newsletter title..."
            className="w-full text-lg font-semibold"
          />
        </div>

        {/* Subtitle */}
        <div>
          <label className="block text-sm font-medium text-[#171717] mb-2">
            Subtitle
          </label>
          <input
            type="text"
            value={formData.subtitle}
            onChange={(e) => setFormData(prev => ({ ...prev, subtitle: e.target.value }))}
            placeholder="A brief description of what this newsletter is about..."
            className="w-full"
          />
        </div>

        {/* Cover Image with Drag & Drop */}
        <div>
          <label className="block text-sm font-medium text-[#171717] mb-2">
            Cover Image
          </label>
          <FileUploadZone
            value={formData.coverImage}
            onChange={(url) => setFormData(prev => ({ ...prev, coverImage: url }))}
            label="Upload cover image"
            maxSize={5}
          />
        </div>

        {/* Author */}
        <div>
          <label className="block text-sm font-medium text-[#171717] mb-2">
            Author
          </label>
          <div className="relative">
            <HugeiconsIcon icon={UserIcon} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A3A3]" />
            <input
              type="text"
              value={formData.author}
              onChange={(e) => setFormData(prev => ({ ...prev, author: e.target.value }))}
              placeholder="Author name"
              className="w-full pl-10"
            />
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-[#171717] mb-2">
            Tags
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <HugeiconsIcon icon={Tag01Icon} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A3A3]" />
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add a tag and press Enter"
                className="w-full pl-10"
              />
            </div>
            <button
              type="button"
              onClick={addTag}
              className="btn-secondary"
            >
              Add
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
            Content *
          </label>
          <AdvancedEditor
            ref={contentEditorRef}
            content={formData.content}
            onChange={(content) => setFormData(prev => ({ ...prev, content }))}
            placeholder="Write your newsletter content here..."
            title={formData.title || 'Newsletter'}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E5E5E5]">
          <button
            onClick={() => handleSave('draft')}
            className="btn-secondary flex items-center gap-2"
          >
            <HugeiconsIcon icon={FloppyDiskIcon} className="w-4 h-4" />
            Save as Draft
          </button>
          <button
            onClick={() => handleSave('published')}
            className="btn-primary flex items-center gap-2"
          >
            <HugeiconsIcon icon={FloppyDiskIcon} className="w-4 h-4" />
            Publish Newsletter
          </button>
        </div>
      </div>
    </div>
  );
});
