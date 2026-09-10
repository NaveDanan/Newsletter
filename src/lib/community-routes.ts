import {
  COMMUNITY_FEED_TABS,
  COMMUNITY_PROFILE_TABS,
  COMMUNITY_SEARCH_TYPES,
  type CommunityFeedTab,
  type CommunityProfileTab,
  type CommunitySearchType,
} from '@/types/community';

// The app router in src/App.tsx matches on window.location.pathname alone, so
// every piece of community state that should survive a reload or a shared link
// lives in a path segment rather than a query string.

export const COMMUNITY_ROOT = '/community';

export type CommunitySection =
  | 'feed'
  | 'post'
  | 'profile'
  | 'connections'
  | 'notifications'
  | 'bookmarks'
  | 'search'
  | 'hashtag';

export interface CommunityRoute {
  section: CommunitySection;
  /** The canonical path for this state, which App replaces the URL with. */
  pathname: string;
  feedTab: CommunityFeedTab;
  profileTab: CommunityProfileTab;
  searchType: CommunitySearchType;
  direction: 'followers' | 'following';
  postId: string;
  handle: string;
  tag: string;
  query: string;
}

const DEFAULT_ROUTE: CommunityRoute = {
  section: 'feed',
  pathname: COMMUNITY_ROOT,
  feedTab: 'for-you',
  profileTab: 'posts',
  searchType: 'posts',
  direction: 'followers',
  postId: '',
  handle: '',
  tag: '',
  query: '',
};

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function communityFeedPath(tab: CommunityFeedTab = 'for-you'): string {
  return tab === 'for-you' ? COMMUNITY_ROOT : `${COMMUNITY_ROOT}/${tab}`;
}

export function communityPostPath(postId: string): string {
  return `${COMMUNITY_ROOT}/post/${encodeURIComponent(postId)}`;
}

export function communityProfilePath(handle: string, tab: CommunityProfileTab = 'posts'): string {
  const base = `${COMMUNITY_ROOT}/u/${encodeURIComponent(handle)}`;
  return tab === 'posts' ? base : `${base}/${tab}`;
}

export function communityConnectionsPath(handle: string, direction: 'followers' | 'following'): string {
  return `${COMMUNITY_ROOT}/u/${encodeURIComponent(handle)}/${direction}`;
}

export function communityHashtagPath(tag: string): string {
  return `${COMMUNITY_ROOT}/tag/${encodeURIComponent(tag)}`;
}

export function communitySearchPath(query: string, type: CommunitySearchType = 'posts'): string {
  const trimmed = query.trim();

  if (trimmed) {
    return `${COMMUNITY_ROOT}/search/${type}/${encodeURIComponent(trimmed)}`;
  }

  // Switching tabs before typing anything still has to keep the tab, because the
  // canonical pathname is what App replaces the URL with and what the screen
  // reads its state back out of.
  return type === 'posts' ? `${COMMUNITY_ROOT}/search` : `${COMMUNITY_ROOT}/search/${type}`;
}

export function communityNotificationsPath(): string {
  return `${COMMUNITY_ROOT}/notifications`;
}

export function communityBookmarksPath(): string {
  return `${COMMUNITY_ROOT}/bookmarks`;
}

// Returns null for anything outside /community so App can fall through to its
// other routes.
export function parseCommunityRoute(pathname: string): CommunityRoute | null {
  if (pathname !== COMMUNITY_ROOT && !pathname.startsWith(`${COMMUNITY_ROOT}/`)) {
    return null;
  }

  const segments = pathname.slice(COMMUNITY_ROOT.length).split('/').filter(Boolean);

  if (segments.length === 0) {
    return DEFAULT_ROUTE;
  }

  const [head, ...rest] = segments;

  if ((COMMUNITY_FEED_TABS as readonly string[]).includes(head)) {
    const feedTab = head as CommunityFeedTab;
    return { ...DEFAULT_ROUTE, feedTab, pathname: communityFeedPath(feedTab) };
  }

  if (head === 'post' && rest[0]) {
    const postId = decode(rest[0]);
    return { ...DEFAULT_ROUTE, section: 'post', postId, pathname: communityPostPath(postId) };
  }

  if (head === 'u' && rest[0]) {
    const handle = decode(rest[0]).toLowerCase();
    const modifier = rest[1] ?? '';

    if (modifier === 'followers' || modifier === 'following') {
      return {
        ...DEFAULT_ROUTE,
        section: 'connections',
        handle,
        direction: modifier,
        pathname: communityConnectionsPath(handle, modifier),
      };
    }

    const profileTab = (COMMUNITY_PROFILE_TABS as readonly string[]).includes(modifier)
      ? (modifier as CommunityProfileTab)
      : 'posts';

    return {
      ...DEFAULT_ROUTE,
      section: 'profile',
      handle,
      profileTab,
      pathname: communityProfilePath(handle, profileTab),
    };
  }

  if (head === 'tag' && rest[0]) {
    const tag = decode(rest[0]).toLowerCase();
    return { ...DEFAULT_ROUTE, section: 'hashtag', tag, pathname: communityHashtagPath(tag) };
  }

  if (head === 'search') {
    const searchType = (COMMUNITY_SEARCH_TYPES as readonly string[]).includes(rest[0] ?? '')
      ? (rest[0] as CommunitySearchType)
      : 'posts';
    const query = rest[1] ? decode(rest[1]) : '';
    return {
      ...DEFAULT_ROUTE,
      section: 'search',
      searchType,
      query,
      pathname: communitySearchPath(query, searchType),
    };
  }

  if (head === 'notifications') {
    return { ...DEFAULT_ROUTE, section: 'notifications', pathname: communityNotificationsPath() };
  }

  if (head === 'bookmarks') {
    return { ...DEFAULT_ROUTE, section: 'bookmarks', pathname: communityBookmarksPath() };
  }

  return DEFAULT_ROUTE;
}
