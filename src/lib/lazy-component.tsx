import { createElement, useEffect, useSyncExternalStore, type ComponentType, type ComponentProps, type ReactNode } from 'react';

/** Share the import promise between pointer-intent preload and rendering. */
// ComponentType uses the same generic constraint as React.lazy. The returned
// component retains the loader's exact props (including editor refs).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyComponent<T extends ComponentType<any>>(loader: () => Promise<{ default: T }>, options: { fallback?: (props: ComponentProps<T>) => ReactNode } = {}) {
  let pending: Promise<{ default: T }> | undefined;
  let state: { component?: T; error?: unknown } = {};
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  const snapshot = () => state;
  const preload = () => pending ??= loader().then((module) => {
    state = { component: module.default }; notify(); return module;
  }).catch((error: unknown) => { pending = undefined; state = { error }; notify(); throw error; });
  function DeferredComponent(props: ComponentProps<T>) {
    // An external-store update commits as soon as the import resolves, without
    // Suspense's minimum fallback delay on first navigation to a screen.
    const loaded = useSyncExternalStore(subscribe, snapshot, snapshot);
    useEffect(() => { void preload().catch(() => { /* Render the error boundary. */ }); }, []);
    if (loaded.error) throw loaded.error;
    return loaded.component ? createElement(loaded.component, props) : options.fallback ? options.fallback(props) : <div aria-busy="true" className="min-h-24 animate-pulse bg-[var(--bg-app)]" />;
  }
  DeferredComponent.preload = () => { void preload().catch(() => { /* Rendering handles failed imports. */ }); };
  return DeferredComponent;
}
