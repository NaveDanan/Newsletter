import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, CheckmarkCircle02Icon, Clock01Icon, Delete02Icon, Edit02Icon, FileAttachmentIcon, Search01Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { useState } from 'react';
import { toast } from 'sonner';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';
import type { Newsletter } from '../../types/newsletter';

interface NewsletterListProps {
  newsletters: Newsletter[];
  onCreate: () => void;
  onEdit: (newsletter: Newsletter) => void;
  onDelete: (id: string) => void;
  onView: (newsletter: Newsletter) => void;
  canCreate: boolean;
  canEdit: (newsletter: Newsletter) => boolean;
  canDelete: () => boolean;
}

export function NewsletterList({ 
  newsletters, 
  onCreate, 
  onEdit, 
  onDelete,
  onView,
  canCreate,
  canEdit,
  canDelete,
}: NewsletterListProps) {
  const { formatNumber, isRTL, t } = useLocale();
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const filteredNewsletters = newsletters
    .filter(n => filter === 'all' ? true : n.status === filter)
    .filter(n => 
      n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.author.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()))
    );

  const handleDelete = (id: string) => {
    if (deleteConfirm === id) {
      onDelete(id);
      setDeleteConfirm(null);
      toast.success(t('manager.newsletterDeleted'));
    } else {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
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
        <div className="dashboard-card">
          <p className="text-sm text-[#737373] mb-1">{t('manager.total')}</p>
          <p className="text-2xl font-bold text-[#171717]">{formatNumber(stats.total)}</p>
        </div>
        <div className="dashboard-card">
          <p className="text-sm text-[#737373] mb-1">{t('manager.published')}</p>
          <p className="text-2xl font-bold text-green-600">{formatNumber(stats.published)}</p>
        </div>
        <div className="dashboard-card">
          <p className="text-sm text-[#737373] mb-1">{t('manager.drafts')}</p>
          <p className="text-2xl font-bold text-[#A3A3A3]">{formatNumber(stats.drafts)}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === 'all'
                ? 'bg-[#171717] text-white'
                : 'bg-white text-[#737373] border border-[#E5E5E5] hover:text-[#171717]'
            }`}
          >
            {t('manager.all')}
          </button>
          <button
            onClick={() => setFilter('published')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === 'published'
                ? 'bg-green-600 text-white'
                : 'bg-white text-[#737373] border border-[#E5E5E5] hover:text-[#171717]'
            }`}
          >
            {t('manager.published')}
          </button>
          <button
            onClick={() => setFilter('draft')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === 'draft'
                ? 'bg-[#A3A3A3] text-white'
                : 'bg-white text-[#737373] border border-[#E5E5E5] hover:text-[#171717]'
            }`}
          >
            {t('manager.drafts')}
          </button>
        </div>
        {canCreate && (
          <button
            onClick={onCreate}
            className="btn-primary flex items-center gap-2"
          >
            <HugeiconsIcon icon={Add01Icon} className="w-4 h-4" />
            {t('manager.createNewsletter')}
          </button>
        )}
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <HugeiconsIcon icon={Search01Icon} className={cn('absolute top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A3A3]', isRTL ? 'right-3' : 'left-3')} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            dir={isRTL ? 'rtl' : 'ltr'}
            placeholder={t('manager.searchNewsletters')}
            className={cn('w-full', isRTL ? 'pr-10' : 'pl-10')}
          />
        </div>
      </div>

      {/* Newsletter List */}
      <div className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
        {filteredNewsletters.length === 0 ? (
          <div className="p-12 text-center">
            <HugeiconsIcon icon={FileAttachmentIcon} className="w-12 h-12 text-[#D4D4D4] mx-auto mb-4" />
            <p className="text-[#737373]">
              {searchTerm ? t('manager.noNewslettersFound') : t('manager.noNewslettersYet')}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#E5E5E5]">
            {filteredNewsletters.map((newsletter) => {
              const canEditCurrent = canEdit(newsletter);
              const canDeleteCurrent = canDelete();

              return (
                <div
                  key={newsletter.id}
                  className="p-4 hover:bg-[#F9FAFB] transition-colors group"
                >
                  <div className="flex items-start gap-4">
                  {/* Cover Image */}
                  <div className="w-24 h-16 rounded-lg overflow-hidden flex-shrink-0">
                    {newsletter.coverImage ? (
                      <img
                        src={newsletter.coverImage}
                        alt={newsletter.title || 'Newsletter cover'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[#F3F4F6] text-xs font-medium text-[#A3A3A3]">
                        {t('manager.draft')}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-semibold text-[#171717] line-clamp-1" dir="auto">
                          {newsletter.title || t('manager.untitledDraft')}
                        </h3>
                        <p className="text-sm text-[#737373] mt-1 line-clamp-1" dir="auto">
                          {newsletter.subtitle || t('manager.noSubtitleYet')}
                        </p>
                      </div>
                      <span className={`flex-shrink-0 text-xs px-2 py-1 rounded-full ${
                        newsletter.status === 'published'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-[#F3F4F6] text-[#737373]'
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
                    </div>

                    {/* Meta */}
                    <div className="flex items-center gap-4 mt-2 text-sm text-[#737373]">
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
                              <span key={tag} className="tag tag-gray">
                                {tag}
                              </span>
                            ))}
                            {newsletter.tags.length > 2 && (
                              <span className="text-[#A3A3A3]">+{formatNumber(newsletter.tags.length - 2)}</span>
                            )}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Engagement */}
                    <div className="flex items-center gap-4 mt-2 text-sm text-[#737373]">
                      <span>{formatNumber(newsletter.likes)} {t('manager.likes')}</span>
                      <span>{formatNumber(newsletter.comments)} {t('manager.comments')}</span>
                      <span>{formatNumber(newsletter.shares)} {t('manager.shares')}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onView(newsletter)}
                      className="p-2 text-[#737373] hover:text-[#171717] hover:bg-[#F3F4F6] rounded-lg transition-colors"
                      title={t('manager.view')}
                    >
                      <HugeiconsIcon icon={ViewIcon} className="w-4 h-4" />
                    </button>
                    {canEditCurrent && (
                      <button
                        onClick={() => onEdit(newsletter)}
                        className="p-2 text-[#737373] hover:text-[#171717] hover:bg-[#F3F4F6] rounded-lg transition-colors"
                        title={t('manager.edit')}
                      >
                        <HugeiconsIcon icon={Edit02Icon} className="w-4 h-4" />
                      </button>
                    )}
                    {canDeleteCurrent && (
                      <button
                        onClick={() => handleDelete(newsletter.id)}
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
