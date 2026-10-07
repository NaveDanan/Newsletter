import { HugeiconsIcon } from "@hugeicons/react";
import { BarChartIcon, Calendar01Icon, FileAttachmentIcon, FileSpreadsheetIcon, Link01Icon, Shield01Icon, Target01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { useEffect, useRef, useState } from 'react';
import { ManagerHeader } from '@/components/ManagerHeader';
import { AppStageShell } from '@/components/AppStageShell';
import { useLocale } from '@/contexts/LocaleContext';
import { useSubscriberCount } from '@/hooks/useSubscriberCount';
import { cn } from '@/lib/utils';
import { NewsletterList } from './manager/NewsletterList';
import type { NewsletterEditorHandle } from './manager/NewsletterEditor';
import { lazyComponent } from '@/lib/lazy-component';
import { prefetchNewsletter } from '@/lib/pocketbase/newsletters';
import { prefetchProjects } from '@/lib/pocketbase/projects';
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

const ProjectView = lazyComponent(() => import('./manager/ProjectView').then((module) => ({ default: module.ProjectView })));
const GoalsView = lazyComponent(() => import('./manager/GoalsView').then((module) => ({ default: module.GoalsView })));
const GanttView = lazyComponent(() => import('./manager/GanttView').then((module) => ({ default: module.GanttView })));
const LinksView = lazyComponent(() => import('./manager/LinksView').then((module) => ({ default: module.LinksView })));
const SpreadsheetView = lazyComponent(() => import('./manager/SpreadsheetView').then((module) => ({ default: module.SpreadsheetView })));
const ScheduledView = lazyComponent(() => import('./manager/ScheduledView').then((module) => ({ default: module.ScheduledView })));
const CommunityModerationView = lazyComponent(() => import('./manager/CommunityModerationView').then((module) => ({ default: module.CommunityModerationView })));
const NewsletterEditor = lazyComponent(() => import('./manager/NewsletterEditor').then((module) => ({ default: module.NewsletterEditor })));
const NewsletterViewer = lazyComponent(() => import('./NewsletterViewer').then((module) => ({ default: module.NewsletterViewer })));

const tabComponents = { projects: ProjectView, goals: GoalsView, gantt: GanttView, spreadsheet: SpreadsheetView, links: LinksView, scheduled: ScheduledView, community: CommunityModerationView };
function prepareTab(tab: Tab) {
  if (tab !== 'newsletters') tabComponents[tab].preload();
  if (tab === 'projects' || tab === 'goals' || tab === 'gantt' || tab === 'spreadsheet') prefetchProjects();
}

export type Tab = 'newsletters' | 'projects' | 'goals' | 'gantt' | 'spreadsheet' | 'links' | 'scheduled' | 'community';
type ViewMode = 'list' | 'editor' | 'viewer';

interface ManagerDashboardProps {
  hasNewsletterList?: boolean;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onOpenGanttEditor: (projectId: string) => void;
  onProfileClick: () => void;
  onLogout: () => void;
  onHomeClick: () => void;
  onCommunityClick: () => void;
  onCreateClick: () => void;
  currentUser: PocketBaseUser | null;
  currentUserRole: UserRole | null;
  newsletters: Newsletter[];
  loadNewsletter: (id: string) => Promise<Newsletter | null>;
  addNewsletter: (data: NewsletterFormData) => Promise<Newsletter | null> | Newsletter | null;
  upsertDraftNewsletter: (id: string | null, data: Partial<NewsletterFormData>) => Promise<Newsletter | null> | Newsletter | null;
  updateNewsletter: (id: string, data: Partial<NewsletterFormData>) => Promise<Newsletter | null> | Newsletter | null;
  uploadPresentation: (id: string, file: File) => Promise<{ newsletter: Newsletter; url: string; fileName: string; previewUrls?: string[]; previewStatus?: 'ready' | 'failed'; previewError?: string } | null> | { newsletter: Newsletter; url: string; fileName: string; previewUrls?: string[]; previewStatus?: 'ready' | 'failed'; previewError?: string } | null;
  deleteNewsletter: (id: string) => Promise<boolean> | boolean;
  sendNewsletterUpdate: (id: string) => Promise<number | null> | number | null;
  onToggleNewsletterLike: (newsletterId: string) => void;
  onAddNewsletterComment: (newsletterId: string, body: string) => Promise<NewsletterComment | null> | NewsletterComment | null;
  onToggleCommentLike: (newsletterId: string, commentId: string) => void;
  onVoteNewsletterPoll?: (newsletterId: string, optionId: string) => void;
  onRsvpNewsletterEvent?: (newsletterId: string) => void;
}

export function ManagerDashboard({
  activeTab,
  onTabChange,
  onOpenGanttEditor,
  onProfileClick,
  onLogout,
  onHomeClick,
  onCommunityClick,
  onCreateClick,
  currentUser,
  currentUserRole,
  newsletters,
  hasNewsletterList = false,
  loadNewsletter,
  addNewsletter,
  upsertDraftNewsletter,
  updateNewsletter,
  uploadPresentation,
  deleteNewsletter,
  sendNewsletterUpdate,
  onToggleNewsletterLike,
  onAddNewsletterComment,
  onToggleCommentLike,
  onVoteNewsletterPoll,
  onRsvpNewsletterEvent,
}: ManagerDashboardProps) {
  const { formatNumber, isRTL, t } = useLocale();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const { subscriberCount, publishedNewsletterCount: statsPublishedCount } = useSubscriberCount();
  const [editingNewsletter, setEditingNewsletter] = useState<Newsletter | null>(null);
  const [viewingNewsletter, setViewingNewsletter] = useState<Newsletter | null>(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [isSavingBeforeLeave, setIsSavingBeforeLeave] = useState(false);
  const editorRef = useRef<NewsletterEditorHandle | null>(null);
  const pendingLeaveActionRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(false);
  const openRequestRef = useRef(0);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      pendingLeaveActionRef.current = null;
    };
  }, []);
  const activeViewingNewsletter = viewingNewsletter
    ? newsletters.find((newsletter) => newsletter.id === viewingNewsletter.id) ?? null
    : null;
  const viewingId = activeViewingNewsletter?.id;
  const viewingVersion = activeViewingNewsletter?.updatedAt;
  const viewingIsSummary = activeViewingNewsletter?.contentLoaded === false;
  useEffect(() => {
    if (viewMode !== 'viewer' || !viewingId || !viewingIsSummary) return;
    let cancelled = false;
    void loadNewsletter(viewingId).then((full) => { if (full && !cancelled) setViewingNewsletter(full); });
    return () => { cancelled = true; };
  }, [loadNewsletter, viewMode, viewingId, viewingIsSummary, viewingVersion]);
  const publishedNewsletterCount = hasNewsletterList
    ? newsletters.filter((newsletter) => newsletter.status === 'published').length
    : statsPublishedCount ?? newsletters.filter((newsletter) => newsletter.status === 'published').length;

  const tabs = [
    { id: 'newsletters' as Tab, label: t('manager.newsletters'), icon: FileAttachmentIcon },
    { id: 'projects' as Tab, label: t('manager.projects'), icon: Calendar01Icon },
    { id: 'goals' as Tab, label: t('manager.goals'), icon: Target01Icon },
    { id: 'gantt' as Tab, label: t('manager.gantt'), icon: BarChartIcon },
    { id: 'spreadsheet' as Tab, label: t('manager.spreadsheet'), icon: FileSpreadsheetIcon },
    { id: 'links' as Tab, label: t('manager.links'), icon: Link01Icon },
    { id: 'scheduled' as Tab, label: t('manager.scheduled'), icon: Calendar01Icon },
    { id: 'community' as Tab, label: t('manager.community'), icon: Shield01Icon },
  ].filter((tab) => canAccessManagerTab(currentUserRole, tab.id));

  const handleCreateNewsletter = () => {
    if (!canCreateNewsletter(currentUserRole)) {
      return;
    }

    openRequestRef.current++;
    NewsletterEditor.preload();
    setEditingNewsletter(null);
    setViewMode('editor');
  };

  const handleEditNewsletter = async (newsletter: Newsletter) => {
    const request = ++openRequestRef.current;
    NewsletterEditor.preload();
    if (newsletter.contentLoaded === false) {
      const full = await loadNewsletter(newsletter.id);
      if (full && isMountedRef.current && request === openRequestRef.current) { setEditingNewsletter(full); setViewMode('editor'); }
      return;
    }
    setEditingNewsletter(newsletter);
    setViewMode('editor');
  };

  const handleViewNewsletter = async (newsletter: Newsletter) => {
    const request = ++openRequestRef.current;
    NewsletterViewer.preload();
    if (newsletter.contentLoaded === false) {
      const full = await loadNewsletter(newsletter.id);
      if (full && isMountedRef.current && request === openRequestRef.current) { setViewingNewsletter(full); setViewMode('viewer'); }
      return;
    }
    setViewingNewsletter(newsletter);
    setViewMode('viewer');
  };

  const handleSaveNewsletter = async (data: NewsletterFormData) => {
    const created = await addNewsletter(data);
    if (created && isMountedRef.current) handleBackToList();
    return created;
  };

  const handleUpdateNewsletter = async (id: string, data: Partial<NewsletterFormData>) => {
    const updated = await updateNewsletter(id, data);
    if (updated && isMountedRef.current) handleBackToList();
    return updated;
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

  const handleTogglePublish = (newsletter: Newsletter) => {
    const nextStatus = newsletter.status === 'published' ? 'draft' : 'published';
    const patchData: Partial<NewsletterFormData> = {
      status: nextStatus,
    };
    if (nextStatus === 'published' && (!newsletter.publishedAt || newsletter.publishedAt === '-')) {
      patchData.publishedAt = new Date().toISOString().split('T')[0];
    }
    return updateNewsletter(newsletter.id, patchData);
  };

  const handleBackToList = () => {
    openRequestRef.current++;
    setViewMode('list');
    setEditingNewsletter(null);
    setViewingNewsletter(null);
  };

  const requestLeaveEditor = (action: () => void) => {
    if (isSavingBeforeLeave) return;
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

  const handleConfirmSaveAndLeave = async () => {
    const pendingAction = pendingLeaveActionRef.current;
    if (!pendingAction || isSavingBeforeLeave) return;
    setIsSavingBeforeLeave(true);
    try {
      const wasSaved = await editorRef.current?.savePublishedChanges();
      if (!wasSaved || !isMountedRef.current || pendingLeaveActionRef.current !== pendingAction) return;
      pendingLeaveActionRef.current = null;
      setShowUnsavedDialog(false);
      pendingAction();
    } finally {
      if (isMountedRef.current) setIsSavingBeforeLeave(false);
    }
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
            onVotePoll={onVoteNewsletterPoll}
            onRsvpEvent={onRsvpNewsletterEvent}
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
            onEditIntent={(newsletter) => { NewsletterEditor.preload(); prefetchNewsletter(newsletter.id); }}
            onViewIntent={(newsletter) => { NewsletterViewer.preload(); prefetchNewsletter(newsletter.id); }}
            onTogglePublish={handleTogglePublish}
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
          onEditIntent={(newsletter) => { NewsletterEditor.preload(); prefetchNewsletter(newsletter.id); }}
          onViewIntent={(newsletter) => { NewsletterViewer.preload(); prefetchNewsletter(newsletter.id); }}
          onTogglePublish={handleTogglePublish}
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
      case 'scheduled':
        return <ScheduledView currentUserRole={currentUserRole} />;
      case 'community':
        return <CommunityModerationView currentUserRole={currentUserRole} />;
      default:
        return null;
    }
  };

  const dashboard = (
    <div className="manager-dashboard min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] transition-colors">
      <AlertDialog
        open={showUnsavedDialog}
        onOpenChange={(open) => {
          if (isSavingBeforeLeave && !open) return;
          setShowUnsavedDialog(open);
          if (!open) {
            pendingLeaveActionRef.current = null;
          }
        }}
      >
        <AlertDialogContent className="bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-primary)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[var(--text-primary)]">{t('manager.unsavedTitle')}</AlertDialogTitle>
            <AlertDialogDescription className="text-[var(--text-secondary)]">
              {t('manager.unsavedDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="bg-[var(--bg-pill)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-[var(--bg-pill-hover)]"
              disabled={isSavingBeforeLeave}
              onClick={() => {
                pendingLeaveActionRef.current = null;
              }}
            >
              {t('manager.keepEditing')}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-[var(--bg-pill)] text-[var(--text-secondary)] hover:bg-[var(--bg-pill-hover)] hover:text-[var(--text-primary)]"
              onClick={handleDiscardAndLeave}
              disabled={isSavingBeforeLeave}
            >
              {t('manager.discardChanges')}
            </AlertDialogAction>
            <AlertDialogAction
              className="btn-hire-me"
              disabled={isSavingBeforeLeave}
              onClick={(event) => {
                event.preventDefault();
                return handleConfirmSaveAndLeave();
              }}
            >
              {t('manager.saveChanges')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ManagerHeader
        title={t('manager.dashboard')}
        onHomeClick={onHomeClick}
        onProfileClick={onProfileClick}
        onManagerClick={onHomeClick}
        onSignOut={onLogout}
        onNavigate={requestLeaveEditor}
        onToggleMenu={() => setShowMobileMenu(!showMobileMenu)}
        menuOpen={showMobileMenu}
        showManagerItem={false}
      />

      <div className="flex">
        {/* Sidebar */}
        <aside className={cn(
          showMobileMenu ? 'block' : 'hidden',
          'w-64 fixed lg:sticky top-16 h-[calc(100vh-4rem)] bg-[var(--bg-card)] border-[var(--border-subtle)] z-40 overflow-y-auto lg:block shadow-lg lg:shadow-none',
          isRTL ? 'right-0 border-l' : 'left-0 border-r',
        )}>
          <nav className="p-4 space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onPointerEnter={() => prepareTab(tab.id)}
                onFocus={() => prepareTab(tab.id)}
                onClick={() => {
                  requestLeaveEditor(() => {
                    onTabChange(tab.id);
                    if (tab.id !== 'newsletters') {
                      setViewMode('list');
                    }
                    setShowMobileMenu(false);
                  });
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'bg-[var(--primary-accent)]/15 text-[var(--primary-accent)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-pill-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                <HugeiconsIcon icon={tab.icon} className="w-5 h-5 shrink-0" />
                <span className="truncate">{tab.label}</span>
              </button>
            ))}
          </nav>

          {/* Quick stats */}
          <div className="p-4 border-t border-[var(--border-subtle)]">
            <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3">{t('manager.quickStats')}</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <HugeiconsIcon icon={FileAttachmentIcon} className="w-4 h-4 text-[var(--primary-accent)]" />
                  <span>{t('manager.published')}</span>
                </div>
                <span className="font-bold text-sm text-[var(--text-primary)]">{formatNumber(publishedNewsletterCount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <HugeiconsIcon icon={UserGroupIcon} className="w-4 h-4 text-[var(--primary-accent)]" />
                  <span>{t('manager.subscribers')}</span>
                </div>
                <span className="font-bold text-sm text-[var(--text-primary)]">{subscriberCount === null ? '...' : formatNumber(subscriberCount)}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Overlay for mobile */}
        {showMobileMenu && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-30 lg:hidden"
            onClick={() => setShowMobileMenu(false)}
          />
        )}

        {/* Main content */}
        <main className="min-w-0 flex-1 p-4 lg:p-8">
          {/* View content */}
          <div className="min-w-0" data-manager-tab={activeTab}>
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );

  return (
    <AppStageShell
      activeTab="manager"
      onHomeClick={onHomeClick}
      onCommunityClick={onCommunityClick}
      onCreateClick={onCreateClick}
      onProfileClick={onProfileClick}
      onNavigate={requestLeaveEditor}
      user={currentUser}
    >
      {dashboard}
    </AppStageShell>
  );
}
