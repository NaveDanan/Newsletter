import { HugeiconsIcon } from "@hugeicons/react";
import { BarChartIcon, Calendar01Icon, Cancel01Icon, FileAttachmentIcon, FileSpreadsheetIcon, Link01Icon, Logout01Icon, Menu01Icon, Target01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { useRef, useState } from 'react';
import { LanguageToggleButton } from '@/components/LanguageToggleButton';
import { useLocale } from '@/contexts/LocaleContext';
import { useSubscriberCount } from '@/hooks/useSubscriberCount';
import { cn } from '@/lib/utils';
import { ProjectView } from './manager/ProjectView';
import { GoalsView } from './manager/GoalsView';
import { GanttView } from './manager/GanttView';
import { LinksView } from './manager/LinksView';
import { SpreadsheetView } from './manager/SpreadsheetView';
import { NewsletterList } from './manager/NewsletterList';
import { NewsletterEditor, type NewsletterEditorHandle } from './manager/NewsletterEditor';
import { NewsletterViewer } from './NewsletterViewer';
import {
  canAccessManagerTab,
  canCreateNewsletter,
  canDeleteNewsletter,
  canEditNewsletter,
} from '@/lib/auth/permissions';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { PocketBaseUser, UserRole } from '@/lib/pocketbase/client';
import type { Newsletter, NewsletterComment, NewsletterFormData } from '../types/newsletter';

export type Tab = 'newsletters' | 'projects' | 'goals' | 'gantt' | 'spreadsheet' | 'links';
type ViewMode = 'list' | 'editor' | 'viewer';

interface ManagerDashboardProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onOpenGanttEditor: (projectId: string) => void;
  onLogout: () => void;
  onHomeClick: () => void;
  currentUser: PocketBaseUser | null;
  currentUserRole: UserRole | null;
  newsletters: Newsletter[];
  addNewsletter: (data: NewsletterFormData) => Promise<Newsletter | null> | Newsletter | null;
  upsertDraftNewsletter: (id: string | null, data: Partial<NewsletterFormData>) => Promise<Newsletter | null> | Newsletter | null;
  updateNewsletter: (id: string, data: Partial<NewsletterFormData>) => Promise<Newsletter | null> | Newsletter | null;
  uploadPresentation: (id: string, file: File) => Promise<{ newsletter: Newsletter; url: string; fileName: string; previewUrls?: string[]; previewStatus?: 'ready' | 'failed'; previewError?: string } | null> | { newsletter: Newsletter; url: string; fileName: string; previewUrls?: string[]; previewStatus?: 'ready' | 'failed'; previewError?: string } | null;
  deleteNewsletter: (id: string) => Promise<boolean> | boolean;
  sendNewsletterUpdate: (id: string) => Promise<number | null> | number | null;
  onToggleNewsletterLike: (newsletterId: string) => void;
  onAddNewsletterComment: (newsletterId: string, body: string) => Promise<NewsletterComment | null> | NewsletterComment | null;
  onToggleCommentLike: (newsletterId: string, commentId: string) => void;
}

