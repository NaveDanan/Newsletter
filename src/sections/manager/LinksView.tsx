import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, Delete02Icon, Edit02Icon, Image01Icon, Link01Icon } from '@hugeicons/core-free-icons';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLocale } from '@/contexts/LocaleContext';
import { useNavigationLinks } from '@/hooks/useNavigationLinks';
import type { UserRole } from '@/lib/pocketbase/client';
import { cn } from '@/lib/utils';
import type { NavigationLink, NavigationLinkFormData } from '@/types/navigation-link';

interface LinksViewProps {
  currentUserRole: UserRole | null;
}

const emptyForm: NavigationLinkFormData = {
  name: '',
  description: '',
  url: '',
  iconUrl: '',
};

function isValidLinkTarget(value: string): boolean {
  return /^https?:\/\//i.test(value)
    || /^mailto:/i.test(value)
    || value.startsWith('/')
    || value.startsWith('#');
}

export function LinksView({ currentUserRole }: LinksViewProps) {
  const { t } = useLocale();
  const { links, isLoading, storageMode, addLink, updateLink, deleteLink } = useNavigationLinks();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<NavigationLink | null>(null);
  const [draft, setDraft] = useState<NavigationLinkFormData>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  const sortedLinks = useMemo(() => [...links], [links]);

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingLink(null);
    setDraft(emptyForm);
    setIsSaving(false);
  };

  const openCreateDialog = () => {
    setEditingLink(null);
    setDraft(emptyForm);
    setIsDialogOpen(true);
  };

  const openEditDialog = (link: NavigationLink) => {
    setEditingLink(link);
    setDraft({
      name: link.name,
      description: link.description,
      url: link.url,
      iconUrl: link.iconUrl,
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    const nextDraft = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      url: draft.url.trim(),
      iconUrl: draft.iconUrl.trim(),
    };

    if (!nextDraft.name || !nextDraft.description || !nextDraft.url || !nextDraft.iconUrl) {
      toast.error(t('managerLinks.requiredFields'));
      return;
    }

    if (!isValidLinkTarget(nextDraft.url)) {
      toast.error(t('managerLinks.invalidUrl'));
      return;
    }

    setIsSaving(true);

    const result = editingLink
      ? await updateLink(editingLink.id, nextDraft)
      : await addLink(nextDraft);

    if (!result) {
      toast.error(t('common.tryAgain'));
      setIsSaving(false);
      return;
    }

    toast.success(editingLink ? t('managerLinks.updated') : t('managerLinks.created'));
    closeDialog();
  };

  const handleDelete = async (link: NavigationLink) => {
    if (!window.confirm(t('managerLinks.confirmDelete', { name: link.name }))) {
      return;
    }

    const ok = await deleteLink(link.id);
    if (!ok) {
      toast.error(t('common.tryAgain'));
      return;
    }

    toast.success(t('managerLinks.deleted'));
  };

  if (currentUserRole !== 'admin') {
    return (
      <div className="rounded-xl border border-[#E5E5E5] bg-white px-5 py-6 text-sm text-[#737373]">
        {t('managerLinks.adminOnly')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#171717]">{t('managerLinks.title')}</h1>
          <p className="mt-1 text-sm text-[#737373]">{t('managerLinks.description')}</p>
        </div>
        <button onClick={openCreateDialog} className="btn-primary flex items-center gap-2">
          <HugeiconsIcon icon={Add01Icon} className="w-4 h-4" />
          {t('managerLinks.addLink')}
        </button>
      </div>

      {storageMode === 'local' ? (
        <Alert className="border border-[#F5D0D0] bg-[#FFF7F7] text-[#171717]">
          <HugeiconsIcon icon={Image01Icon} className="h-4 w-4 text-[#D93A3A]" />
          <AlertTitle className="text-[#171717]">{t('managerLinks.savedLocallyTitle')}</AlertTitle>
          <AlertDescription className="text-[#737373]">
            {t('managerLinks.savedLocallyDescription')}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-[#E5E5E5] bg-white">
        <div className="hidden grid-cols-[88px_minmax(0,1.1fr)_minmax(0,1.5fr)_minmax(0,1.2fr)_88px] gap-4 border-b border-[#E5E5E5] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#A3A3A3] md:grid">
          <span>{t('managerLinks.columnIcon')}</span>
          <span>{t('managerLinks.columnName')}</span>
          <span>{t('managerLinks.columnDescription')}</span>
          <span>{t('managerLinks.columnUrl')}</span>
          <span className="text-right">{t('managerLinks.columnActions')}</span>
        </div>

        {isLoading ? (
          <div className="px-4 py-10 text-sm text-[#737373]">{t('managerLinks.loading')}</div>
        ) : sortedLinks.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <HugeiconsIcon icon={Link01Icon} className="mx-auto mb-3 h-10 w-10 text-[#D4D4D4]" />
            <p className="text-base font-semibold text-[#171717]">{t('managerLinks.noLinksTitle')}</p>
            <p className="mt-2 text-sm text-[#737373]">{t('managerLinks.noLinksDescription')}</p>
          </div>
        ) : (
          <div className="divide-y divide-[#E5E5E5]">
            {sortedLinks.map((link) => (
              <div key={link.id} className="grid gap-4 px-4 py-4 md:grid-cols-[88px_minmax(0,1.1fr)_minmax(0,1.5fr)_minmax(0,1.2fr)_88px] md:items-center">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-[#E5E5E5] bg-[#FAFAFA]">
                    <img src={link.iconUrl} alt={link.name} className="h-9 w-9 rounded-lg object-cover" />
                  </div>
                  <span className="text-xs font-medium uppercase tracking-[0.14em] text-[#A3A3A3] md:hidden">
                    {t('managerLinks.columnIcon')}
                  </span>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#A3A3A3] md:hidden">{t('managerLinks.columnName')}</p>
                  <p className="text-sm font-semibold text-[#171717]">{link.name}</p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#A3A3A3] md:hidden">{t('managerLinks.columnDescription')}</p>
                  <p className="text-sm text-[#737373]">{link.description}</p>
                </div>

                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#A3A3A3] md:hidden">{t('managerLinks.columnUrl')}</p>
                  <a
                    href={link.url}
                    target={link.url.startsWith('http') ? '_blank' : undefined}
                    rel={link.url.startsWith('http') ? 'noreferrer' : undefined}
                    className="block truncate text-sm text-[#D93A3A] hover:underline"
                  >
                    {link.url}
                  </a>
                </div>

                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => openEditDialog(link)}
                    className="rounded-lg p-2 text-[#737373] transition-colors hover:bg-[#F3F4F6] hover:text-[#171717]"
                    title={t('manager.edit')}
                  >
                    <HugeiconsIcon icon={Edit02Icon} className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(link)}
                    className="rounded-lg p-2 text-[#737373] transition-colors hover:bg-red-50 hover:text-red-600"
                    title={t('manager.delete')}
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog();
            return;
          }

          setIsDialogOpen(true);
        }}
      >
        <DialogContent className="max-w-2xl border-[#E5E5E5] bg-white">
          <DialogHeader>
            <DialogTitle className="text-[#171717]">
              {editingLink ? t('managerLinks.editLink') : t('managerLinks.addLink')}
            </DialogTitle>
            <DialogDescription className="text-[#737373]">
              {t('managerLinks.dialogDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-[#737373]">{t('managerLinks.name')}</label>
              <input
                type="text"
                value={draft.name}
                onChange={(event) => setDraft((previous) => ({ ...previous, name: event.target.value }))}
                placeholder={t('managerLinks.namePlaceholder')}
                className="w-full"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-[#737373]">{t('managerLinks.url')}</label>
              <input
                type="text"
                value={draft.url}
                onChange={(event) => setDraft((previous) => ({ ...previous, url: event.target.value }))}
                placeholder={t('managerLinks.urlPlaceholder')}
                className="w-full"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm text-[#737373]">{t('managerLinks.linkDescription')}</label>
              <textarea
                value={draft.description}
                onChange={(event) => setDraft((previous) => ({ ...previous, description: event.target.value }))}
                placeholder={t('managerLinks.descriptionPlaceholder')}
                rows={3}
                className="w-full resize-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-[#737373]">{t('managerLinks.iconUrl')}</label>
              <input
                type="text"
                value={draft.iconUrl}
                onChange={(event) => setDraft((previous) => ({ ...previous, iconUrl: event.target.value }))}
                placeholder={t('managerLinks.iconUrlPlaceholder')}
                className="w-full"
              />
            </div>

            <div>
              <p className="mb-1 block text-sm text-[#737373]">{t('managerLinks.preview')}</p>
              <div className="flex h-[110px] items-center gap-4 rounded-xl border border-[#E5E5E5] bg-[#FAFAFA] px-4">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-[#E5E5E5] bg-white">
                  {draft.iconUrl ? (
                    <img src={draft.iconUrl} alt={draft.name || t('managerLinks.preview')} className="h-11 w-11 rounded-lg object-cover" />
                  ) : (
                    <HugeiconsIcon icon={Image01Icon} className="h-5 w-5 text-[#A3A3A3]" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className={cn('truncate text-sm font-semibold', draft.name ? 'text-[#171717]' : 'text-[#A3A3A3]')}>
                    {draft.name || t('managerLinks.namePlaceholder')}
                  </p>
                  <p className={cn('mt-1 line-clamp-2 text-xs', draft.description ? 'text-[#737373]' : 'text-[#A3A3A3]')}>
                    {draft.description || t('managerLinks.descriptionPlaceholder')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <button onClick={closeDialog} className="btn-secondary" type="button">
              {t('common.cancel')}
            </button>
            <button onClick={handleSave} className="btn-primary" type="button" disabled={isSaving}>
              {editingLink ? t('manager.saveChanges') : t('managerLinks.addLink')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}