import { preloadRoute } from './preload-route';

/** Prepare the two likely next screens after the home page has settled. */
export function warmHomeNavigation(featuredArticleId: string): () => void {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return () => {};
  let cancelled = false;
  let idle: number | undefined;
  const prepare = () => {
    if (cancelled) return;
    preloadRoute(`/article/${encodeURIComponent(featuredArticleId)}`);
    preloadRoute('/community');
  };
  const timer = window.setTimeout(() => {
    if (window.requestIdleCallback) idle = window.requestIdleCallback(prepare, { timeout: 2_000 });
    else prepare();
  }, 400);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback(idle);
  };
}
