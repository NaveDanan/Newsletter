import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  Delete02Icon,
  Edit02Icon,
  Image01Icon,
  Link01Icon,
  ViewIcon,
  ViewOffIcon,
} from '@hugeicons/core-free-icons';
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
import { IconPicker } from '@/components/ui/icon-picker';
import { useLocale } from '@/contexts/LocaleContext';
import { useNavigationData } from '@/contexts/NavigationDataContext';
import type { UserRole } from '@/lib/pocketbase/client';
import { cn } from '@/lib/utils';
import type {
  NavigationDropdown,
  NavigationDropdownFormData,
  NavigationLink,
  NavigationLinkFormData,
} from '@/types/navigation-link';

interface LinksViewProps {
  currentUserRole: UserRole | null;
}

const emptyLinkForm: NavigationLinkFormData = {
  dropdownId: '',
  name: '',
  description: '',
  url: '',
  iconUrl: '',
  hidden: false,
  order: 0,
};

const emptyDropdownForm: NavigationDropdownFormData = {
  label: '',
  dotColor: '#737373',
};

function isValidLinkTarget(value: string): boolean {
  return /^https?:\/\//i.test(value)
    || /^mailto:/i.test(value)
    || value.startsWith('/')
    || value.startsWith('#');
}

const DOT_COLOR_OPTIONS = [
  '#171717', '#D93A3A', '#A3A3A3', '#2563EB', '#16A34A',
  '#D97706', '#7C3AED', '#DB2777', '#0891B2', '#4F46E5',
];

