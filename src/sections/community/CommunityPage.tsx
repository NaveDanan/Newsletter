import { useCallback, useEffect, useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Bookmark01Icon,
  Home01Icon,
  Notification01Icon,
  PencilEdit01Icon,
  Search01Icon,
  UserIcon,
} from '@hugeicons/core-free-icons';
import { NotificationDropdown } from '@/components/notifications/NotificationDropdown';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocale } from '@/contexts/LocaleContext';
import { useCommunityEngagement } from '@/hooks/useCommunityEngagement';
import { useNotificationCount } from '@/contexts/NotificationsContext';
import { useCommunitySession } from '@/hooks/useCommunitySession';
import {
  communityBookmarksPath,
  communityFeedPath,
  communityHashtagPath,
  communityNotificationsPath,
  communityPostPath,
  communityProfilePath,
  communitySearchPath,
  parseCommunityRoute,
} from '@/lib/community-routes';
import { cn } from '@/lib/utils';
import { lazyComponent } from '@/lib/lazy-component';
import { readScope } from '@/lib/pocketbase/read-cache';
import { CommunityThreadScreen } from './screen-loaders';


import { type CommunityContextValue } from './CommunityContext';
import { CommunityProvider } from './CommunityProvider';
import { CommunityFeedScreen } from './CommunityFeedScreen';
import { CommunityLeftRail } from './CommunityLeftRail';

import { CommunityRightRail } from './CommunityRightRail';
import {
  createComposeRequest,
  releaseComposeRequest,
  type ComposeRequest,
  takeQueuedComposeRequest,
} from './compose-request';
import type { CommunityPost, CommunitySearchType } from '@/types/community';

// The single owner of community state. Everything below it reads the route out
// of the context rather than out of window.location, so the eleven screens stay
// unaware that App drives navigation with history.pushState.
//
// The composer and the report dialog live here instead of inside the screens
// because any card anywhere can open them, and a modal that unmounts with its
// screen would close itself on the navigation it triggered. Profile editing is
// not a modal: it is the unified /profile page shared with the rest of the site.

const CommunityBookmarksScreen = lazyComponent(() => import('./CommunityBookmarksScreen').then((module) => ({ default: module.CommunityBookmarksScreen })));
const CommunityComposerDialog = lazyComponent(() => import('./CommunityComposerDialog').then((module) => ({ default: module.CommunityComposerDialog })));
const CommunityConnectionsScreen = lazyComponent(() => import('./CommunityConnectionsScreen').then((module) => ({ default: module.CommunityConnectionsScreen })));
const CommunityHashtagScreen = lazyComponent(() => import('./CommunityHashtagScreen').then((module) => ({ default: module.CommunityHashtagScreen })));
const CommunityNotificationsScreen = lazyComponent(() => import('./CommunityNotificationsScreen').then((module) => ({ default: module.CommunityNotificationsScreen })));
const CommunityProfileScreen = lazyComponent(() => import('./CommunityProfileScreen').then((module) => ({ default: module.CommunityProfileScreen })));
const CommunityReportDialog = lazyComponent(() => import('./CommunityReportDialog').then((module) => ({ default: module.CommunityReportDialog })));
const CommunitySearchScreen = lazyComponent(() => import('./CommunitySearchScreen').then((module) => ({ default: module.CommunitySearchScreen })));

interface CommunityPageProps {
  pathname: string;
  isAuthenticated: boolean;
  onNavigate: (pathname: string) => void;
  onRequireAuth: () => void;
  onLeave: () => void;
  onOpenModeration: () => void;
}

interface ComposerState {
  mode: 'reply' | 'quote';
  post: CommunityPost;
}

