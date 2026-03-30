import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Navigation } from './components/Navigation';
import { HeroBanner } from './sections/HeroBanner';
import { PopularArticles } from './sections/PopularArticles';
import { LatestArticles } from './sections/LatestArticles';
import { Sidebar } from './sections/Sidebar';
import { ManagerDashboard, type Tab as ManagerTab } from './sections/ManagerDashboard';
import { GanttEditorPage } from './sections/manager/GanttEditorPage';
import { NewsletterViewer } from './sections/NewsletterViewer';
import { SignIn } from './components/auth/SignIn';
import { SSOCallback } from './components/auth/SSOCallback';
import { useAuth } from './contexts/AuthContext';
import { useNewsletters } from './hooks/useNewsletters';
import { hasManagerAccess } from './lib/auth/permissions';
import { Toaster } from 'sonner';
import { toast } from 'sonner';
import type { Newsletter, NewsletterComment } from './types/newsletter';
import './App.css';

export type View = 'home' | 'manager' | 'article' | 'signin' | 'sso-callback' | 'gantt-editor';

const managerSections: ManagerTab[] = ['newsletters', 'projects', 'goals', 'gantt', 'spreadsheet'];

interface RouteState {
  view: View;
  pathname: string;
  articleId?: string;
  managerSection?: ManagerTab;
  projectId?: string;
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

  if (normalizedPathname === '/sign-in' || normalizedPathname === '/signin') {
    return { view: 'signin', pathname: '/sign-in' };
  }

