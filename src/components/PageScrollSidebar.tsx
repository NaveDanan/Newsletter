import { useLayoutEffect, useRef, type ReactNode } from 'react';

export function PageScrollSidebar({ children }: { children: ReactNode }) {
  const sidebarRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    const updateHeight = () => {
      sidebar.style.setProperty('--sidebar-height', `${sidebar.getBoundingClientRect().height}px`);
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(sidebar);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={sidebarRef}
      // Tall sidebars follow the page until their bottom clears the viewport;
      // short sidebars stop below the header. Neither needs its own scroll area.
      className="lg:col-span-4 lg:sticky lg:top-[min(5rem,calc(100dvh_-_var(--sidebar-height,0px)_-_1rem))]"
    >
      {children}
    </div>
  );
}
