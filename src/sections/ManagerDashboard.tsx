import { HugeiconsIcon } from "@hugeicons/react";
import { AnalyticsUpIcon, BarChartIcon, Calendar01Icon, Cancel01Icon, FileAttachmentIcon, FileSpreadsheetIcon, Logout01Icon, Mail01Icon, Menu01Icon, Target01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { useEffect, useRef, useState } from 'react';
import { ProjectView } from './manager/ProjectView';
import { GoalsView } from './manager/GoalsView';
import { GanttView } from './manager/GanttView';
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

type Tab = 'newsletters' | 'projects' | 'goals' | 'gantt' | 'spreadsheet';
type ViewMode = 'list' | 'editor' | 'viewer';

interface ManagerDashboardProps {
  onLogout: () => void;
  onHomeClick: () => void;
  currentUser: PocketBaseUser | null;
  currentUserRole: UserRole | null;
  newsletters: Newsletter[];
  addNewsletter: (data: NewsletterFormData) => Newsletter | null;
  upsertDraftNewsletter: (id: string | null, data: Partial<NewsletterFormData>) => Newsletter | null;
  updateNewsletter: (id: string, data: Partial<NewsletterFormData>) => Newsletter | null;
  deleteNewsletter: (id: string) => boolean;
  onToggleNewsletterLike: (newsletterId: string) => void;
  onAddNewsletterComment: (newsletterId: string, body: string) => NewsletterComment | null;
  onToggleCommentLike: (newsletterId: string, commentId: string) => void;
}

export function ManagerDashboard({
  onLogout,
  onHomeClick,
  currentUser,
  currentUserRole,
  newsletters,
  addNewsletter,
  upsertDraftNewsletter,
  updateNewsletter,
  deleteNewsletter,
  onToggleNewsletterLike,
  onAddNewsletterComment,
  onToggleCommentLike,
}: ManagerDashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>('newsletters');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editingNewsletter, setEditingNewsletter] = useState<Newsletter | null>(null);
  const [viewingNewsletter, setViewingNewsletter] = useState<Newsletter | null>(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const editorRef = useRef<NewsletterEditorHandle | null>(null);
  const pendingLeaveActionRef = useRef<(() => void) | null>(null);

  const tabs = [
    { id: 'newsletters' as Tab, label: 'Newsletters', icon: FileAttachmentIcon },
    { id: 'projects' as Tab, label: 'Projects', icon: Calendar01Icon },
    { id: 'goals' as Tab, label: 'Goals', icon: Target01Icon },
    { id: 'gantt' as Tab, label: 'Gantt', icon: BarChartIcon },
    { id: 'spreadsheet' as Tab, label: 'Spreadsheet', icon: FileSpreadsheetIcon },
  ].filter((tab) => canAccessManagerTab(currentUserRole, tab.id));

  useEffect(() => {
    if (!viewingNewsletter) {
      return;
    }

    const latestViewingNewsletter = newsletters.find((newsletter) => newsletter.id === viewingNewsletter.id) ?? null;
    if (!latestViewingNewsletter) {
      setViewMode('list');
      setEditingNewsletter(null);
      setViewingNewsletter(null);
      return;
    }

    if (latestViewingNewsletter !== viewingNewsletter) {
      setViewingNewsletter(latestViewingNewsletter);
    }
  }, [newsletters, viewingNewsletter]);

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
    const created = addNewsletter(data);
    if (created) {
      handleBackToList();
    }
  };

  const handleUpdateNewsletter = (id: string, data: Partial<NewsletterFormData>) => {
    const updated = updateNewsletter(id, data);
    if (updated) {
      handleBackToList();
    }
  };

  const handleAutoSaveNewsletter = (id: string | null, data: Partial<NewsletterFormData>) => {
    const draft = upsertDraftNewsletter(id, data);
    if (draft && (!editingNewsletter || editingNewsletter.id !== draft.id)) {
      setEditingNewsletter(draft);
    }

    return draft;
  };

  const handleDeleteNewsletter = (id: string) => {
    deleteNewsletter(id);
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
            onCancel={() => requestLeaveEditor(handleBackToList)}
            isEditing={!!editingNewsletter}
          />
        );
      }

      if (viewMode === 'viewer' && viewingNewsletter) {
        return (
          <NewsletterViewer
            newsletter={viewingNewsletter}
            onBack={handleBackToList}
            currentUser={currentUser}
            onToggleLike={onToggleNewsletterLike}
            onAddComment={onAddNewsletterComment}
            onToggleCommentLike={onToggleCommentLike}
          />
        );
      }

      return (
        <NewsletterList
          newsletters={newsletters}
          onCreate={handleCreateNewsletter}
          onEdit={handleEditNewsletter}
          onDelete={handleDeleteNewsletter}
          onView={handleViewNewsletter}
          canCreate={canCreateNewsletter(currentUserRole)}
          canEdit={(newsletter) => canEditNewsletter(currentUserRole, currentUser?.id, newsletter)}
          canDelete={() => canDeleteNewsletter(currentUserRole)}
        />
      );
    }

    switch (activeTab) {
      case 'projects':
        return <ProjectView />;
      case 'goals':
        return <GoalsView />;
      case 'gantt':
        return <GanttView />;
      case 'spreadsheet':
        return <SpreadsheetView />;
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
            <AlertDialogTitle>Save published newsletter changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your changes to this published newsletter are not saved yet. Save them before leaving, or discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                pendingLeaveActionRef.current = null;
              }}
            >
              Keep Editing
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#737373] hover:bg-[#525252]"
              onClick={handleDiscardAndLeave}
            >
              Discard Changes
            </AlertDialogAction>
            <AlertDialogAction
              className="bg-[#D93A3A] hover:bg-[#B91C1C]"
              onClick={handleConfirmSaveAndLeave}
            >
              Save Changes
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
            <span className="text-xs text-[#737373] uppercase tracking-wider hidden sm:inline">Manager Dashboard</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => requestLeaveEditor(onLogout)}
              className="flex items-center gap-2 text-sm text-[#737373] hover:text-red-600 transition-colors"
            >
              <HugeiconsIcon icon={Logout01Icon} className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className={`${showMobileMenu ? 'block' : 'hidden'} lg:block w-64 fixed lg:sticky top-14 left-0 h-[calc(100vh-3.5rem)] bg-white border-r border-[#E5E5E5] z-40 overflow-y-auto`}>
          <nav className="p-4 space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  requestLeaveEditor(() => {
                    setActiveTab(tab.id);
                    setViewMode('list');
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
            <p className="text-xs text-[#737373] uppercase tracking-wider mb-4">Quick Stats</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#737373]">
                  <HugeiconsIcon icon={FileAttachmentIcon} className="w-4 h-4" />
                  <span className="text-sm">Newsletters</span>
                </div>
                <span className="font-semibold text-[#171717]">{newsletters.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#737373]">
                  <HugeiconsIcon icon={UserGroupIcon} className="w-4 h-4" />
                  <span className="text-sm">Subscribers</span>
                </div>
                <span className="font-semibold text-[#171717]">12,450</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#737373]">
                  <HugeiconsIcon icon={Mail01Icon} className="w-4 h-4" />
                  <span className="text-sm">Open Rate</span>
                </div>
                <span className="font-semibold text-[#D93A3A]">38.5%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#737373]">
                  <HugeiconsIcon icon={AnalyticsUpIcon} className="w-4 h-4" />
                  <span className="text-sm">Growth</span>
                </div>
                <span className="font-semibold text-green-600">+15%</span>
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
