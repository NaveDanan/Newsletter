// Injected only by the benchmark server, before the application starts.
(() => {
  performance.setResourceTimingBufferSize(3000);
  const tasks = [];
  try { new PerformanceObserver((list) => tasks.push(...list.getEntries().map((e) => ({ start: e.startTime, duration: e.duration })))).observe({ type: 'longtask', buffered: true }); } catch { /* Unsupported browser. */ }
  const selector = () => {
    if (location.pathname.startsWith('/article/')) return '.newsletter-article';
    if (location.pathname.startsWith('/community')) return 'main article';
    if (location.pathname === '/manager/projects') return 'main h3.font-semibold';
    if (location.pathname === '/manager/goals') return 'main h3.truncate';
    if (location.pathname === '/manager/gantt') return 'main button[dir="auto"]';
    if (location.pathname === '/manager/spreadsheet') return 'main tbody tr.cursor-pointer';
    return '#workflows .feed-post-card';
  };
  const afterPaint = (done) => requestAnimationFrame(() => requestAnimationFrame(done));
  const wait = (target, start) => new Promise((resolve, reject) => {
    const check = () => {
      const node = document.querySelector(target);
      if (!node || !node.textContent.trim()) return;
      observer.disconnect(); clearTimeout(timeout);
      afterPaint(() => resolve(Math.round(performance.now() - start)));
    };
    const observer = new MutationObserver(check);
    observer.observe(document, { subtree: true, childList: true, characterData: true });
    const timeout = setTimeout(() => { observer.disconnect(); reject(new Error('Content did not appear: ' + target)); }, 20000);
    check();
  });
  window.__PERF__ = { readyMs: null };
  document.addEventListener('DOMContentLoaded', () => { wait(selector(), 0).then((ms) => { window.__PERF__.readyMs = ms; }).catch((error) => { window.__PERF__.error = error.message; }); });
  window.__measureNavigation = (action, target) => {
    const start = performance.now();
    action();
    return wait(target, start);
  };
  window.__readPerformance = () => ({
    path: location.pathname,
    readyMs: window.__PERF__.readyMs,
    error: window.__PERF__.error,
    paint: performance.getEntriesByType('paint').map((e) => ({ name: e.name, ms: Math.round(e.startTime) })),
    jsBytes: performance.getEntriesByType('resource').filter((e) => new URL(e.name).pathname.endsWith('.js')).reduce((sum, e) => sum + e.decodedBodySize, 0),
    requests: performance.getEntriesByType('resource').length,
    api: performance.getEntriesByType('resource').filter((e) => e.name.includes('/api/')).map((e) => ({ path: new URL(e.name).pathname, ms: Math.round(e.duration), bytes: e.decodedBodySize })),
    longTasks: tasks.filter((e) => e.duration >= 50).map((e) => ({ start: Math.round(e.start), ms: Math.round(e.duration) })),
  });
})();