  if (normalizedPathname === '/sso-callback') {
    return { view: 'sso-callback', pathname: '/sso-callback' };
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
  const {
    isAuthenticated: isUserAuthenticated,
    isLoading: isAuthLoading,
    logout: handleUserLogout,
    user,
  } = useAuth();
  const userRole = user?.role ?? null;
  const {
    newsletters,
    isLoaded: areNewslettersLoaded,
    addNewsletter,
    upsertDraftNewsletter,
    updateNewsletter,
    deleteNewsletter,
    toggleNewsletterLike,
    addNewsletterComment,
    toggleCommentLike,
  } = useNewsletters({
    currentUser: user,
    currentUserRole: userRole,
  });
  const currentPathname = useSyncExternalStore(
    subscribeToRouteChanges,
    getCurrentPathnameSnapshot,
    () => '/',
  );
  const currentRoute = useMemo(() => resolveRoute(currentPathname), [currentPathname]);
  const [searchQuery, setSearchQuery] = useState('');
  const managerToastRouteRef = useRef<string | null>(null);
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

    window.history[historyMethod]({}, '', nextRoute.pathname);
    window.dispatchEvent(new Event('app:navigate'));
  }, []);

  useEffect(() => {
    if (currentRoute.view !== 'article' || !currentRoute.articleId) {
      return;
    }

    if (!selectedArticle) {
      if (areNewslettersLoaded) {
        navigateTo('/', { replace: true });
      }
      return;
    }

    const canonicalArticlePath = getArticlePath(selectedArticle);
    if (window.location.pathname !== canonicalArticlePath) {
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
      navigateTo('/sign-in', { replace: true });
      return;
    }

    if (!hasManagerAccess(userRole)) {
      if (managerToastRouteRef.current !== currentRoute.pathname) {
        toast.error('This account is not allowed to access the manager dashboard.');
        managerToastRouteRef.current = currentRoute.pathname;
      }
      navigateTo('/', { replace: true });
      return;
    }

    managerToastRouteRef.current = null;
  }, [currentRoute.pathname, currentRoute.view, isAuthLoading, isUserAuthenticated, navigateTo, userRole]);

  const handleManagerClick = () => {
    navigateTo('/manager');
  };

  const handleManagerTabChange = useCallback((tab: ManagerTab) => {
    navigateTo(tab === 'newsletters' ? '/manager' : `/manager/${tab}`);
  }, [navigateTo]);

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

  const handleRequireAuth = () => {
    toast.error('Sign in to join the discussion.');
    navigateTo('/sign-in');
  };

  const handleAuthSuccess = () => {
    navigateTo('/', { replace: true });
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

  const handleArticleComment = (newsletterId: string, body: string): NewsletterComment | null => {
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

  // Render article view
  if (currentRoute.view === 'article' && selectedArticle) {
    return (
      <div className="min-h-screen bg-white">
        <Toaster position="top-right" richColors />
        <NewsletterViewer
          newsletter={selectedArticle}
          currentUser={user}
          onBack={handleBackToHome}
          onRequireAuth={handleRequireAuth}
          onToggleLike={handleArticleLike}
          onAddComment={handleArticleComment}
          onToggleCommentLike={handleCommentLike}
        />
      </div>
    );
  }

  if (currentRoute.view === 'article') {
    return (
      <div className="min-h-screen bg-white">
        <Toaster position="top-right" richColors />
        <div className="flex min-h-screen items-center justify-center text-sm font-medium text-[#737373]">
          Loading article...
        </div>
      </div>
    );
  }

  // Render manager dashboard and manager-only editor
  if (currentRoute.view === 'manager' || currentRoute.view === 'gantt-editor') {
    if (isAuthLoading) {
      return (
        <div className="min-h-screen bg-white">
          <Toaster position="top-right" richColors />
          <div className="flex min-h-screen items-center justify-center text-sm font-medium text-[#737373]">
            Loading manager dashboard...
          </div>
        </div>
      );
    }

    if (!isUserAuthenticated || !hasManagerAccess(userRole)) {
      return null;
    }

    if (currentRoute.view === 'gantt-editor' && currentRoute.projectId) {
      return (
        <div className="min-h-screen bg-white">
          <Toaster position="top-right" richColors />
          <GanttEditorPage
            key={currentRoute.projectId}
            projectId={currentRoute.projectId}
            onBack={() => navigateTo('/manager/gantt')}
          />
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-white">
        <Toaster position="top-right" richColors />
        <ManagerDashboard
          activeTab={currentRoute.managerSection ?? 'newsletters'}
          onTabChange={handleManagerTabChange}
          onOpenGanttEditor={handleOpenGanttEditor}
          onLogout={handleSignOut}
          onHomeClick={handleHomeClick}
          currentUser={user}
          currentUserRole={userRole}
          newsletters={newsletters}
          addNewsletter={addNewsletter}
          upsertDraftNewsletter={upsertDraftNewsletter}
          updateNewsletter={updateNewsletter}
          deleteNewsletter={deleteNewsletter}
          onToggleNewsletterLike={handleArticleLike}
          onAddNewsletterComment={handleArticleComment}
          onToggleCommentLike={handleCommentLike}
        />
      </div>
    );
  }

  if (currentRoute.view === 'signin') {
    return (
      <div className="min-h-screen bg-white">
        <Toaster position="top-right" richColors />
        <SignIn onBack={handleHomeClick} onSuccess={handleAuthSuccess} />
      </div>
    );
  }

  if (currentRoute.view === 'sso-callback') {
    return (
      <div className="min-h-screen bg-white">
        <Toaster position="top-right" richColors />
        <SSOCallback
          onFinish={handleAuthSuccess}
          onRetry={() => navigateTo('/sign-in', { replace: true })}
        />
      </div>
    );
  }

  // Render home page
  return (
    <div className="min-h-screen bg-white">
      <Toaster position="top-right" richColors />
      <Navigation
        onManagerClick={handleManagerClick}
        onHomeClick={handleHomeClick}
        onSignInClick={handleSignInClick}
        onSignOut={handleSignOut}
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {isSearchActive ? (
            <section className="mb-10 rounded-2xl border border-[#E5E5E5] bg-[#FAFAFA] px-5 py-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D93A3A]">
                    Newsletter Search
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-[#171717]">
                    {filteredNewsletters.length === 1
                      ? '1 result found'
                      : `${filteredNewsletters.length} results found`}
                  </h2>
                </div>
                <p className="text-sm text-[#737373]">
                  Showing matches for <span className="font-semibold text-[#171717]">&quot;{trimmedSearchQuery}&quot;</span>
                </p>
              </div>
            </section>
          ) : null}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-12">
              {filteredNewsletters.length > 0 ? (
                <>
                  <PopularArticles
                    newsletters={filteredNewsletters}
                    onArticleClick={handleArticleClick}
                  />
                  <LatestArticles
                    newsletters={filteredNewsletters}
                    onArticleClick={handleArticleClick}
                  />
                </>
              ) : (
                <section className="rounded-2xl border border-dashed border-[#D4D4D8] bg-[#FAFAFA] px-6 py-10 text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D93A3A]">
                    No Matches
                  </p>
                  <h2 className="mt-3 text-2xl font-bold text-[#171717]">
                    No newsletters matched your search
                  </h2>
                  <p className="mt-3 text-sm text-[#737373]">
                    Try a title, tag, author name, or a broader keyword from the article content.
                  </p>
                </section>
              )}
            </div>
            <div className="lg:col-span-1">
              <Sidebar />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
