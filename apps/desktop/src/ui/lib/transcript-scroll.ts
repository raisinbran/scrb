/**
 * A bounded ease-in/ease-out transition for explicit transcript jumps and live follow-along.
 * Chromium's native "smooth" scroll has an implementation-defined duration; a distant
 * virtualized transcript jump must still finish within the owner's one-second budget.
 *
 * Returns a cancellation callback while animating, or null for an immediate/reduced-motion move.
 */
export function animateTranscriptScroll(
  element: HTMLElement,
  target: number,
  options: {
    maxDurationMs?: number;
    onPosition?(top: number): void;
    onComplete?(): void;
  } = {},
): (() => void) | null {
  const destination = Math.max(0, target);
  const from = element.scrollTop;
  const distance = destination - from;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  if (reduced || Math.abs(distance) < 1) {
    element.scrollTop = destination;
    options.onPosition?.(element.scrollTop);
    options.onComplete?.();
    return null;
  }

  const duration = Math.min(
    options.maxDurationMs ?? 640,
    Math.max(160, 200 + Math.sqrt(Math.abs(distance)) * 10),
  );
  let frame = 0;
  let startedAt: number | null = null;
  let cancelled = false;
  const step = (now: number) => {
    if (cancelled) return;
    startedAt ??= now;
    const progress = Math.min((now - startedAt) / duration, 1);
    // Cubic easing accelerates and decelerates instead of jumping instantly.
    const eased =
      progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    element.scrollTop = progress === 1 ? destination : from + distance * eased;
    options.onPosition?.(element.scrollTop);
    if (progress < 1) {
      frame = requestAnimationFrame(step);
    } else {
      options.onComplete?.();
    }
  };
  frame = requestAnimationFrame(step);
  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
  };
}