export function LinksView({ currentUserRole }: LinksViewProps) {
  const { t } = useLocale();
  const {
    dropdowns,
    dropdownError,
    dropdownStorageMode,
    addDropdown,
    updateDropdown,
    removeDropdown,
    toggleDropdownVisibility,
    reorderDropdowns,
    links,
    linksLoading: isLoading,
    linksError,
    linksStorageMode,
    addLink,
    updateLink,
    deleteLink,
  } = useNavigationData();

  const isUsingLocalFallback = dropdownStorageMode === 'local' || linksStorageMode === 'local';
  const navigationSyncError = dropdownError ?? linksError;

  // Link dialog state
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<NavigationLink | null>(null);
  const [linkDraft, setLinkDraft] = useState<NavigationLinkFormData>(emptyLinkForm);
  const [isSaving, setIsSaving] = useState(false);

  // Dropdown dialog state
  const [isDropdownDialogOpen, setIsDropdownDialogOpen] = useState(false);
  const [editingDropdown, setEditingDropdown] = useState<NavigationDropdown | null>(null);
  const [dropdownDraft, setDropdownDraft] = useState<NavigationDropdownFormData>(emptyDropdownForm);

  // Expanded per-dropdown section
  const [expandedDropdownId, setExpandedDropdownId] = useState<string | null>(dropdowns[0]?.id ?? null);

  const linksByDropdown = useMemo(() => {
    const map = new Map<string, NavigationLink[]>();
    for (const dd of dropdowns) {
      map.set(dd.id, []);
    }
    for (const link of links) {
      const arr = map.get(link.dropdownId);
      if (arr) {
        arr.push(link);
      } else {
        const resourceArr = map.get('resources');
        if (resourceArr) resourceArr.push(link);
      }
    }
    // Sort by order within each dropdown
    for (const arr of map.values()) {
      arr.sort((a, b) => a.order - b.order);
    }
    return map;
  }, [dropdowns, links]);

  // --- Dropdown CRUD ---
  const openCreateDropdownDialog = () => {
    setEditingDropdown(null);
    setDropdownDraft(emptyDropdownForm);
    setIsDropdownDialogOpen(true);
  };

  const openEditDropdownDialog = (dd: NavigationDropdown) => {
    setEditingDropdown(dd);
    setDropdownDraft({ label: dd.label, dotColor: dd.dotColor });
    setIsDropdownDialogOpen(true);
  };

  const handleSaveDropdown = async () => {
    const label = dropdownDraft.label.trim();
    if (!label) {
      toast.error(t('linksPage.dropdownLabelRequired'));
      return;
    }

    try {
      if (editingDropdown) {
        await updateDropdown(editingDropdown.id, dropdownDraft);
        toast.success(t('linksPage.dropdownUpdated'));
      } else {
        await addDropdown(dropdownDraft);
        toast.success(t('linksPage.dropdownCreated'));
      }

      setIsDropdownDialogOpen(false);
      setEditingDropdown(null);
      setDropdownDraft(emptyDropdownForm);
    } catch {
      toast.error(t('common.tryAgain'));
    }
  };

  const handleDeleteDropdown = async (dd: NavigationDropdown) => {
    if (!window.confirm(t('linksPage.confirmDeleteDropdown', { name: dd.label }))) return;

    try {
      // Delete all links in this dropdown first
      const ddLinks = linksByDropdown.get(dd.id) ?? [];
      for (const link of ddLinks) {
        await deleteLink(link.id);
      }

      await removeDropdown(dd.id);
      toast.success(t('linksPage.dropdownDeleted'));
    } catch {
      toast.error(t('common.tryAgain'));
    }
  };

  const handleMoveDropdown = async (dd: NavigationDropdown, direction: -1 | 1) => {
    const sorted = [...dropdowns].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((d) => d.id === dd.id);
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;
    const ids = sorted.map((d) => d.id);
    [ids[idx], ids[targetIdx]] = [ids[targetIdx], ids[idx]];

    try {
      await reorderDropdowns(ids);
    } catch {
      toast.error(t('common.tryAgain'));
    }
  };

  const handleToggleDropdownVisibility = async (dd: NavigationDropdown) => {
    try {
      await toggleDropdownVisibility(dd.id);
    } catch {
      toast.error(t('common.tryAgain'));
    }
  };

  // --- Link CRUD ---
  const openCreateLinkDialog = (dropdownId: string) => {
    const ddLinks = linksByDropdown.get(dropdownId) ?? [];
    const maxOrder = ddLinks.reduce((max, l) => Math.max(max, l.order), -1);
    setEditingLink(null);
    setLinkDraft({ ...emptyLinkForm, dropdownId, order: maxOrder + 1 });
    setIsLinkDialogOpen(true);
  };

  const openEditLinkDialog = (link: NavigationLink) => {
    setEditingLink(link);
    setLinkDraft({
      dropdownId: link.dropdownId,
      name: link.name,
      description: link.description,
      url: link.url,
      iconUrl: link.iconUrl,
      hidden: link.hidden,
      order: link.order,
    });
    setIsLinkDialogOpen(true);
  };

  const handleSaveLink = async () => {
    const data = {
      ...linkDraft,
      name: linkDraft.name.trim(),
      description: linkDraft.description.trim(),
      url: linkDraft.url.trim(),
      iconUrl: linkDraft.iconUrl.trim(),
    };

    if (!data.name || !data.url) {
      toast.error(t('linksPage.nameUrlRequired'));
      return;
    }
    if (!isValidLinkTarget(data.url)) {
      toast.error(t('managerLinks.invalidUrl'));
      return;
    }

    setIsSaving(true);
    const result = editingLink
      ? await updateLink(editingLink.id, data)
      : await addLink(data);

    if (!result) {
      toast.error(t('common.tryAgain'));
      setIsSaving(false);
      return;
    }
    toast.success(editingLink ? t('managerLinks.updated') : t('managerLinks.created'));
    setIsLinkDialogOpen(false);
    setEditingLink(null);
    setLinkDraft(emptyLinkForm);
    setIsSaving(false);
  };

  const handleDeleteLink = async (link: NavigationLink) => {
    if (!window.confirm(t('managerLinks.confirmDelete', { name: link.name }))) return;
    const ok = await deleteLink(link.id);
    if (!ok) { toast.error(t('common.tryAgain')); return; }
    toast.success(t('managerLinks.deleted'));
  };

  const handleToggleLinkVisibility = async (link: NavigationLink) => {
    await updateLink(link.id, {
      dropdownId: link.dropdownId,
      name: link.name,
      description: link.description,
      url: link.url,
      iconUrl: link.iconUrl,
      hidden: !link.hidden,
      order: link.order,
    });
  };

  if (currentUserRole !== 'admin') {
    return (
      <div className="rounded-xl border border-[#E5E5E5] bg-white px-5 py-6 text-sm text-[#737373]">
        {t('managerLinks.adminOnly')}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-[#171717]">{t('linksPage.title')}</h1>
        <p className="mt-1 text-sm text-[#737373]">{t('linksPage.description')}</p>
      </div>

      {isUsingLocalFallback ? (
        <Alert className="border border-[#F5D0D0] bg-[#FFF7F7] text-[#171717]">
          <HugeiconsIcon icon={Image01Icon} className="h-4 w-4 text-[#D93A3A]" />
          <AlertTitle className="text-[#171717]">{t('managerLinks.savedLocallyTitle')}</AlertTitle>
          <AlertDescription className="text-[#737373]">
            {t('managerLinks.savedLocallyDescription')}
          </AlertDescription>
        </Alert>
      ) : navigationSyncError ? (
        <Alert variant="destructive" className="border border-[#F5D0D0] bg-[#FFF7F7] text-[#171717]">
          <HugeiconsIcon icon={Image01Icon} className="h-4 w-4 text-[#D93A3A]" />
          <AlertTitle className="text-[#171717]">{t('managerLinks.sharedSyncFailedTitle')}</AlertTitle>
          <AlertDescription className="text-[#737373]">
            <p>{t('managerLinks.sharedSyncFailedDescription')}</p>
            <p className="break-words text-xs">{navigationSyncError}</p>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* ==== Dropdown categories section ==== */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-[#171717]">{t('linksPage.dropdownCategories')}</h2>
            <p className="text-xs text-[#737373]">{t('linksPage.dropdownCategoriesHint')}</p>
          </div>
          <button onClick={openCreateDropdownDialog} className="btn-primary flex items-center gap-2 text-sm">
            <HugeiconsIcon icon={Add01Icon} className="w-4 h-4" />
            {t('linksPage.addDropdown')}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {dropdowns.map((dd, idx) => {
            const ddLinks = linksByDropdown.get(dd.id) ?? [];
            const visibleCount = ddLinks.filter((l) => !l.hidden).length;
            return (
              <div
                key={dd.id}
                className={cn(
                  'rounded-xl border bg-white p-4 transition-colors',
                  dd.hidden ? 'border-dashed border-[#D4D4D4] opacity-60' : 'border-[#E5E5E5]',
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: dd.dotColor }} />
                  <h3 className="text-sm font-semibold text-[#171717] truncate flex-1">{dd.label}</h3>
                </div>
                <p className="text-xs text-[#737373] mb-3">
                  {visibleCount} {t('linksPage.visibleItems')} · {ddLinks.length} {t('linksPage.totalItems')}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleMoveDropdown(dd, -1)}
                    disabled={idx === 0}
                    className="rounded-lg p-1.5 text-[#737373] transition-colors hover:bg-[#F3F4F6] hover:text-[#171717] disabled:opacity-30"
                    title="Move up"
                  >
                    <HugeiconsIcon icon={ArrowUp01Icon} className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleMoveDropdown(dd, 1)}
                    disabled={idx === dropdowns.length - 1}
                    className="rounded-lg p-1.5 text-[#737373] transition-colors hover:bg-[#F3F4F6] hover:text-[#171717] disabled:opacity-30"
                    title="Move down"
                  >
                    <HugeiconsIcon icon={ArrowDown01Icon} className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleToggleDropdownVisibility(dd)}
                    className="rounded-lg p-1.5 text-[#737373] transition-colors hover:bg-[#F3F4F6] hover:text-[#171717]"
                    title={dd.hidden ? t('linksPage.showDropdown') : t('linksPage.hideDropdown')}
                  >
                    <HugeiconsIcon icon={dd.hidden ? ViewOffIcon : ViewIcon} className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => openEditDropdownDialog(dd)}
                    className="rounded-lg p-1.5 text-[#737373] transition-colors hover:bg-[#F3F4F6] hover:text-[#171717]"
                    title={t('manager.edit')}
                  >
                    <HugeiconsIcon icon={Edit02Icon} className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteDropdown(dd)}
                    className="rounded-lg p-1.5 text-[#737373] transition-colors hover:bg-red-50 hover:text-red-600"
                    title={t('manager.delete')}
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ==== Per-dropdown link management ==== */}
      <section>
        <h2 className="text-lg font-semibold text-[#171717] mb-4">{t('linksPage.manageItems')}</h2>

        {isLoading ? (
          <div className="px-4 py-10 text-sm text-[#737373]">{t('managerLinks.loading')}</div>
        ) : (
          <div className="space-y-3">
            {dropdowns.map((dd) => {
              const ddLinks = linksByDropdown.get(dd.id) ?? [];
              const isExpanded = expandedDropdownId === dd.id;
              return (
                <div key={dd.id} className="rounded-xl border border-[#E5E5E5] bg-white overflow-hidden">
                  {/* Accordion header */}
                  <button
                    type="button"
                    onClick={() => setExpandedDropdownId(isExpanded ? null : dd.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#FAFAFA]"
                  >
                    <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: dd.dotColor }} />
                    <span className="text-sm font-semibold text-[#171717] flex-1">{dd.label}</span>
                    <span className="text-xs text-[#737373]">{ddLinks.length} {ddLinks.length === 1 ? 'item' : 'items'}</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={cn('text-[#737373] transition-transform', isExpanded && 'rotate-180')}
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>

                  {isExpanded ? (
                    <div className="border-t border-[#E5E5E5]">
                      {ddLinks.length === 0 ? (
                        <div className="px-4 py-8 text-center">
                          <HugeiconsIcon icon={Link01Icon} className="mx-auto mb-2 h-8 w-8 text-[#D4D4D4]" />
                          <p className="text-sm text-[#737373]">{t('linksPage.noItemsInDropdown')}</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-[#E5E5E5]">
                          {ddLinks.map((link) => (
                            <div
                              key={link.id}
                              className={cn(
                                'flex items-center gap-3 px-4 py-3',
                                link.hidden && 'opacity-50',
                              )}
                            >
                              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-[#E5E5E5] bg-[#FAFAFA] flex-shrink-0">
                                {link.iconUrl ? (
                                  <img src={link.iconUrl} alt={link.name} className="h-8 w-8 rounded-lg object-cover" />
                                ) : (
                                  <span className="text-xs font-semibold text-[#A3A3A3]">{link.name.charAt(0).toUpperCase()}</span>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-[#171717] truncate">{link.name}</p>
                                {link.description ? (
                                  <p className="text-xs text-[#737373] truncate">{link.description}</p>
                                ) : null}
                                <a
                                  href={link.url}
                                  target={link.url.startsWith('http') ? '_blank' : undefined}
                                  rel={link.url.startsWith('http') ? 'noreferrer' : undefined}
                                  className="text-xs text-[#D93A3A] hover:underline truncate block"
                                >
                                  {link.url}
                                </a>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  onClick={() => handleToggleLinkVisibility(link)}
                                  className="rounded-lg p-1.5 text-[#737373] transition-colors hover:bg-[#F3F4F6] hover:text-[#171717]"
                                  title={link.hidden ? t('linksPage.showItem') : t('linksPage.hideItem')}
                                >
                                  <HugeiconsIcon icon={link.hidden ? ViewOffIcon : ViewIcon} className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => openEditLinkDialog(link)}
                                  className="rounded-lg p-1.5 text-[#737373] transition-colors hover:bg-[#F3F4F6] hover:text-[#171717]"
                                  title={t('manager.edit')}
                                >
                                  <HugeiconsIcon icon={Edit02Icon} className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteLink(link)}
                                  className="rounded-lg p-1.5 text-[#737373] transition-colors hover:bg-red-50 hover:text-red-600"
                                  title={t('manager.delete')}
                                >
                                  <HugeiconsIcon icon={Delete02Icon} className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="border-t border-[#E5E5E5] px-4 py-3">
                        <button
                          onClick={() => openCreateLinkDialog(dd.id)}
                          className="flex items-center gap-2 text-sm font-medium text-[#D93A3A] hover:text-[#B91C1C] transition-colors"
                        >
                          <HugeiconsIcon icon={Add01Icon} className="w-4 h-4" />
                          {t('linksPage.addItem')}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ==== Link Dialog ==== */}
      <Dialog open={isLinkDialogOpen} onOpenChange={(open) => { if (!open) { setIsLinkDialogOpen(false); setEditingLink(null); setLinkDraft(emptyLinkForm); setIsSaving(false); } }}>
        <DialogContent className="max-w-2xl border-[#E5E5E5] bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#171717]">
              {editingLink ? t('managerLinks.editLink') : t('managerLinks.addLink')}
            </DialogTitle>
            <DialogDescription className="text-[#737373]">
              {t('linksPage.linkDialogDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-[#737373]">{t('linksPage.websiteName')}</label>
              <input
                type="text"
                value={linkDraft.name}
                onChange={(e) => setLinkDraft((p) => ({ ...p, name: e.target.value }))}
                placeholder={t('managerLinks.namePlaceholder')}
                className="w-full"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-[#737373]">{t('managerLinks.url')}</label>
              <input
                type="text"
                value={linkDraft.url}
                onChange={(e) => setLinkDraft((p) => ({ ...p, url: e.target.value }))}
                placeholder={t('managerLinks.urlPlaceholder')}
                className="w-full"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm text-[#737373]">
                {t('linksPage.shortDescription')} <span className="text-[#A3A3A3]">({t('linksPage.optional')})</span>
              </label>
              <textarea
                value={linkDraft.description}
                onChange={(e) => setLinkDraft((p) => ({ ...p, description: e.target.value }))}
                placeholder={t('managerLinks.descriptionPlaceholder')}
                rows={2}
                className="w-full resize-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-[#737373]">{t('linksPage.dropdown')}</label>
              <select
                value={linkDraft.dropdownId}
                onChange={(e) => setLinkDraft((p) => ({ ...p, dropdownId: e.target.value }))}
                className="w-full rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#171717]"
              >
                {dropdowns.map((dd) => (
                  <option key={dd.id} value={dd.id}>{dd.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 text-sm text-[#737373]">
                <input
                  type="checkbox"
                  checked={linkDraft.hidden}
                  onChange={(e) => setLinkDraft((p) => ({ ...p, hidden: e.target.checked }))}
                  className="rounded"
                />
                {t('linksPage.hiddenInNav')}
              </label>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm text-[#737373]">{t('linksPage.icon')}</label>
              <IconPicker
                value={linkDraft.iconUrl}
                onChange={(iconUrl) => setLinkDraft((p) => ({ ...p, iconUrl }))}
              />
            </div>
          </div>

          <DialogFooter>
            <button onClick={() => { setIsLinkDialogOpen(false); setEditingLink(null); setLinkDraft(emptyLinkForm); setIsSaving(false); }} className="btn-secondary" type="button">
              {t('common.cancel')}
            </button>
            <button onClick={handleSaveLink} className="btn-primary" type="button" disabled={isSaving}>
              {editingLink ? t('manager.saveChanges') : t('managerLinks.addLink')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==== Dropdown Dialog ==== */}
      <Dialog open={isDropdownDialogOpen} onOpenChange={(open) => { if (!open) { setIsDropdownDialogOpen(false); setEditingDropdown(null); } }}>
        <DialogContent className="max-w-md border-[#E5E5E5] bg-white">
          <DialogHeader>
            <DialogTitle className="text-[#171717]">
              {editingDropdown ? t('linksPage.editDropdown') : t('linksPage.addDropdown')}
            </DialogTitle>
            <DialogDescription className="text-[#737373]">
              {t('linksPage.dropdownDialogDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-[#737373]">{t('linksPage.dropdownLabel')}</label>
              <input
                type="text"
                value={dropdownDraft.label}
                onChange={(e) => setDropdownDraft((p) => ({ ...p, label: e.target.value }))}
                placeholder={t('linksPage.dropdownLabelPlaceholder')}
                className="w-full"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-[#737373]">{t('linksPage.dotColor')}</label>
              <div className="flex flex-wrap gap-2">
                {DOT_COLOR_OPTIONS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setDropdownDraft((p) => ({ ...p, dotColor: color }))}
                    className={cn(
                      'h-7 w-7 rounded-full border-2 transition-all',
                      dropdownDraft.dotColor === color ? 'border-[#171717] scale-110' : 'border-transparent',
                    )}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>
            {/* Preview */}
            <div className="rounded-xl border border-[#E5E5E5] bg-[#FAFAFA] p-3 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dropdownDraft.dotColor }} />
              <span className="text-sm font-semibold text-[#171717]">{dropdownDraft.label || t('linksPage.dropdownLabelPlaceholder')}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#737373" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </div>
          </div>

          <DialogFooter>
            <button onClick={() => { setIsDropdownDialogOpen(false); setEditingDropdown(null); }} className="btn-secondary" type="button">
              {t('common.cancel')}
            </button>
            <button onClick={handleSaveDropdown} className="btn-primary" type="button">
              {editingDropdown ? t('manager.saveChanges') : t('linksPage.addDropdown')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}