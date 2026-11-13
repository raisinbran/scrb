/** How long after the mini window minimizes that the app treats focus moving to a main window as a side effect. */
export const MINIMIZE_SETTLE_MS = 750;

/**
 * On macOS, minimizing the mini window makes the app hand the key window to its next window and
 * can raise it. The mini only shows while no main window is in front, so a main window gaining
 * focus right after a minimize was not chosen by the user: it is sent back, and the app's own
 * `activate` is ignored for the same moment.
 */
export function createMinimizeGuard(now: () => number = Date.now) {
  let until = 0;
  const settling = (): boolean => now() < until;
  return {
    minimized(): void {
      until = now() + MINIMIZE_SETTLE_MS;
    },
    /** True when a main window gaining focus now should be sent back. */
    shouldBlurMain: settling,
    /** True when the dock/activate event is the minimize's own side effect. */
    shouldIgnoreActivate: settling,
  };
}
