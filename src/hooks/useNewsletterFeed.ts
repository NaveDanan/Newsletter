import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchNewsletterPage, getCachedNewsletterFeed, rememberNewsletterFeed,
  newsletterFeedKey, type NewsletterFeedPage, type NewsletterFeedQuery,
} from '@/lib/pocketbase/newsletter-feed';
import { readScope } from '@/lib/pocketbase/read-cache';

const EMPTY_PAGE: NewsletterFeedPage = { items: [], nextPage: 1, hasMore: false, totalItems: 0 };

export function useNewsletterFeed(query: NewsletterFeedQuery, enabled = true) {
  const scope = readScope();
  const key = newsletterFeedKey(query);
  const identity = scope + key;
  const [state, setState] = useState(() => ({ identity, page: getCachedNewsletterFeed(query) ?? EMPTY_PAGE, loading: enabled, loadingMore: false, error: null as string | null }));
  if (state.identity !== identity) {
    setState({ identity, page: getCachedNewsletterFeed(query) ?? EMPTY_PAGE, loading: enabled, loadingMore: false, error: null });
  }
  const requestRef = useRef(0);
  const pendingRef = useRef(false);
  const failedPageRef = useRef(1);
  const activeIdentityRef = useRef(identity);
  const search = query.search;
  const tab = query.tab;

  const load = useCallback(async (pageNumber: number, force = false) => {
    // Guard synchronously: observer and button events can arrive before React
    // commits the loading state.
    if (!enabled || pendingRef.current || activeIdentityRef.current !== identity || readScope() !== scope) return;
    pendingRef.current = true;
    const requestId = ++requestRef.current;
    setState(current => current.identity === identity ? { ...current, loading: pageNumber === 1, loadingMore: pageNumber > 1, error: null } : current);
    try {
      const next = await fetchNewsletterPage({ search, tab }, pageNumber, force);
      if (requestRef.current !== requestId || readScope() !== scope) return;
      setState(current => {
        if (current.identity !== identity) return current;
        let page = next;
        if (pageNumber > 1) {
          const seen = new Set(current.page.items.map(item => item.id));
          page = { ...next, items: current.page.items.concat(next.items.filter(item => !seen.has(item.id))) };
        } else if (!force && current.page.nextPage > 2 && next.totalItems === current.page.totalItems && next.items.length > 0 && next.items.every((item, i) => current.page.items[i]?.id === item.id)) {
          // Back keeps the already loaded pages when the newest batch is stable.
          page = { ...current.page, items: next.items.concat(current.page.items.slice(next.items.length)), totalItems: next.totalItems };
        }
        return { identity, page, loading: false, loadingMore: false, error: null };
      });
    } catch (error) {
      if (requestRef.current === requestId && readScope() === scope) {
        failedPageRef.current = pageNumber;
        setState(current => current.identity === identity ? { ...current, loading: false, loadingMore: false, error: error instanceof Error ? error.message : 'Failed to load newsletters' } : current);
      }
    } finally {
      if (requestRef.current === requestId) pendingRef.current = false;
    }
  }, [enabled, identity, scope, search, tab]);

  useEffect(() => {
    activeIdentityRef.current = identity;
    if (enabled) void load(1);
    const requests = requestRef, pending = pendingRef;
    return () => { requests.current++; pending.current = false; };
  }, [enabled, identity, load]);

  useEffect(() => {
    if (enabled && !state.loading && !state.loadingMore && !state.error && state.identity === identity && scope === readScope() && state.page.nextPage > 1) {
      rememberNewsletterFeed({ search, tab }, state.page);
    }
  }, [enabled, identity, scope, search, state, tab]);

  const loadMore = useCallback(() => {
    if (state.page.hasMore && !state.loading && !state.loadingMore && !state.error) void load(state.page.nextPage);
  }, [load, state]);
  const retry = useCallback(() => load(failedPageRef.current, true), [load]);
  const refresh = useCallback(() => load(1, true), [load]);

  return { newsletters: state.page.items, totalItems: state.page.totalItems, hasMore: state.page.hasMore, isLoading: state.loading && state.page.items.length === 0, isLoadingMore: state.loadingMore, error: state.error, loadMore, retry, refresh };
}
