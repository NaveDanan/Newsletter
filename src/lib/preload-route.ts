import { ManagerDashboard, GanttEditorPage, NewsletterViewer, ProfilePage, UnsubscribePage, PasswordResetPage, VerifyEmailPage, SignIn, SSOCallback, MigratePage, CommunityPage } from './route-components';
import { prefetchNewsletter } from '@/lib/pocketbase/newsletters';
import { prefetchCommunityFeed, prefetchCommunityThread, fetchCommunityProfile, fetchCommunityProfilePosts } from '@/lib/pocketbase/community';
import { parseCommunityRoute } from '@/lib/community-routes';
import { CommunityThreadScreen } from '@/sections/community/screen-loaders';
import { getPocketBase } from '@/lib/pocketbase/client';

function prepareProjects(): void {
  if (getPocketBase().authStore.isValid) void import('./pocketbase/projects').then(module => module.prefetchProjects()).catch(() => {});
}

// Shared by navigation intents and the actual route. Both use the same import.
export function preloadRoute(pathname: string): void {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (path.startsWith('/article/')) {
    NewsletterViewer.preload();
    try { const id = decodeURIComponent(path.split('/')[2]); if (id) prefetchNewsletter(id); } catch { /* The router handles malformed paths. */ }
  } else if (path === '/community' || path.startsWith('/community/')) {
    CommunityPage.preload();
    const route = parseCommunityRoute(path);
    if (route?.section === 'feed') prefetchCommunityFeed(route.feedTab);
    else if (route?.section === 'post') { CommunityThreadScreen.preload(); prefetchCommunityThread(route.postId); }
    else if (route?.section === 'profile' && route.handle) {
      void fetchCommunityProfile(route.handle).catch(() => {});
      void fetchCommunityProfilePosts(route.handle, { tab: route.profileTab }).catch(() => {});
    }
  } else if (path === '/manager' || path.startsWith('/manager/') || path === '/gantt-editor') {
    ManagerDashboard.preload();
    if (/^\/manager\/(projects|goals|gantt|spreadsheet)$/.test(path)) prepareProjects();
  } else if (path.startsWith('/gantt-editor/')) { GanttEditorPage.preload(); prepareProjects(); }
  else if (path === '/profile') ProfilePage.preload();
  else if (path === '/sign-in' || path === '/signin') SignIn.preload();
  else if (path.startsWith('/reset-password/')) PasswordResetPage.preload();
  else if (path.startsWith('/verify-email/')) VerifyEmailPage.preload();
  else if (path === '/sso-callback') SSOCallback.preload();
  else if (path === '/unsubscribe') UnsubscribePage.preload();
  else if (path === '/migrate') MigratePage.preload();
}