export function ManagerDashboard({
  activeTab,
  onTabChange,
  onOpenGanttEditor,
  onLogout,
  onHomeClick,
  currentUser,
  currentUserRole,
  newsletters,
  addNewsletter,
  upsertDraftNewsletter,
  updateNewsletter,
  uploadPresentation,
  deleteNewsletter,
  sendNewsletterUpdate,
  onToggleNewsletterLike,
  onAddNewsletterComment,
  onToggleCommentLike,
}: ManagerDashboardProps) {
  const { formatNumber, isRTL, t } = useLocale();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const { subscriberCount } = useSubscriberCount();
  const [editingNewsletter, setEditingNewsletter] = useState<Newsletter | null>(null);
  const [viewingNewsletter, setViewingNewsletter] = useState<Newsletter | null>(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const editorRef = useRef<NewsletterEditorHandle | null>(null);
  const pendingLeaveActionRef = useRef<(() => void) | null>(null);
  const activeViewingNewsletter = viewingNewsletter
    ? newsletters.find((newsletter) => newsletter.id === viewingNewsletter.id) ?? null
    : null;
  const publishedNewsletterCount = newsletters.filter((newsletter) => newsletter.status === 'published').length;

  const tabs = [
    { id: 'newsletters' as Tab, label: t('manager.newsletters'), icon: FileAttachmentIcon },
    { id: 'projects' as Tab, label: t('manager.projects'), icon: Calendar01Icon },
    { id: 'goals' as Tab, label: t('manager.goals'), icon: Target01Icon },
    { id: 'gantt' as Tab, label: t('manager.gantt'), icon: BarChartIcon },
    { id: 'spreadsheet' as Tab, label: t('manager.spreadsheet'), icon: FileSpreadsheetIcon },
    { id: 'links' as Tab, label: t('manager.links'), icon: Link01Icon },
  ].filter((tab) => canAccessManagerTab(currentUserRole, tab.id));

  const handleCreateNewsletter = () => {
    if (!canCreateNewsletter(currentUserRole)) {
      return;
    }

    setEditingNewsletter(null);
    setViewMode('editor');
  };

  const handleEditNewsletter = (newsletter: Newsletter) => {
    setEditingNewsletter(newsletter);
    setViewMode('editor');
  };

  const handleViewNewsletter = (newsletter: Newsletter) => {
    setViewingNewsletter(newsletter);
    setViewMode('viewer');
  };

  const handleSaveNewsletter = (data: NewsletterFormData) => {
    const result = addNewsletter(data);
    if (result instanceof Promise) {
      result.then((created) => {
        if (created) handleBackToList();
      });
    } else if (result) {
      handleBackToList();
    }
  };

  const handleUpdateNewsletter = (id: string, data: Partial<NewsletterFormData>) => {
    const result = updateNewsletter(id, data);
    if (result instanceof Promise) {
      result.then((updated) => {
        if (updated) handleBackToList();
      });
    } else if (result) {
      handleBackToList();
    }
  };

  const handleAutoSaveNewsletter = (id: string | null, data: Partial<NewsletterFormData>) => {
    const draftOrPromise = upsertDraftNewsletter(id, data);
    
    if (draftOrPromise instanceof Promise) {
      draftOrPromise.then((draft) => {
        if (draft && (!editingNewsletter || editingNewsletter.id !== draft.id)) {
          setEditingNewsletter(draft);
        }
      });
    } else {
      const draft = draftOrPromise;
      if (draft && (!editingNewsletter || editingNewsletter.id !== draft.id)) {
        setEditingNewsletter(draft);
      }
    }

    return draftOrPromise;
  };

  const handleDeleteNewsletter = (id: string) => {
    return deleteNewsletter(id);
  };

  const handleSendNewsletterUpdate = (id: string) => {
    return sendNewsletterUpdate(id);
  };

  const handleBackToList = () => {
    setViewMode('list');
    setEditingNewsletter(null);
    setViewingNewsletter(null);
  };

  const requestLeaveEditor = (action: () => void) => {
    if (viewMode !== 'editor') {
      action();
      return;
    }

    const leaveState = editorRef.current?.prepareToLeave();
    if (leaveState?.requiresConfirmation) {
      pendingLeaveActionRef.current = action;
      setShowUnsavedDialog(true);
      return;
    }

    action();
  };

  const handleConfirmSaveAndLeave = () => {
    const wasSaved = editorRef.current?.savePublishedChanges() ?? true;
    if (!wasSaved) {
      return;
    }

    const pendingAction = pendingLeaveActionRef.current;
    pendingLeaveActionRef.current = null;
    setShowUnsavedDialog(false);
    pendingAction?.();
  };

  const handleDiscardAndLeave = () => {
    const pendingAction = pendingLeaveActionRef.current;
    pendingLeaveActionRef.current = null;
    setShowUnsavedDialog(false);
    pendingAction?.();
  };

  const renderContent = () => {
    if (activeTab === 'newsletters') {
      if (viewMode === 'editor') {
        return (
          <NewsletterEditor
            ref={editorRef}
            newsletter={editingNewsletter}
            onSave={handleSaveNewsletter}
            onUpdate={handleUpdateNewsletter}
            onAutoSave={handleAutoSaveNewsletter}
            onUploadPresentation={uploadPresentation}
            onCancel={() => requestLeaveEditor(handleBackToList)}
            isEditing={!!editingNewsletter}
          />
        );
      }

      if (viewMode === 'viewer' && activeViewingNewsletter) {
        return (
          <NewsletterViewer
            newsletter={activeViewingNewsletter}
            onBack={handleBackToList}
            currentUser={currentUser}
            onToggleLike={onToggleNewsletterLike}
            onAddComment={onAddNewsletterComment}
            onToggleCommentLike={onToggleCommentLike}
          />
        );
      }

      if (viewMode === 'viewer' && !activeViewingNewsletter) {
        return (
          <NewsletterList
            newsletters={newsletters}
            onCreate={handleCreateNewsletter}
            onEdit={handleEditNewsletter}
            onDelete={handleDeleteNewsletter}
            onSendUpdate={handleSendNewsletterUpdate}
            onView={handleViewNewsletter}
            canCreate={canCreateNewsletter(currentUserRole)}
            canEdit={(newsletter) => canEditNewsletter(currentUserRole, currentUser?.id, newsletter)}
            canDelete={() => canDeleteNewsletter(currentUserRole)}
            canSendUpdate={() => currentUserRole === 'admin'}
          />
        );
      }

      return (
        <NewsletterList
          newsletters={newsletters}
          onCreate={handleCreateNewsletter}
          onEdit={handleEditNewsletter}
          onDelete={handleDeleteNewsletter}
          onSendUpdate={handleSendNewsletterUpdate}
          onView={handleViewNewsletter}
          canCreate={canCreateNewsletter(currentUserRole)}
          canEdit={(newsletter) => canEditNewsletter(currentUserRole, currentUser?.id, newsletter)}
          canDelete={() => canDeleteNewsletter(currentUserRole)}
          canSendUpdate={() => currentUserRole === 'admin'}
        />
      );
    }

    switch (activeTab) {
      case 'projects':
        return <ProjectView />;
      case 'goals':
        return <GoalsView />;
      case 'gantt':
        return <GanttView onEditProjectGantt={onOpenGanttEditor} />;
      case 'spreadsheet':
        return <SpreadsheetView />;
      case 'links':
        return <LinksView currentUserRole={currentUserRole} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <AlertDialog
        open={showUnsavedDialog}
        onOpenChange={(open) => {
          setShowUnsavedDialog(open);
          if (!open) {
            pendingLeaveActionRef.current = null;
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('manager.unsavedTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('manager.unsavedDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                pendingLeaveActionRef.current = null;
              }}
            >
              {t('manager.keepEditing')}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#737373] hover:bg-[#525252]"
              onClick={handleDiscardAndLeave}
            >
              {t('manager.discardChanges')}
            </AlertDialogAction>
            <AlertDialogAction
              className="bg-[#D93A3A] hover:bg-[#B91C1C]"
              onClick={handleConfirmSaveAndLeave}
            >
              {t('manager.saveChanges')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Top bar */}
      <header className="sticky top-0 z-50 bg-white border-b border-[#E5E5E5]">
        <div className="flex items-center justify-between px-4 lg:px-8 h-14">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              aria-label={showMobileMenu ? t('nav.closeMenu') : t('nav.openMenu')}
              className="lg:hidden p-2 text-[#737373]"
            >
              {showMobileMenu ? <HugeiconsIcon icon={Cancel01Icon} className="w-5 h-5" /> : <HugeiconsIcon icon={Menu01Icon} className="w-5 h-5" />}
            </button>
            <button
              onClick={() => requestLeaveEditor(onHomeClick)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <img 
                src="/logo.gif" 
                alt="AI Maor Break" 
                className="w-8 h-8 object-contain"
              />
              <span className="font-bold text-[#171717]">AI-BREAK</span>
            </button>
            <span className="text-[#D4D4D4] hidden sm:inline">|</span>
            <span className="text-xs text-[#737373] uppercase tracking-wider hidden sm:inline">{t('manager.dashboard')}</span>
          </div>
          <div className="flex items-center gap-4">
            <LanguageToggleButton compact />
            <button
              onClick={() => requestLeaveEditor(onLogout)}
              className="flex items-center gap-2 text-sm text-[#737373] hover:text-red-600 transition-colors"
            >
              <HugeiconsIcon icon={Logout01Icon} className="w-4 h-4" />
              <span className="hidden sm:inline">{t('manager.logout')}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className={cn(
          showMobileMenu ? 'block' : 'hidden',
          'w-64 fixed lg:sticky top-14 h-[calc(100vh-3.5rem)] bg-white z-40 overflow-y-auto lg:block',
          isRTL ? 'right-0 border-l border-[#E5E5E5]' : 'left-0 border-r border-[#E5E5E5]',
        )}>
          <nav className="p-4 space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  requestLeaveEditor(() => {
                    onTabChange(tab.id);
                    if (tab.id !== 'newsletters') {
                      setViewMode('list');
                    }
                    setShowMobileMenu(false);
                  });
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  activeTab === tab.id
                    ? 'bg-[#D93A3A]/10 text-[#D93A3A]'
                    : 'text-[#737373] hover:bg-[#F3F4F6] hover:text-[#171717]'
                }`}
              >
                <HugeiconsIcon icon={tab.icon} className="w-5 h-5" />
                <span className="font-medium">{tab.label}</span>
              </button>
            ))}
          </nav>

          {/* Quick stats */}
          <div className="p-4 border-t border-[#E5E5E5]">
            <p className="text-xs text-[#737373] uppercase tracking-wider mb-4">{t('manager.quickStats')}</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#737373]">
                  <HugeiconsIcon icon={FileAttachmentIcon} className="w-4 h-4" />
                  <span className="text-sm">{t('manager.published')}</span>
                </div>
                <span className="font-semibold text-[#171717]">{formatNumber(publishedNewsletterCount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#737373]">
                  <HugeiconsIcon icon={UserGroupIcon} className="w-4 h-4" />
                  <span className="text-sm">{t('manager.subscribers')}</span>
                </div>
                <span className="font-semibold text-[#171717]">{subscriberCount === null ? '...' : formatNumber(subscriberCount)}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Overlay for mobile */}
        {showMobileMenu && (
          <div 
            className="fixed inset-0 bg-black/20 z-30 lg:hidden"
            onClick={() => setShowMobileMenu(false)}
          />
        )}

        {/* Main content */}
        <main className="flex-1 p-4 lg:p-8">
          {/* View content */}
          <div className="animate-in fade-in duration-300">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
}
