import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, BarChartIcon, Calendar03Icon, CheckmarkCircle02Icon, Clock01Icon, Delete02Icon, Edit02Icon, FileAttachmentIcon, Globe02Icon, GlobeXIcon, Loading02Icon, Mail01Icon, Search01Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { useState } from 'react';
import { toast } from 'sonner';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';
import type { Newsletter } from '../../types/newsletter';

interface NewsletterListProps {
  newsletters: Newsletter[];
  onCreate: () => void;
  onEdit: (newsletter: Newsletter) => void;
  onDelete: (id: string) => Promise<boolean> | boolean;
  onSendUpdate: (id: string) => Promise<number | null> | number | null;
  onView: (newsletter: Newsletter) => void;
  onTogglePublish: (newsletter: Newsletter) => Promise<Newsletter | boolean | null> | Newsletter | boolean | null;
  canCreate: boolean;
  canEdit: (newsletter: Newsletter) => boolean;
  canDelete: () => boolean;
  canSendUpdate: () => boolean;
}

export function NewsletterList({ 
  newsletters, 
  onCreate, 
  onEdit, 
  onDelete,
  onSendUpdate,
  onView,
  onTogglePublish,
  canCreate,
  canEdit,
  canDelete,
  canSendUpdate,
}: NewsletterListProps) {
  const { formatNumber, isRTL, t } = useLocale();
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sendingUpdateId, setSendingUpdateId] = useState<string | null>(null);
  const [togglingPublishId, setTogglingPublishId] = useState<string | null>(null);

  const filteredNewsletters = newsletters
    .filter(n => filter === 'all' ? true : n.status === filter)
    .filter(n => 
      n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.author.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()))
    );

  const handleDelete = async (id: string) => {
    if (deletingId) {
      return;
    }

    if (deleteConfirm !== id) {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
      return;
    }

    setDeletingId(id);

    try {
      const deleted = await onDelete(id);

      if (deleted) {
        setDeleteConfirm(null);
        toast.success(t('manager.newsletterDeleted'));
      }
    } catch {
      // The delete callback handles user-facing error messages.
    } finally {
      setDeletingId(null);
    }
  };

  const handleSendUpdate = async (newsletter: Newsletter) => {
    if (sendingUpdateId || newsletter.status !== 'published') {
      return;
    }

    setSendingUpdateId(newsletter.id);

    try {
      const recipientCount = await onSendUpdate(newsletter.id);

      if (typeof recipientCount === 'number') {
        toast.success(t('manager.newsletterUpdateSent', {
          count: formatNumber(recipientCount),
        }));
      }
    } catch {
      // The send callback handles user-facing error messages.
    } finally {
      setSendingUpdateId(null);
    }
  };

  const handleTogglePublish = async (newsletter: Newsletter) => {
    if (togglingPublishId) {
      return;
    }

    setTogglingPublishId(newsletter.id);
    const isPublishing = newsletter.status !== 'published';

    try {
      const result = await onTogglePublish(newsletter);

      if (result) {
        toast.success(
          isPublishing
            ? t('manager.newsletterPublished')
            : t('manager.newsletterUnpublished')
        );
      }
    } catch {
      // The update callback handles user-facing error messages.
    } finally {
      setTogglingPublishId(null);
    }
  };

  const stats = {
    total: newsletters.length,
    published: newsletters.filter(n => n.status === 'published').length,
    drafts: newsletters.filter(n => n.status === 'draft').length,
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="feed-post-card p-4 sm:p-5">
          <p className="text-xs sm:text-sm font-semibold text-[var(--text-secondary)] mb-1">{t('manager.total')}</p>
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)]">{formatNumber(stats.total)}</p>
        </div>
        <div className="feed-post-card p-4 sm:p-5">
          <p className="text-xs sm:text-sm font-semibold text-[var(--text-secondary)] mb-1">{t('manager.published')}</p>
          <p className="text-xl sm:text-2xl font-extrabold text-emerald-400">{formatNumber(stats.published)}</p>
        </div>
        <div className="feed-post-card p-4 sm:p-5">
          <p className="text-xs sm:text-sm font-semibold text-[var(--text-secondary)] mb-1">{t('manager.drafts')}</p>
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--text-muted)]">{formatNumber(stats.drafts)}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-[var(--bg-card)] p-1 rounded-full border border-[var(--border-subtle)]">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all ${
              filter === 'all'
                ? 'bg-[var(--primary-accent)] text-[var(--accent-contrast)] shadow-md'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-pill-hover)]'
            }`}
          >
            {t('manager.all')}
          </button>
          <button
            onClick={() => setFilter('published')}
            className={`px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all ${
              filter === 'published'
                ? 'bg-[var(--primary-accent)] text-[var(--accent-contrast)] shadow-md'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-pill-hover)]'
            }`}
          >
            {t('manager.published')}
          </button>
          <button
            onClick={() => setFilter('draft')}
            className={`px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all ${
              filter === 'draft'
                ? 'bg-[var(--primary-accent)] text-[var(--accent-contrast)] shadow-md'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-pill-hover)]'
            }`}
          >
            {t('manager.drafts')}
          </button>
        </div>
        {canCreate && (
          <button
            onClick={onCreate}
            className="btn-hire-me flex items-center gap-2 text-xs sm:text-sm py-2 px-5"
          >
            <HugeiconsIcon icon={Add01Icon} className="w-4 h-4" />
            {t('manager.createNewsletter')}
          </button>
        )}
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <HugeiconsIcon icon={Search01Icon} className={cn('absolute top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]', isRTL ? 'right-3' : 'left-3')} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            dir={isRTL ? 'rtl' : 'ltr'}
            placeholder={t('manager.searchNewsletters')}
            className={cn('w-full h-10 rounded-full bg-[var(--bg-card)] border border-[var(--border-subtle)] px-4 text-xs sm:text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary-accent)] transition-all', isRTL ? 'pr-10' : 'pl-10')}
          />
        </div>
      </div>

      {/* Newsletter List */}
      <div className="feed-post-card p-0 overflow-hidden border border-[var(--border-subtle)]">
        {filteredNewsletters.length === 0 ? (
          <div className="p-12 text-center">
            <HugeiconsIcon icon={FileAttachmentIcon} className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
            <p className="text-[var(--text-secondary)]">
              {searchTerm ? t('manager.noNewslettersFound') : t('manager.noNewslettersYet')}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {filteredNewsletters.map((newsletter) => {
              const canEditCurrent = canEdit(newsletter);
              const canDeleteCurrent = canDelete();
              const canSendUpdateCurrent = canSendUpdate() && newsletter.status === 'published';
              const isSendingUpdate = sendingUpdateId === newsletter.id;
              const isTogglingPublish = togglingPublishId === newsletter.id;

              return (
                <div
                  key={newsletter.id}
                  className="p-4 sm:p-5 hover:bg-[var(--bg-card-hover)] transition-colors group"
                >
                  <div className="flex items-start gap-4">
                  {/* Cover Image */}
                  <div className="w-24 h-16 rounded-xl overflow-hidden flex-shrink-0 border border-[var(--border-subtle)] bg-[var(--bg-app)]">
                    {newsletter.coverImage ? (
                      <img
                        src={newsletter.coverImage}
                        alt={newsletter.title || 'Newsletter cover'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[var(--bg-pill)] text-xs font-semibold text-[var(--text-muted)]">
                        {t('manager.draft')}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-bold text-sm sm:text-base text-[var(--text-primary)] group-hover:text-[var(--primary-accent)] transition-colors line-clamp-1" dir="auto">
                          {newsletter.title || t('manager.untitledDraft')}
                        </h3>
                        <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1 line-clamp-1" dir="auto">
                          {newsletter.subtitle || t('manager.noSubtitleYet')}
                        </p>
                      </div>
                      <span className={`flex-shrink-0 text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                        newsletter.status === 'published'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-[var(--bg-pill)] text-[var(--text-secondary)] border border-[var(--border-subtle)]'
                      }`}>
                        {newsletter.status === 'published' ? (
                          <span className="flex items-center gap-1">
                            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-3 h-3" />
                            {t('manager.published')}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <HugeiconsIcon icon={Clock01Icon} className="w-3 h-3" />
                            {t('manager.draft')}
                          </span>
                        )}
                      </span>
                      {newsletter.event && (
                        <span className="flex-shrink-0 flex items-center gap-1 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 px-2 py-0.5 text-xs font-medium">
                          <HugeiconsIcon icon={Calendar03Icon} className="w-3 h-3" />
                          {t('viewer.event')}
                        </span>
                      )}
                      {newsletter.poll && (
                        <span className="flex-shrink-0 flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 text-xs font-medium">
                          <HugeiconsIcon icon={BarChartIcon} className="w-3 h-3 -scale-y-100" />
                          {t('viewer.poll')}
                        </span>
                      )}
                    </div>

                    {/* Meta */}
                    <div className="flex items-center gap-4 mt-2 text-xs sm:text-sm text-[var(--text-secondary)]">
                      <span dir="auto">{newsletter.author || t('manager.unknownAuthor')}</span>
                      <span>·</span>
                      <span>{newsletter.publishedAt}</span>
                      <span>·</span>
                      <span>{newsletter.readTime}</span>
                      {newsletter.tags.length > 0 && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            {newsletter.tags.slice(0, 2).map(tag => (
                              <span key={tag} className="skill-tag text-[10px] py-0.5 px-2">
                                #{tag}
                              </span>
                            ))}
                            {newsletter.tags.length > 2 && (
                              <span className="text-[var(--text-muted)] text-xs">+{formatNumber(newsletter.tags.length - 2)}</span>
                            )}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Engagement */}
                    <div className="flex items-center gap-4 mt-2 text-xs sm:text-sm text-[var(--text-muted)]">
                      <span>{formatNumber(newsletter.likes)} {t('manager.likes')}</span>
                      <span>{formatNumber(newsletter.comments)} {t('manager.comments')}</span>
                      <span>{formatNumber(newsletter.shares)} {t('manager.shares')}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onView(newsletter)}
                      className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-pill-hover)] rounded-xl transition-colors"
                      title={t('manager.view')}
                    >
                      <HugeiconsIcon icon={ViewIcon} className="w-4 h-4" />
                    </button>
                    {canEditCurrent && (
                      <button
                        onClick={() => onEdit(newsletter)}
                        className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-pill-hover)] rounded-xl transition-colors"
                        title={t('manager.edit')}
                      >
                        <HugeiconsIcon icon={Edit02Icon} className="w-4 h-4" />
                      </button>
                    )}
                    {canEditCurrent && (
                      <button
                        onClick={() => handleTogglePublish(newsletter)}
                        disabled={Boolean(togglingPublishId)}
                        className={cn(
                          'p-2 rounded-xl transition-colors disabled:cursor-wait disabled:opacity-60',
                          newsletter.status === 'published'
                            ? 'text-amber-500 hover:bg-amber-500/10'
                            : 'text-emerald-500 hover:bg-emerald-500/10'
                        )}
                        title={
                          newsletter.status === 'published'
                            ? t('manager.unpublish')
                            : t('manager.publish')
                        }
                        aria-label={
                          newsletter.status === 'published'
                            ? t('manager.unpublish')
                            : t('manager.publish')
                        }
                      >
                        <HugeiconsIcon
                          icon={
                            isTogglingPublish
                              ? Loading02Icon
                              : newsletter.status === 'published'
                              ? GlobeXIcon
                              : Globe02Icon
                          }
                          className={cn('w-4 h-4', isTogglingPublish && 'animate-spin')}
                        />
                      </button>
                    )}
                    {canSendUpdateCurrent && (
                      <button
                        onClick={() => handleSendUpdate(newsletter)}
                        disabled={Boolean(sendingUpdateId)}
                        className="p-2 text-[#737373] hover:text-[#D93A3A] hover:bg-red-50 rounded-lg transition-colors disabled:cursor-wait disabled:opacity-60"
                        title={t('manager.sendUpdateEmail')}
                      >
                        <HugeiconsIcon
                          icon={isSendingUpdate ? Loading02Icon : Mail01Icon}
                          className={cn('w-4 h-4', isSendingUpdate && 'animate-spin')}
                        />
                      </button>
                    )}
                    {canDeleteCurrent && (
                      <button
                        onClick={() => handleDelete(newsletter.id)}
                        disabled={deletingId === newsletter.id}
                        className={`p-2 rounded-lg transition-colors ${
                          deleteConfirm === newsletter.id
                            ? 'text-red-600 bg-red-100'
                            : 'text-[#737373] hover:text-red-600 hover:bg-red-50'
                        }`}
                        title={deleteConfirm === newsletter.id ? t('manager.confirmDelete') : t('manager.delete')}
                      >
                        <HugeiconsIcon icon={Delete02Icon} className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
