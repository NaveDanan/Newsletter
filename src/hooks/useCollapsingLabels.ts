import { useLayoutEffect, useRef, type RefObject } from 'react';

const FIT_TOLERANCE_PX = 2;
const LABEL_SELECTOR = '[data-collapse-order]';
const SLACK_SELECTOR = '[data-collapse-slack]';

/** The label's full width, whether or not it is currently folded. */
function naturalWidth(label: HTMLElement): number {
  const clip = label.firstElementChild;
  return clip instanceof HTMLElement ? clip.scrollWidth : 0;
}

/**
 * How far the bar's in-flow children spill past its content box. Unlike
 * `scrollWidth`, this ignores out-of-flow descendants such as open dropdown
 * panels, which would otherwise read as overflow and fold every label.
 */
function inFlowOverflow(bar: HTMLElement): number {
  const style = getComputedStyle(bar);
  const box = bar.getBoundingClientRect();
  const contentStart = box.left + bar.clientLeft + parseFloat(style.paddingLeft);
  const contentEnd = box.left + bar.clientLeft + bar.clientWidth - parseFloat(style.paddingRight);

  let start = contentStart;
  let end = contentEnd;
  for (const child of bar.children) {
    if (!(child instanceof HTMLElement)) {
      continue;
    }
    const { position, display } = getComputedStyle(child);
    if (display === 'none' || position === 'absolute' || position === 'fixed') {
      continue;
    }
    const rect = child.getBoundingClientRect();
    start = Math.min(start, rect.left);
    end = Math.max(end, rect.right);
  }

  return Math.max(0, end - start - (contentEnd - contentStart));
}

/**
 * Folds a bar's labels down to their icons, lowest `data-collapse-order`
 * first, until the content fits, and unfolds them as room returns. The level is
 * written to `data-collapse` on the bar and the CSS animates each label.
 *
 * It measures instead of using breakpoints because the bar's content varies
 * (admin-managed menus, Hebrew vs English labels). Contract: every flexible gap
 * is a `[data-collapse-slack]` spacer and nothing else in the bar shrinks. Then
 * "spare room + current label widths" stays constant while labels animate, so
 * the chosen level never oscillates mid-transition.
 */
export function useCollapsingLabels(
  barRef: RefObject<HTMLElement | null>,
  levels: number,
  onLevelChange?: (level: number) => void,
) {
  const onLevelChangeRef = useRef(onLevelChange);

  useLayoutEffect(() => {
    onLevelChangeRef.current = onLevelChange;
  });

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) {
      return undefined;
    }

    const measure = () => {
      const labels = [...bar.querySelectorAll<HTMLElement>(LABEL_SELECTOR)];
      const slack = [...bar.querySelectorAll<HTMLElement>(SLACK_SELECTOR)]
        .reduce((sum, spacer) => sum + spacer.getBoundingClientRect().width, 0);
      const overflow = inFlowOverflow(bar);
      const budget = slack - overflow
        + labels.reduce((sum, label) => sum + label.getBoundingClientRect().width, 0);

      let level = 0;
      while (level < levels) {
        const needed = labels
          .filter((label) => Number(label.dataset.collapseOrder) > level)
          .reduce((sum, label) => sum + naturalWidth(label), 0);
        if (needed <= budget + FIT_TOLERANCE_PX) {
          break;
        }
        level += 1;
      }

      const next = String(level);
      if (bar.dataset.collapse !== next) {
        bar.dataset.collapse = next;
        onLevelChangeRef.current?.(level);
      }
    };

    // Measuring inside the observer callback would resize what it observes in
    // the same frame, so it is deferred to the next one.
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    const resizeObserver = new ResizeObserver(schedule);
    const observeAll = () => {
      resizeObserver.disconnect();
      resizeObserver.observe(bar);
      [...bar.children, ...bar.querySelectorAll(`${SLACK_SELECTOR}, ${LABEL_SELECTOR} > * > *`)]
        .forEach((element) => resizeObserver.observe(element));
    };
    const mutationObserver = new MutationObserver(() => {
      observeAll();
      schedule();
    });

    measure();
    observeAll();
    mutationObserver.observe(bar, { childList: true, subtree: true });
    // The first level is applied without animation; transitions start after it.
    const readyFrame = requestAnimationFrame(() => {
      bar.dataset.ready = 'true';
    });

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(readyFrame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [barRef, levels]);
}
