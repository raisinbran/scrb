import { useEffect, useRef, useState } from 'react';

const DELAY_MS = 400;

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/**
 * A title cut off with an ellipsis scrolls sideways to show the rest after the pointer or keyboard
 * focus has rested on its row for a moment, and scrolls back when it leaves. Reduced motion never
 * scrolls (the caller shows the full title in a tooltip instead). The element's size never changes.
 */
export function useTitleScroll<T extends HTMLElement>() {
  const element = useRef<T>(null);
  const [hot, setHot] = useState(false);

  useEffect(() => {
    const target = element.current;
    if (!target || prefersReducedMotion()) return;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const animate = (to: number) => {
      const from = target.scrollLeft;
      const distance = Math.abs(to - from);
      if (distance < 1) return;
      const duration = Math.min(4000, Math.max(500, distance * 18));
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        target.scrollLeft = from + (to - from) * eased;
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };
    if (hot) {
      timer = setTimeout(() => animate(target.scrollWidth - target.clientWidth), DELAY_MS);
    } else {
      animate(0);
    }
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [hot]);

  return {
    element,
    hotHandlers: {
      onMouseEnter: () => setHot(true),
      onMouseLeave: () => setHot(false),
      onFocus: () => setHot(true),
      onBlur: () => setHot(false),
    },
  };
}
