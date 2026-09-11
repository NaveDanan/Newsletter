import { useCallback, useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Bookmark01Icon,
  Home01Icon,
  Notification01Icon,
  PencilEdit01Icon,
  Search01Icon,
  UserIcon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useLocale } from '@/contexts/LocaleContext';
import { useCommunityEngagement } from '@/hooks/useCommunityEngagement';
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
import { CommunityBookmarksScreen } from './CommunityBookmarksScreen';
import { CommunityComposer } from './CommunityComposer';
import { CommunityComposerDialog } from './CommunityComposerDialog';
import { CommunityConnectionsScreen } from './CommunityConnectionsScreen';
import { CommunityProvider, type CommunityContextValue } from './CommunityContext';
import { CommunityFeedScreen } from './CommunityFeedScreen';
import { CommunityHashtagScreen } from './CommunityHashtagScreen';
import { CommunityLeftRail } from './CommunityLeftRail';
import { CommunityNotificationsScreen } from './CommunityNotificationsScreen';
import { CommunityProfileEditor } from './CommunityProfileEditor';
import { CommunityProfileScreen } from './CommunityProfileScreen';
import { CommunityReportDialog } from './CommunityReportDialog';
import { CommunityRightRail } from './CommunityRightRail';
import { CommunitySearchScreen } from './CommunitySearchScreen';
import { CommunityThreadScreen } from './CommunityThreadScreen';
import type { CommunityPost, CommunitySearchType } from '@/types/community';

