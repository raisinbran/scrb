/** How long the mini window takes to fade in or out. */
export const FADE_MS = 180;
const STEP_MS = 16;

/**
 * Steps a window's opacity from one value to another, then calls `done`. With reduced motion it
 * jumps straight to the end. Returns a cancel function that stops the steps without calling `done`.
 */
export function fadeOpacity(options: {
  setOpacity: (value: number) => void;
  from: number;
  to: number;
  reducedMotion: boolean;
  done?: () => void;
  durationMs?: number;
}): () => void {
  const { setOpacity, from, to, reducedMotion, done, durationMs = FADE_MS } = options;
  if (reducedMotion) {
    setOpacity(to);
    done?.();
    return () => undefined;
  }
  const start = Date.now();
  setOpacity(from);
  const timer = setInterval(() => {
    const t = Math.min(1, (Date.now() - start) / durationMs);
    // Ease out: quick at first, settling gently.
    const eased = 1 - (1 - t) * (1 - t);
    setOpacity(from + (to - from) * eased);
    if (t >= 1) {
      clearInterval(timer);
      done?.();
    }
  }, STEP_MS);
  return () => clearInterval(timer);
}
