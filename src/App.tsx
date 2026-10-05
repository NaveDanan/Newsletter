import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Navigation } from './components/Navigation';
import { HeroBanner } from './sections/HeroBanner';
import { PopularArticles } from './sections/PopularArticles';
import { LatestArticles } from './sections/LatestArticles';
import { OurWriters } from './sections/OurWriters';
import { Sidebar } from './sections/Sidebar';
import { ManagerDashboard, type Tab as ManagerTab } from './sections/ManagerDashboard';
import { GanttEditorPage } from './sections/manager/GanttEditorPage';
import { NewsletterViewer } from './sections/NewsletterViewer';
import { ProfilePage } from './sections/ProfilePage';
import { UnsubscribePage } from './sections/UnsubscribePage';
import { PasswordResetPage } from './components/auth/PasswordResetPage';
import { VerifyEmailPage } from './components/auth/VerifyEmailPage';
import { SignIn } from './components/auth/SignIn';
import { SSOCallback } from './components/auth/SSOCallback';
import { MigratePage } from './sections/MigratePage';
import { CommunityPage } from './sections/community/CommunityPage';
import { useAuth } from './contexts/AuthContext';
import { useLocale } from './contexts/LocaleContext';
import { useNewsletters } from './hooks/useNewsletters';
import { canAccessManagerTab, hasManagerAccess } from './lib/auth/permissions';
import { parseCommunityRoute } from './lib/community-routes';
import { bootLogger } from './lib/bootLogger';
import { AppStageShell } from './components/AppStageShell';
import { QuickComposeCard } from './components/QuickComposeCard';
import { Toaster } from 'sonner';
import { toast } from 'sonner';
import type { Newsletter } from './types/newsletter';
import './App.css';

export type View = 'home' | 'manager' | 'article' | 'signin' | 'reset-password' | 'verify-email' | 'sso-callback' | 'gantt-editor' | 'migrate' | 'unsubscribe' | 'community' | 'profile';

const managerSections: ManagerTab[] = ['newsletters', 'projects', 'goals', 'gantt', 'spreadsheet', 'links', 'scheduled', 'community'];

interface RouteState {
  view: View;
  pathname: string;
  articleId?: string;
  managerSection?: ManagerTab;
  projectId?: string;
  token?: string;
}

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getArticlePath(newsletter: Newsletter): string {
  return `/article/${encodeURIComponent(newsletter.id)}/${slugify(newsletter.title)}`;
}