export function CommunityPage({
  pathname,
  isAuthenticated,
  onNavigate,
  onRequireAuth,
  onOpenModeration,
}: CommunityPageProps) {
  const { t } = useLocale();
  const { session, profile, isLoading, setUnreadNotifications } = useCommunitySession(isAuthenticated);
  const [composer, setComposer] = useState<ComposerState | null>(null);
  // Held until the feed says it opened the composer with it. The feed can mount
  // long after the request is made - a navigation away from another screen, or
  // the session still loading - so the request waits rather than expires.
  const [composeRequest, setComposeRequest] = useState<ComposeRequest | null>(null);
  const [reportTarget, setReportTarget] = useState<{ postId?: string; handle?: string } | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const toggleTag = useCallback((tag: string) => {
    const key = tag.toLowerCase();
    setSelectedTags((current) => (
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    ));
  }, []);

  const route = useMemo(() => parseCommunityRoute(pathname) ?? parseCommunityRoute('/community')!, [pathname]);

  // Composing always happens inline in the feed, so a request from anywhere
  // else lands on the feed first and then nudges the card open.
  const requestCompose = useCallback((files?: File[]) => {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    if (route.section !== 'feed') {
      onNavigate(communityFeedPath());
    }
    setComposeRequest(createComposeRequest(files));
  }, [isAuthenticated, onNavigate, onRequireAuth, route.section]);

  // One request, one composer: once the feed reports it opened with it, the
  // page lets go of the request and of the files it was carrying.
  const handleComposeRequestHandled = useCallback((requestId: number) => {
    setComposeRequest((current) => releaseComposeRequest(current, requestId));
  }, []);

  // The home feed's quick-compose card carries selected attachments here.
  useEffect(() => {
    const handleCompose = (event: Event) => {
      takeQueuedComposeRequest();
      const detail = (event as CustomEvent<{ files?: File[] }>).detail;
      requestCompose(detail?.files);
    };
    window.addEventListener('community:compose', handleCompose);
    const queued = takeQueuedComposeRequest();
    if (queued) queueMicrotask(() => requestCompose(queued.files));
    return () => { window.removeEventListener('community:compose', handleCompose); };
  }, [requestCompose]);

  const navigate = useCallback((next: string) => {
    onNavigate(next);
  }, [onNavigate]);

  const openPost = useCallback((postId: string) => {
    navigate(communityPostPath(postId));
  }, [navigate]);

  const openProfile = useCallback((handle: string) => {
    navigate(communityProfilePath(handle));
  }, [navigate]);

  const openHashtag = useCallback((tag: string) => {
    navigate(communityHashtagPath(tag));
  }, [navigate]);

  const openSearch = useCallback((query: string, type: CommunitySearchType = 'posts') => {
    navigate(communitySearchPath(query, type));
  }, [navigate]);

  const openReply = useCallback((post: CommunityPost) => {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    setComposer({ mode: 'reply', post });
  }, [isAuthenticated, onRequireAuth]);

  const openQuote = useCallback((post: CommunityPost) => {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    setComposer({ mode: 'quote', post });
  }, [isAuthenticated, onRequireAuth]);

  const openReport = useCallback((input: { postId?: string; handle?: string }) => {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    setReportTarget(input);
  }, [isAuthenticated, onRequireAuth]);

  // The post shown above the reply box is a copy, not a reference into a feed,
  // so liking it from inside the dialog needs its own patcher.
  const patchComposerPost = useCallback((postId: string, patch: Partial<CommunityPost>) => {
    setComposer((current) => (
      current && current.post.id === postId ? { ...current, post: { ...current.post, ...patch } } : current
    ));
  }, []);

  const composerActions = useCommunityEngagement({
    patchPost: patchComposerPost,
    isAuthenticated,
    onRequireAuth,
    translate: t,
  });

  const contextValue = useMemo<CommunityContextValue>(() => ({
    isAuthenticated,
    session,
    profile,
    canModerate: Boolean(session && session.canModerate),
    requireAuth: onRequireAuth,
    navigate,
    openPost,
    openProfile,
    openHashtag,
    openSearch,
    openReply,
    openQuote,
    openReport,
    selectedTags,
    toggleTag,
  }), [
    isAuthenticated,
    navigate,
    onRequireAuth,
    openHashtag,
    openPost,
    openProfile,
    openQuote,
    openReply,
    openReport,
    openSearch,
    profile,
    selectedTags,
    session,
    toggleTag,
  ]);

  const unreadCount = useNotificationCount();

  const renderSection = () => {
    if (route.section === 'post') {
      CommunityThreadScreen.preload();
      return <CommunityThreadScreen key={readScope() + route.postId} postId={route.postId} />;
    }

    if (route.section === 'profile') {
      const targetHandle = (route.handle === 'me' || !route.handle) ? (profile?.handle || '') : route.handle;
      if ((route.handle === 'me' || !route.handle) && isLoading && !session) {
        return (
          <div className="space-y-4 p-4">
            <Skeleton className="h-48 sm:h-52 w-full rounded-none" />
            <div className="flex items-start justify-between px-4">
              <Skeleton className="size-28 sm:size-36 rounded-full -mt-14" />
              <Skeleton className="h-9 w-28 rounded-full mt-3" />
            </div>
            <div className="space-y-2 px-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
        );
      }
      return (
        <CommunityProfileScreen
          key={readScope() + targetHandle + ':' + route.profileTab}
          handle={targetHandle}
          tab={route.profileTab}
          onEditProfile={() => onNavigate('/profile')}
        />
      );
    }

    if (route.section === 'connections') {
      return (
        <CommunityConnectionsScreen
          key={readScope() + route.handle + ':' + route.direction}
          handle={route.handle}
          direction={route.direction}
        />
      );
    }

    if (route.section === 'notifications') {
      return <CommunityNotificationsScreen key={readScope()} onUnreadChange={setUnreadNotifications} />;
    }

    if (route.section === 'bookmarks') {
      return <CommunityBookmarksScreen />;
    }

    if (route.section === 'search') {
      return <CommunitySearchScreen key={readScope() + route.searchType} query={route.query} type={route.searchType} />;
    }

    if (route.section === 'hashtag') {
      return <CommunityHashtagScreen key={readScope() + route.tag} tag={route.tag} />;
    }

    return (
      <CommunityFeedScreen
        key={readScope() + route.feedTab}
        tab={route.feedTab}
        composeRequest={composeRequest}
        onComposeRequestHandled={handleComposeRequestHandled}
      />
    );
  };

  const mobileItems = [
    { key: 'feed', label: t('community.nav.feed'), icon: Home01Icon, path: communityFeedPath(), guarded: false },
    { key: 'search', label: t('community.nav.explore'), icon: Search01Icon, path: communitySearchPath(''), guarded: false },
    {
      key: 'notifications',
      label: t('community.nav.notifications'),
      icon: Notification01Icon,
      path: communityNotificationsPath(),
      guarded: true,
    },
    { key: 'bookmarks', label: t('community.nav.bookmarks'), icon: Bookmark01Icon, path: communityBookmarksPath(), guarded: true },
    {
      key: 'profile',
      label: t('community.nav.profile'),
      icon: UserIcon,
      path: profile ? communityProfilePath(profile.handle) : '/community/profile',
      guarded: true,
    },
  ];

  return (
    <CommunityProvider value={contextValue}>
      <div className="bg-transparent text-[var(--text-primary)] transition-colors">
        {/* The row owns the viewport height so only the centre column scrolls. */}
        <div className="mx-auto flex w-full items-stretch gap-0 px-0 lg:h-[calc(100dvh-104px)] lg:overflow-hidden lg:px-4">
          <aside className="hidden h-full shrink-0 lg:flex lg:flex-col lg:w-[88px] xl:w-[275px] z-10 select-none">
            <CommunityLeftRail
              section={route.section}
              unreadCount={unreadCount}
              onCompose={requestCompose}
              onOpenModeration={onOpenModeration}
            />
          </aside>

          <main className="w-full min-w-0 flex-1 pb-24 lg:h-full lg:overflow-y-auto lg:pb-0">
            {profile && profile.isSuspended ? (
              <div className="border-b border-[var(--border-subtle)] bg-[var(--primary-accent)]/10 px-4 py-3">
                <p className="text-sm font-semibold text-[var(--primary-accent)]">{t('community.suspended.title')}</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{t('community.suspended.body')}</p>
              </div>
            ) : null}

            {renderSection()}
          </main>

          <CommunityRightRail initialQuery={route.section === 'search' ? route.query : ''} />
        </div>

        {!isAuthenticated ? (
          <div className="fixed inset-x-0 bottom-0 max-md:bottom-[var(--mobile-shell-bar-height)] z-30 border-t border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-3 text-[var(--text-primary)] lg:px-8 shadow-2xl">
            <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold">{t('community.signIn.title')}</p>
                <p className="text-sm text-[var(--text-secondary)]">{t('community.signIn.body')}</p>
              </div>
              <Button
                type="button"
                className="btn-hire-me text-xs"
                onClick={onRequireAuth}
              >
                {t('community.signIn.action')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              aria-label={t('community.composer.post')}
              className="fixed bottom-20 max-md:bottom-[calc(var(--mobile-shell-bar-height)+5rem)] end-4 z-30 rounded-full bg-[var(--primary-accent)] p-4 text-[var(--accent-contrast)] shadow-xl hover:scale-105 active:scale-95 transition-all lg:hidden"
              onClick={() => requestCompose()}
            >
              <HugeiconsIcon icon={PencilEdit01Icon} className="size-6" />
            </button>

            <nav
              aria-label={t('community.nav.menu')}
              className="fixed inset-x-0 bottom-0 max-md:bottom-[var(--mobile-shell-bar-height)] z-30 flex border-t border-[var(--border-subtle)] bg-[var(--bg-card)]/95 backdrop-blur-md lg:hidden"
            >
              {mobileItems.map((item) => {
                const isActive = item.key === route.section
                  || (item.key === 'search' && (route.section === 'search' || route.section === 'hashtag'))
                  || (item.key === 'profile' && (route.section === 'profile' || route.section === 'connections'));

                const button = (
                  <button
                    key={item.key}
                    type="button"
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'relative flex flex-1 items-center justify-center py-3 transition-colors',
                      isActive ? 'text-[var(--primary-accent)]' : 'text-[var(--text-secondary)]',
                    )}
                    onClick={() => {
                      if (item.guarded && !profile) {
                        onRequireAuth();
                        return;
                      }
                      navigate(item.path);
                    }}
                  >
                    <HugeiconsIcon icon={item.icon} className="size-6" strokeWidth={isActive ? 2 : 1.5} />
                    {item.key === 'notifications' && unreadCount > 0 ? (
                      <span className="absolute top-2 ms-5 size-2 rounded-full bg-[var(--primary-accent)]" />
                    ) : null}
                  </button>
                );
                return item.key === 'notifications' ? <NotificationDropdown key={item.key} trigger={button} /> : button;
              })}
            </nav>
          </>
        )}

        {composer ? <CommunityComposerDialog
          mode={composer ? composer.mode : null}
          target={composer ? composer.post : null}
          actions={composerActions}
          onPosted={(post) => {
            // Without a shared cache the originating list cannot learn about the
            // new reply, so the author is taken to where it is actually visible.
            openPost(post.kind === 'reply' && post.parentId ? post.parentId : post.id);
          }}
          onClose={() => setComposer(null)}
        /> : null}

        {reportTarget ? <CommunityReportDialog target={reportTarget} onClose={() => setReportTarget(null)} /> : null}
      </div>
    </CommunityProvider>
  );
}