// The single owner of community state. Everything below it reads the route out
// of the context rather than out of window.location, so the eleven screens stay
// unaware that App drives navigation with history.pushState.
//
// The composer, the report dialog and the profile editor live here instead of
// inside the screens because any card anywhere can open them, and a modal that
// unmounts with its screen would close itself on the navigation it triggered.

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
  onLeave,
  onOpenModeration,
}: CommunityPageProps) {
  const { t } = useLocale();
  const { session, profile, isLoading, saveProfile, setUnreadNotifications } = useCommunitySession(isAuthenticated);
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ postId?: string; handle?: string } | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const route = useMemo(() => parseCommunityRoute(pathname) ?? parseCommunityRoute('/community')!, [pathname]);

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
    session,
  ]);

  const unreadCount = session ? session.unreadNotifications : 0;

  const renderSection = () => {
    if (route.section === 'post') {
      return <CommunityThreadScreen key={route.postId} postId={route.postId} />;
    }

    if (route.section === 'profile') {
      return (
        <CommunityProfileScreen
          key={route.handle + ':' + route.profileTab}
          handle={route.handle}
          tab={route.profileTab}
          onEditProfile={() => setIsEditorOpen(true)}
        />
      );
    }

    if (route.section === 'connections') {
      return (
        <CommunityConnectionsScreen
          key={route.handle + ':' + route.direction}
          handle={route.handle}
          direction={route.direction}
        />
      );
    }

    if (route.section === 'notifications') {
      return <CommunityNotificationsScreen onUnreadChange={setUnreadNotifications} />;
    }

    if (route.section === 'bookmarks') {
      return <CommunityBookmarksScreen />;
    }

    if (route.section === 'search') {
      return <CommunitySearchScreen key={route.searchType} query={route.query} type={route.searchType} />;
    }

    if (route.section === 'hashtag') {
      return <CommunityHashtagScreen key={route.tag} tag={route.tag} />;
    }

    return <CommunityFeedScreen key={route.feedTab} tab={route.feedTab} />;
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
      path: profile ? communityProfilePath(profile.handle) : communityFeedPath(),
      guarded: true,
    },
  ];

  if (isAuthenticated && isLoading && !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-sm font-medium text-[#737373]">
        {t('community.loading')}
      </div>
    );
  }

  return (
    <CommunityProvider value={contextValue}>
      <div className="min-h-screen bg-white">
        <div className="mx-auto flex w-full max-w-[1265px] gap-0 px-0 lg:px-4">
          <aside className="sticky top-[104px] hidden h-[calc(100vh-104px)] h-[calc(100dvh-104px)] shrink-0 lg:flex lg:flex-col lg:w-[88px] xl:w-[275px] z-10 select-none">
            <CommunityLeftRail
              section={route.section}
              unreadCount={unreadCount}
              onCompose={() => setIsComposeOpen(true)}
              onLeave={onLeave}
              onOpenModeration={onOpenModeration}
            />
          </aside>

          <main className="min-h-screen w-full min-w-0 flex-1 border-[#E5E5E5] pb-24 lg:max-w-[600px] lg:border-x lg:pb-0">
            {profile && profile.isSuspended ? (
              <div className="border-b border-[#E5E5E5] bg-[#FEF2F2] px-4 py-3">
                <p className="text-sm font-semibold text-[#D93A3A]">{t('community.suspended.title')}</p>
                <p className="mt-1 text-sm text-[#737373]">{t('community.suspended.body')}</p>
              </div>
            ) : null}

            {renderSection()}
          </main>

          <CommunityRightRail initialQuery={route.section === 'search' ? route.query : ''} />
        </div>

        {!isAuthenticated ? (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E5E5E5] bg-[#171717] px-4 py-3 text-white lg:px-8">
            <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold">{t('community.signIn.title')}</p>
                <p className="text-sm text-white/70">{t('community.signIn.body')}</p>
              </div>
              <Button
                type="button"
                className="rounded-full bg-[#D93A3A] px-6 font-bold text-white hover:bg-[#C13232]"
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
              className="fixed bottom-20 end-4 z-30 rounded-full bg-[#D93A3A] p-4 text-white shadow-lg transition-colors hover:bg-[#C13232] lg:hidden"
              onClick={() => setIsComposeOpen(true)}
            >
              <HugeiconsIcon icon={PencilEdit01Icon} className="size-6" />
            </button>

            <nav
              aria-label={t('community.nav.menu')}
              className="fixed inset-x-0 bottom-0 z-30 flex border-t border-[#E5E5E5] bg-white/95 backdrop-blur lg:hidden"
            >
              {mobileItems.map((item) => {
                const isActive = item.key === route.section
                  || (item.key === 'search' && (route.section === 'search' || route.section === 'hashtag'))
                  || (item.key === 'profile' && (route.section === 'profile' || route.section === 'connections'));

                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'relative flex flex-1 items-center justify-center py-3 transition-colors',
                      isActive ? 'text-[#D93A3A]' : 'text-[#737373]',
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
                      <span className="absolute top-2 ms-5 size-2 rounded-full bg-[#D93A3A]" />
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </>
        )}

        <Dialog open={isComposeOpen} onOpenChange={(next) => { if (!next) { setIsComposeOpen(false); } }}>
          <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto p-0 sm:max-w-xl">
            <DialogHeader className="border-b border-[#E5E5E5] px-4 py-3">
              <DialogTitle className="text-base">{t('community.composer.post')}</DialogTitle>
            </DialogHeader>
            <CommunityComposer
              autoFocus
              onPosted={(post) => {
                setIsComposeOpen(false);
                openPost(post.id);
              }}
              onCancel={() => setIsComposeOpen(false)}
            />
          </DialogContent>
        </Dialog>

        <CommunityComposerDialog
          mode={composer ? composer.mode : null}
          target={composer ? composer.post : null}
          actions={composerActions}
          onPosted={(post) => {
            // Without a shared cache the originating list cannot learn about the
            // new reply, so the author is taken to where it is actually visible.
            openPost(post.kind === 'reply' && post.parentId ? post.parentId : post.id);
          }}
          onClose={() => setComposer(null)}
        />

        <CommunityReportDialog target={reportTarget} onClose={() => setReportTarget(null)} />

        <CommunityProfileEditor
          open={isEditorOpen}
          profile={profile}
          onSave={saveProfile}
          onClose={() => setIsEditorOpen(false)}
        />
      </div>
    </CommunityProvider>
  );
}