function normalizeSearchValue(value: string): string {
  return value
    .replace(/<img\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function matchesNewsletterSearch(newsletter: Newsletter, query: string): boolean {
  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) {
    return true;
  }

  const searchableText = normalizeSearchValue([
    newsletter.title,
    newsletter.subtitle,
    newsletter.excerpt,
    newsletter.author,
    newsletter.tags.join(' '),
    newsletter.content,
  ].join(' '));

  return normalizedQuery
    .split(' ')
    .every((term) => searchableText.includes(term));
}

function isManagerSection(value: string): value is ManagerTab {
  return managerSections.includes(value as ManagerTab);
}

function resolveRoute(pathname: string): RouteState {
  const normalizedPathname = normalizePathname(pathname);

  if (normalizedPathname === '/') {
    return { view: 'home', pathname: '/' };
  }

  if (normalizedPathname === '/manager') {
    return { view: 'manager', pathname: '/manager', managerSection: 'newsletters' };
  }

  if (normalizedPathname.startsWith('/manager/')) {
    const [, , section] = normalizedPathname.split('/');

    if (section && isManagerSection(section)) {
      return {
        view: 'manager',
        pathname: section === 'newsletters' ? '/manager' : `/manager/${section}`,
        managerSection: section,
      };
    }
  }

  if (normalizedPathname === '/gantt-editor') {
    return { view: 'manager', pathname: '/manager/gantt', managerSection: 'gantt' };
  }

  if (normalizedPathname.startsWith('/gantt-editor/')) {
    const [, , projectId] = normalizedPathname.split('/');

    if (projectId) {
      return {
        view: 'gantt-editor',
        pathname: `/gantt-editor/${projectId}`,
        projectId: decodeURIComponent(projectId),
      };
    }
  }

  if (normalizedPathname === '/profile') {
    return { view: 'profile', pathname: '/profile' };
  }

  if (normalizedPathname === '/migrate') {
    return { view: 'migrate', pathname: '/migrate' };
  }

  if (normalizedPathname === '/sign-in' || normalizedPathname === '/signin') {
    return { view: 'signin', pathname: '/sign-in' };
  }

  if (normalizedPathname.startsWith('/reset-password/')) {
    const [, , token] = normalizedPathname.split('/');

    if (token) {
      return {
        view: 'reset-password',
        pathname: normalizedPathname,
        token: decodeURIComponent(token),
      };
    }
  }

  if (normalizedPathname.startsWith('/verify-email/')) {
    const [, , token] = normalizedPathname.split('/');

    if (token) {
      return {
        view: 'verify-email',
        pathname: normalizedPathname,
        token: decodeURIComponent(token),
      };
    }
  }

  if (normalizedPathname === '/sso-callback') {
    return { view: 'sso-callback', pathname: '/sso-callback' };
  }

  if (normalizedPathname === '/unsubscribe') {
    return { view: 'unsubscribe', pathname: '/unsubscribe' };
  }

  // parseCommunityRoute owns every /community sub-path and returns the canonical
  // spelling of it, so App records only that the branch was taken and lets
  // CommunityPage read the rest of the state back out of the pathname.
  const communityRoute = parseCommunityRoute(normalizedPathname);

  if (communityRoute) {
    return { view: 'community', pathname: communityRoute.pathname };
  }

  if (normalizedPathname.startsWith('/article/')) {
    const [, , articleId] = normalizedPathname.split('/');

    if (articleId) {
      return {
        view: 'article',
        pathname: normalizedPathname,
        articleId: decodeURIComponent(articleId),
      };
    }
  }

  return { view: 'home', pathname: '/' };
}

function subscribeToRouteChanges(callback: () => void) {
  window.addEventListener('popstate', callback);
  window.addEventListener('app:navigate', callback);

  return () => {
    window.removeEventListener('popstate', callback);
    window.removeEventListener('app:navigate', callback);
  };
}

function getCurrentPathnameSnapshot() {
  return normalizePathname(window.location.pathname);
}

function App() {
  const { isRTL, t } = useLocale();
  const {
    isAuthenticated: isUserAuthenticated,
    isLoading: isAuthLoading,
    logout: handleUserLogout,
    user,
  } = useAuth();
  const currentPathname = useSyncExternalStore(
    subscribeToRouteChanges,
    getCurrentPathnameSnapshot,
    () => '/',
  );
  const currentRoute = useMemo(() => resolveRoute(currentPathname), [currentPathname]);
  const userRole = user?.role ?? null;
  const {
    newsletters,
    isLoaded: areNewslettersLoaded,
    refreshNewsletters,
    addNewsletter,
    upsertDraftNewsletter,
    updateNewsletter,
    uploadPresentation,
    deleteNewsletter,
    sendNewsletterUpdate,
    toggleNewsletterLike,
    addNewsletterComment,
    toggleCommentLike,
    toggleBookmark,
    voteNewsletterPoll,
    rsvpNewsletterEvent,
  } = useNewsletters({
    currentUser: user,
    currentUserRole: userRole,
    enabled: currentRoute.view !== 'migrate' && currentRoute.view !== 'community',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const managerToastRouteRef = useRef<string | null>(null);
  const appReadyRef = useRef(false);
  const toasterPosition = isRTL ? 'top-left' : 'top-right';
  const publishedNewsletters = newsletters
    .filter((newsletter) => newsletter.status === 'published')
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const trimmedSearchQuery = searchQuery.trim();
  const filteredNewsletters = trimmedSearchQuery
    ? publishedNewsletters.filter((newsletter) => matchesNewsletterSearch(newsletter, trimmedSearchQuery))
    : publishedNewsletters;
  const isSearchActive = trimmedSearchQuery.length > 0;
  const selectedArticle = useMemo(() => (
    currentRoute.view === 'article' && currentRoute.articleId
      ? newsletters.find((newsletter) => newsletter.id === currentRoute.articleId) ?? null
      : null
  ), [currentRoute.articleId, currentRoute.view, newsletters]);

  const navigateTo = useCallback((pathname: string, { replace = false }: { replace?: boolean } = {}) => {
    const nextRoute = resolveRoute(pathname);
    const historyMethod = replace ? 'replaceState' : 'pushState';

    bootLogger.step('router', 'Navigation requested', {
      from: window.location.pathname,
      to: nextRoute.pathname,
      replace,
    });

    // Pushed entries are tagged so a page's Back button can tell whether
    // history.back() would stay inside the app.
    window.history[historyMethod](replace ? window.history.state : { appNavigation: true }, '', nextRoute.pathname);
    window.dispatchEvent(new Event('app:navigate'));
  }, []);

  useEffect(() => {
    bootLogger.once('app:mounted', () => {
      bootLogger.step('app', 'App component mounted');
    });
  }, []);

  useEffect(() => {
    bootLogger.step('router', 'Resolved current route', {
      pathname: currentRoute.pathname,
      view: currentRoute.view,
      articleId: currentRoute.articleId,
      managerSection: currentRoute.managerSection,
      projectId: currentRoute.projectId,
      token: currentRoute.token,
    });
  }, [currentRoute.articleId, currentRoute.managerSection, currentRoute.pathname, currentRoute.projectId, currentRoute.token, currentRoute.view]);

  useEffect(() => {
    if (currentRoute.view !== 'article' || !currentRoute.articleId) {
      return;
    }

    if (!selectedArticle) {
      if (areNewslettersLoaded) {
        bootLogger.warn('router', 'Requested article was not found after newsletters loaded, redirecting home', {
          articleId: currentRoute.articleId,
        });
        navigateTo('/', { replace: true });
      }
      return;
    }

    const canonicalArticlePath = getArticlePath(selectedArticle);
    if (window.location.pathname !== canonicalArticlePath) {
      bootLogger.step('router', 'Replacing article URL with canonical path', {
        from: window.location.pathname,
        to: canonicalArticlePath,
      });
      window.history.replaceState({}, '', canonicalArticlePath);
      window.dispatchEvent(new Event('app:navigate'));
    }
  }, [areNewslettersLoaded, currentRoute.articleId, currentRoute.view, navigateTo, selectedArticle]);

  useEffect(() => {
    const isManagerRoute = currentRoute.view === 'manager' || currentRoute.view === 'gantt-editor';

    if (!isManagerRoute || isAuthLoading) {
      if (!isManagerRoute) {
        managerToastRouteRef.current = null;
      }
      return;
    }

    if (!isUserAuthenticated) {
      bootLogger.warn('router', 'Manager route requires authentication, redirecting to sign-in', {
        pathname: currentRoute.pathname,
      });
      navigateTo('/sign-in', { replace: true });
      return;
    }

    if (!hasManagerAccess(userRole)) {
      bootLogger.warn('router', 'Manager route denied due to insufficient role, redirecting home', {
        pathname: currentRoute.pathname,
        role: userRole,
      });
      if (managerToastRouteRef.current !== currentRoute.pathname) {
        toast.error(t('app.managerAccessDenied'));
        managerToastRouteRef.current = currentRoute.pathname;
      }
      navigateTo('/', { replace: true });
      return;
    }

    if (
      currentRoute.view === 'manager'
      && currentRoute.managerSection
      && !canAccessManagerTab(userRole, currentRoute.managerSection)
    ) {
      bootLogger.warn('router', 'Manager subsection denied for current role, redirecting to default manager view', {
        section: currentRoute.managerSection,
        role: userRole,
      });
      navigateTo('/manager', { replace: true });
      return;
    }

    managerToastRouteRef.current = null;
  }, [currentRoute.managerSection, currentRoute.pathname, currentRoute.view, isAuthLoading, isUserAuthenticated, navigateTo, t, userRole]);

  // The profile route is signed-in only; kept separate from the manager guard,
  // whose early return keys off isManagerRoute.
  useEffect(() => {
    if (currentRoute.view !== 'profile' || isAuthLoading || isUserAuthenticated) {
      return;
    }

    bootLogger.warn('router', 'Profile route requires authentication, redirecting to sign-in', {
      pathname: currentRoute.pathname,
    });
    navigateTo('/sign-in', { replace: true });
  }, [currentRoute.pathname, currentRoute.view, isAuthLoading, isUserAuthenticated, navigateTo]);

  useEffect(() => {
    if (appReadyRef.current) {
      return;
    }

    if (currentRoute.view === 'manager' || currentRoute.view === 'gantt-editor') {
      if (isAuthLoading) {
        return;
      }

      if (!isUserAuthenticated || !hasManagerAccess(userRole)) {
        return;
      }

      appReadyRef.current = true;
      bootLogger.markReady('app', 'Manager screen is ready', {
        pathname: currentRoute.pathname,
        role: userRole,
      });
      return;
    }

    if (currentRoute.view === 'article') {
      if (!areNewslettersLoaded) {
        return;
      }

      appReadyRef.current = true;
      bootLogger.markReady('app', selectedArticle ? 'Article view is ready' : 'Article lookup completed', {
        pathname: currentRoute.pathname,
        articleId: currentRoute.articleId,
        articleFound: Boolean(selectedArticle),
      });
      return;
    }

    if (currentRoute.view === 'profile') {
      if (isAuthLoading) {
        return;
      }

      appReadyRef.current = true;
      bootLogger.markReady('app', 'Profile screen is ready', {
        pathname: currentRoute.pathname,
      });
      return;
    }

    if (currentRoute.view === 'signin' || currentRoute.view === 'reset-password' || currentRoute.view === 'verify-email' || currentRoute.view === 'sso-callback' || currentRoute.view === 'migrate' || currentRoute.view === 'unsubscribe' || currentRoute.view === 'community') {
      appReadyRef.current = true;
      bootLogger.markReady('app', 'Standalone route is ready', {
        pathname: currentRoute.pathname,
        view: currentRoute.view,
      });
      return;
    }

    if (!areNewslettersLoaded) {
      return;
    }

    appReadyRef.current = true;
    bootLogger.markReady('app', 'Home screen is ready', {
      pathname: currentRoute.pathname,
      publishedCount: publishedNewsletters.length,
    });
  }, [areNewslettersLoaded, currentRoute.articleId, currentRoute.pathname, currentRoute.view, isAuthLoading, isUserAuthenticated, publishedNewsletters.length, selectedArticle, userRole]);

  const handleManagerClick = () => {
    navigateTo('/manager');
  };

  const handleManagerTabChange = useCallback((tab: ManagerTab) => {
    if (tab === 'newsletters') void refreshNewsletters();
    navigateTo(tab === 'newsletters' ? '/manager' : `/manager/${tab}`);
  }, [navigateTo, refreshNewsletters]);

  const handleOpenGanttEditor = useCallback((projectId: string) => {
    navigateTo(`/gantt-editor/${encodeURIComponent(projectId)}`);
  }, [navigateTo]);

  const handleArticleClick = (article: Newsletter) => {
    navigateTo(getArticlePath(article));
  };

  const handleBackToHome = () => {
    setSearchQuery('');
    navigateTo('/');
  };

  const handleHomeClick = () => {
    setSearchQuery('');
    navigateTo('/');
  };

  const handleSignInClick = () => {
    navigateTo('/sign-in');
  };

  const handleCommunityClick = () => {
    navigateTo('/community');
  };

  // Posts are only ever created in the community, so the home card routes there.
  const handleQuickCompose = (files?: File[]) => {
    navigateTo('/community');
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('community:compose', { detail: { files } }));
    }, 0);
  };

  const handleRequireAuth = () => {
    toast.error(t('app.authRequiredDiscussion'));
    navigateTo('/sign-in');
  };

  // The mobile "+" opens the dashboard for managers and the community
  // composer for everyone else, who would otherwise bounce off the manager guard.
  const handleCreateClick = () => {
    if (!isUserAuthenticated) {
      handleSignInClick();
      return;
    }
    if (hasManagerAccess(userRole)) {
      handleManagerClick();
      return;
    }
    handleQuickCompose();
  };

  const handleAuthSuccess = () => {
    navigateTo('/', { replace: true });
  };

  const handlePasswordResetSuccess = () => {
    navigateTo('/sign-in', { replace: true });
  };

  const handleProfileClick = () => {
    if (currentRoute.view === 'community') {
      navigateTo('/community/profile');
    } else {
      navigateTo('/profile');
    }
  };

  // The profile page is reached from both the site and the community, so Back
  // returns to wherever the user came from when that was inside the app.
  const handleProfileBack = () => {
    const state: unknown = window.history.state;
    if (state && typeof state === 'object' && 'appNavigation' in state) {
      window.history.back();
    } else {
      handleHomeClick();
    }
  };

  const handleSignOut = () => {
    handleUserLogout();
    navigateTo('/', { replace: true });
  };

  const handleArticleLike = (newsletterId: string) => {
    if (!isUserAuthenticated) {
      handleRequireAuth();
      return;
    }

    toggleNewsletterLike(newsletterId);
  };

  const handleArticleComment = (newsletterId: string, body: string) => {
    if (!isUserAuthenticated) {
      handleRequireAuth();
      return null;
    }

    return addNewsletterComment(newsletterId, body);
  };

  const handleCommentLike = (newsletterId: string, commentId: string) => {
    if (!isUserAuthenticated) {
      handleRequireAuth();
      return;
    }

    toggleCommentLike(newsletterId, commentId);
  };

  const handleToggleBookmark = (newsletterId: string) => {
    if (!isUserAuthenticated) {
      handleRequireAuth();
      return;
    }

    toggleBookmark(newsletterId);
  };

  const handleVotePoll = (newsletterId: string, optionId: string) => {
    if (!isUserAuthenticated) {
      handleRequireAuth();
      return;
    }

    voteNewsletterPoll(newsletterId, optionId);
  };

  const handleRsvpEvent = (newsletterId: string) => {
    if (!isUserAuthenticated) {
      handleRequireAuth();
      return;
    }

    rsvpNewsletterEvent(newsletterId);
  };

  // Render article view
  if (currentRoute.view === 'article' && selectedArticle) {
    return (
      <AppStageShell
        activeTab="home"
        onHomeClick={handleHomeClick}
        onCommunityClick={handleCommunityClick}
        onCreateClick={handleCreateClick}
        onProfileClick={handleProfileClick}
        user={user}
      >
        <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] transition-colors">
          <Toaster position={toasterPosition} richColors />
          <NewsletterViewer
            newsletter={selectedArticle}
            currentUser={user}
            onBack={handleBackToHome}
            onRequireAuth={handleRequireAuth}
            onToggleLike={handleArticleLike}
            onAddComment={handleArticleComment}
            onToggleCommentLike={handleCommentLike}
            isBookmarked={Boolean(user?.id && selectedArticle.bookmarkedByUserIds.includes(user.id))}
            onToggleBookmark={handleToggleBookmark}
            onVotePoll={handleVotePoll}
            onRsvpEvent={handleRsvpEvent}
          />
        </div>
      </AppStageShell>
    );
  }

  if (currentRoute.view === 'article') {
    return (
      <AppStageShell
        activeTab="home"
        onHomeClick={handleHomeClick}
        onCommunityClick={handleCommunityClick}
        onCreateClick={handleCreateClick}
        onProfileClick={handleProfileClick}
        user={user}
      >
        <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] flex items-center justify-center">
          <Toaster position={toasterPosition} richColors />
          <div className="text-sm font-semibold text-[var(--text-secondary)]">
            {t('app.loadingArticle')}
          </div>
        </div>
      </AppStageShell>
    );
  }

  // Render manager dashboard and manager-only editor
  if (currentRoute.view === 'manager' || currentRoute.view === 'gantt-editor') {
    if (isAuthLoading) {
      return (
        <AppStageShell
          activeTab="manager"
          onHomeClick={handleHomeClick}
          onCommunityClick={handleCommunityClick}
          onCreateClick={handleCreateClick}
          onProfileClick={handleProfileClick}
          user={user}
        >
          <div className="min-h-screen bg-[var(--bg-app)] flex items-center justify-center">
            <Toaster position={toasterPosition} richColors />
            <div className="text-sm font-semibold text-[var(--text-secondary)]">
              {t('app.loadingManager')}
            </div>
          </div>
        </AppStageShell>
      );
    }

    if (!isUserAuthenticated || !hasManagerAccess(userRole)) {
      return (
        <AppStageShell
          activeTab="manager"
          onHomeClick={handleHomeClick}
          onCommunityClick={handleCommunityClick}
          onCreateClick={handleCreateClick}
          onProfileClick={handleProfileClick}
          user={user}
        >
          <div className="min-h-screen bg-[var(--bg-app)] flex items-center justify-center">
            <Toaster position={toasterPosition} richColors />
            <div className="text-sm font-semibold text-[var(--text-secondary)]">
              Redirecting to an allowed page...
            </div>
          </div>
        </AppStageShell>
      );
    }

    if (currentRoute.view === 'gantt-editor' && currentRoute.projectId) {
      return (
        <>
          <Toaster position={toasterPosition} richColors />
          <GanttEditorPage
            key={currentRoute.projectId}
            projectId={currentRoute.projectId}
            onBack={() => navigateTo('/manager/gantt')}
            renderShell={(content, onNavigate) => (
              <AppStageShell
                activeTab="manager"
                onHomeClick={handleHomeClick}
                onCommunityClick={handleCommunityClick}
                onCreateClick={handleCreateClick}
                onProfileClick={handleProfileClick}
                onNavigate={onNavigate}
                user={user}
              >
                {content}
              </AppStageShell>
            )}
          />
        </>
      );
    }

    return (
      <>
        <Toaster position={toasterPosition} richColors />
        <ManagerDashboard
          activeTab={currentRoute.managerSection ?? 'newsletters'}
          onTabChange={handleManagerTabChange}
          onOpenGanttEditor={handleOpenGanttEditor}
          onLogout={handleSignOut}
          onProfileClick={handleProfileClick}
          onHomeClick={handleHomeClick}
          onCommunityClick={handleCommunityClick}
          onCreateClick={handleCreateClick}
          currentUser={user}
          currentUserRole={userRole}
          newsletters={newsletters}
          addNewsletter={addNewsletter}
          upsertDraftNewsletter={upsertDraftNewsletter}
          updateNewsletter={updateNewsletter}
          uploadPresentation={uploadPresentation}
          deleteNewsletter={deleteNewsletter}
          sendNewsletterUpdate={sendNewsletterUpdate}
          onToggleNewsletterLike={handleArticleLike}
          onAddNewsletterComment={handleArticleComment}
          onToggleCommentLike={handleCommentLike}
          onVoteNewsletterPoll={handleVotePoll}
          onRsvpNewsletterEvent={handleRsvpEvent}
        />
      </>
    );
  }

  if (currentRoute.view === 'migrate') {
    return (
      <AppStageShell
        activeTab="home"
        onHomeClick={handleHomeClick}
        onCommunityClick={handleCommunityClick}
        onCreateClick={handleCreateClick}
        onProfileClick={handleProfileClick}
        user={user}
      >
        <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] transition-colors">
          <Toaster position={toasterPosition} richColors />
          <MigratePage onBack={handleHomeClick} />
        </div>
      </AppStageShell>
    );
  }

  if (currentRoute.view === 'signin') {
    return (
      <AppStageShell
        activeTab="home"
        onHomeClick={handleHomeClick}
        onCommunityClick={handleCommunityClick}
        onCreateClick={handleCreateClick}
        onProfileClick={handleProfileClick}
        user={user}
      >
        <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] transition-colors">
          <Toaster position={toasterPosition} richColors />
          <SignIn onBack={handleHomeClick} onSuccess={handleAuthSuccess} />
        </div>
      </AppStageShell>
    );
  }

  if (currentRoute.view === 'reset-password' && currentRoute.token) {
    return (
      <AppStageShell
        activeTab="home"
        onHomeClick={handleHomeClick}
        onCommunityClick={handleCommunityClick}
        onCreateClick={handleCreateClick}
        onProfileClick={handleProfileClick}
        user={user}
      >
        <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] transition-colors">
          <Toaster position={toasterPosition} richColors />
          <PasswordResetPage
            token={currentRoute.token}
            onBack={() => navigateTo('/sign-in', { replace: true })}
            onSuccess={handlePasswordResetSuccess}
          />
        </div>
      </AppStageShell>
    );
  }

  if (currentRoute.view === 'verify-email' && currentRoute.token) {
    return (
      <AppStageShell
        activeTab="home"
        onHomeClick={handleHomeClick}
        onCommunityClick={handleCommunityClick}
        onCreateClick={handleCreateClick}
        onProfileClick={handleProfileClick}
        user={user}
      >
        <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] transition-colors">
          <Toaster position={toasterPosition} richColors />
          <VerifyEmailPage
            token={currentRoute.token}
            onBack={() => navigateTo('/sign-in', { replace: true })}
            onSuccess={handleAuthSuccess}
          />
        </div>
      </AppStageShell>
    );
  }

  if (currentRoute.view === 'sso-callback') {
    return (
      <AppStageShell
        activeTab="home"
        onHomeClick={handleHomeClick}
        onCommunityClick={handleCommunityClick}
        onCreateClick={handleCreateClick}
        onProfileClick={handleProfileClick}
        user={user}
      >
        <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] transition-colors">
          <Toaster position={toasterPosition} richColors />
          <SSOCallback
            onFinish={handleAuthSuccess}
            onRetry={() => navigateTo('/sign-in', { replace: true })}
          />
        </div>
      </AppStageShell>
    );
  }

  if (currentRoute.view === 'profile') {
    if (isAuthLoading) {
      return <div className="min-h-screen bg-[var(--bg-app)]" />;
    }

    if (!isUserAuthenticated) {
      return null;
    }

    return (
      <AppStageShell
        activeTab="profile"
        onHomeClick={handleHomeClick}
        onCommunityClick={handleCommunityClick}
        onCreateClick={handleCreateClick}
        onProfileClick={handleProfileClick}
        user={user}
      >
        <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] transition-colors">
          <Toaster position={toasterPosition} richColors />
          <ProfilePage onBack={handleProfileBack} />
        </div>
      </AppStageShell>
    );
  }

  if (currentRoute.view === 'unsubscribe') {
    return (
      <AppStageShell
        activeTab="home"
        onHomeClick={handleHomeClick}
        onCommunityClick={handleCommunityClick}
        onCreateClick={handleCreateClick}
        onProfileClick={handleProfileClick}
        user={user}
      >
        <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] transition-colors">
          <Toaster position={toasterPosition} richColors />
          <UnsubscribePage onBack={handleHomeClick} />
        </div>
      </AppStageShell>
    );
  }

  if (currentRoute.view === 'community') {
    return (
      <AppStageShell
        activeTab="community"
        onHomeClick={handleHomeClick}
        onCommunityClick={handleCommunityClick}
        onCreateClick={handleCreateClick}
        onProfileClick={handleProfileClick}
        user={user}
      >
        <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] transition-colors">
          <Toaster position={toasterPosition} richColors />
          <Navigation
            onManagerClick={handleManagerClick}
            onHomeClick={handleHomeClick}
            onCommunityClick={handleCommunityClick}
            onSignInClick={handleSignInClick}
            onSignOut={handleSignOut}
            onProfileClick={handleProfileClick}
            onSearch={(query) => {
              setSearchQuery(query);
              navigateTo(`/?search=${encodeURIComponent(query)}`);
            }}
            onSearchChange={setSearchQuery}
            isAuthenticated={isUserAuthenticated}
            authName={user?.name}
            activeTab="community"
          />
          <CommunityPage
            pathname={currentRoute.pathname}
            isAuthenticated={isUserAuthenticated}
            onNavigate={(pathname) => navigateTo(pathname)}
            onRequireAuth={handleRequireAuth}
            onLeave={handleHomeClick}
            onOpenModeration={() => navigateTo('/manager/community')}
          />
        </div>
      </AppStageShell>
    );
  }

  // Render home page
  return (
    <AppStageShell
      activeTab="home"
      onHomeClick={handleHomeClick}
      onCommunityClick={handleCommunityClick}
      onCreateClick={handleCreateClick}
      onProfileClick={handleProfileClick}
      user={user}
    >
      <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] transition-colors">
        <Toaster position={toasterPosition} richColors />
        <Navigation
          onManagerClick={handleManagerClick}
          onHomeClick={handleHomeClick}
          onCommunityClick={handleCommunityClick}
          onSignInClick={handleSignInClick}
          onSignOut={handleSignOut}
          onProfileClick={handleProfileClick}
          onSearch={setSearchQuery}
          onSearchChange={setSearchQuery}
          isAuthenticated={isUserAuthenticated}
          authName={user?.name}
        />
        <main>
          {!isSearchActive ? (
            <HeroBanner
              featuredNewsletter={publishedNewsletters[0] ?? null}
              onArticleClick={handleArticleClick}
            />
          ) : null}

          <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
            {isSearchActive ? (
              <section className="mb-8 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-6 py-5 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary-accent)]">
                      {t('app.search.label')}
                    </p>
                    <h2 className="mt-1 text-xl sm:text-2xl font-extrabold text-[var(--text-primary)]">
                      {t('app.search.results', { count: filteredNewsletters.length })}
                    </h2>
                  </div>
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                    {t('app.search.matches', { query: trimmedSearchQuery })}
                  </p>
                </div>
              </section>
            ) : null}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Center Main Feed Column */}
              <div className="lg:col-span-8 space-y-8">
                {!isSearchActive && (
                  <>
                    <OurWriters
                      newsletters={publishedNewsletters}
                      onArticleClick={handleArticleClick}
                      onNavigate={navigateTo}
                    />

                    {/* Reference: Create Post / Quick Compose Card */}
                    <QuickComposeCard user={user} onCompose={handleQuickCompose} />
                  </>
                )}

                {filteredNewsletters.length > 0 ? (
                  <>
                    <PopularArticles
                      newsletters={filteredNewsletters}
                      onArticleClick={handleArticleClick}
                    />
                    <LatestArticles
                      newsletters={filteredNewsletters}
                      currentUserId={user?.id}
                      onArticleClick={handleArticleClick}
                    />
                  </>
                ) : (
                  <section className="rounded-3xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-card)] px-6 py-12 text-center shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary-accent)]">
                      {t('app.search.noMatchesLabel')}
                    </p>
                    <h2 className="mt-3 text-xl sm:text-2xl font-extrabold text-[var(--text-primary)]">
                      {t('app.search.noMatchesTitle')}
                    </h2>
                    <p className="mt-2 text-xs sm:text-sm text-[var(--text-secondary)]">
                      {t('app.search.noMatchesDescription')}
                    </p>
                  </section>
                )}
              </div>

              {/* Right Sidebar Column */}
              <div className="lg:col-span-4 sticky top-20">
                <Sidebar
                  publishedCount={publishedNewsletters.length}
                  onNavigate={navigateTo}
                />
              </div>
            </div>
          </div>
        </main>
      </div>
    </AppStageShell>
  );
}

export default App;
