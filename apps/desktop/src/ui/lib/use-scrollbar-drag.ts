import { useEffect, useState, type PointerEvent } from 'react';

/**
 * Chromium maps a held scrollbar thumb to the scroll range as it is when each pointer move is
 * handled, so a range that keeps changing (estimated rows replaced by measured ones) makes the
 * thumb lag far behind the pointer. This reports whether the thumb is held and returns the size
 * `value` had when the press began, so a caller can keep its scroll range still until release.
 */
export function useScrollbarDrag(value: number) {
  const [frozen, setFrozen] = useState<number | null>(null);
  const dragging = frozen !== null;
  useEffect(() => {
    if (!dragging) return undefined;
    const release = () => setFrozen(null);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('mouseup', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('mouseup', release);
    };
  }, [dragging]);
  return {
    dragging,
    value: frozen ?? value,
    // A press on the scroller itself, not on a row, is a press on its scrollbar.
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.target === event.currentTarget) setFrozen(value);
    },
  };
}
