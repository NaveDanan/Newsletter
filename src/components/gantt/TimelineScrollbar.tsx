import { useEffect, useRef, useState, type RefObject } from 'react';

interface TimelineScrollbarProps {
  viewportWidth: number;
  contentWidth: number;
  scrollElementRef: RefObject<HTMLDivElement | null>;
  label: string;
  controls?: string;
}

/** A persistent overlay track, including browsers that hide native scrollbars. */
export function TimelineScrollbar({ viewportWidth, contentWidth, scrollElementRef, label, controls = 'gantt-timeline' }: TimelineScrollbarProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [scrollLeft, setScrollLeft] = useState(0);
  useEffect(() => {
    const element = scrollElementRef.current;
    if (!element) return;
    const update = () => setScrollLeft(element.scrollLeft);
    update();
    element.addEventListener('scroll', update, { passive: true });
    return () => element.removeEventListener('scroll', update);
  }, [scrollElementRef]);
  const drag = useRef<{ x: number; left: number; scale: number } | null>(null);
  const maxScroll = Math.max(0, contentWidth - viewportWidth);
  const trackWidth = Math.max(0, viewportWidth - 8);
  const thumbWidth = Math.min(trackWidth, Math.max(32, trackWidth * viewportWidth / contentWidth));
  const travel = trackWidth - thumbWidth;
  const position = Math.max(0, Math.min(maxScroll, scrollLeft));
  const moveTo = (left: number) => scrollElementRef.current?.scrollTo({ left: Math.max(0, Math.min(maxScroll, left)), behavior: 'instant' });

  if (!maxScroll || trackWidth <= 0) return null;

  return (
    <div
      role="scrollbar"
      aria-label={label}
      aria-controls={controls}
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={Math.round(maxScroll)}
      aria-valuenow={Math.round(position)}
      tabIndex={0}
      data-dragging={isDragging}
      className={`gantt-timeline-scrollbar absolute inset-x-0 bottom-0 z-30 h-5 touch-none rounded-full bg-[var(--bg-app)]/90 px-1 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/gantt:opacity-100 ${isDragging ? 'opacity-100' : ''}`}
      onKeyDown={(event) => {
        const destinations: Record<string, number> = {
          ArrowLeft: scrollLeft - 40, ArrowRight: scrollLeft + 40,
          PageUp: scrollLeft - viewportWidth, PageDown: scrollLeft + viewportWidth,
          Home: 0, End: maxScroll,
        };
        if (event.key in destinations) {
          event.preventDefault();
          moveTo(destinations[event.key]);
        }
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || travel <= 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        const x = event.clientX - event.currentTarget.getBoundingClientRect().left - 4;
        const thumbLeft = travel * scrollLeft / maxScroll;
        const left = x >= thumbLeft && x <= thumbLeft + thumbWidth
          ? scrollLeft
          : Math.max(0, Math.min(maxScroll, (x - thumbWidth / 2) / travel * maxScroll));
        moveTo(left);
        drag.current = { x: event.clientX, left, scale: maxScroll / travel };
        setIsDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (drag.current) moveTo(drag.current.left + (event.clientX - drag.current.x) * drag.current.scale);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onLostPointerCapture={() => { drag.current = null; setIsDragging(false); }}
    >
      <div
        className={`absolute top-1 h-3 rounded-full bg-[var(--text-secondary)] transition-opacity ${isDragging ? 'opacity-100' : 'opacity-[0.45]'}`}
        style={{ width: thumbWidth, left: 4 + travel * position / maxScroll }}
      />
    </div>
  );
}
