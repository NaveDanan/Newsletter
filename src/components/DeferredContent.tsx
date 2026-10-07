import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Mount expensive below-the-fold content before it enters the scrollport. */
export function DeferredContent({ children, minHeight = 200 }: { children: ReactNode; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (visible) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '600px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);
  return <div ref={ref} style={visible ? undefined : { minHeight }}>{visible ? children : null}</div>;
}
