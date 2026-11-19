/**
 * Test-only renderer timing probe. Playwright serializes this entire function into Electron;
 * keep it self-contained (no runtime references to imported helpers/constants).
 */
export interface RendererJumpMetrics {
  firstTargetRowRenderedMs: number | null;
  rendererFirstVisibleMs: number | null;
  rendererSettledVisibleMs: number | null;
  lastVisibleMs: number | null;
  lastScrollMs: number | null;
  rafFrames: number;
  maxRafGapMs: number;
  rafGapsOver50Ms: number;
  settledInvalidations: number;
}

/**
 * Owner-approved Jump to Live limits are keyed by TOTAL meeting duration, not
 * the offset of the target word within a longer meeting.
 *
 * Only the explicitly defined <=1h and eight-hour endpoints are encoded here;
 * intermediate durations require a separate accepted requirement.
 */
export function approvedJumpLatencyLimitMs(totalMeetingDurationMs: number): number | null {
  const hourMs = 60 * 60_000;
  if (!Number.isFinite(totalMeetingDurationMs) || totalMeetingDurationMs <= 0) {
    throw new RangeError('Total meeting duration must be positive and finite');
  }
  if (totalMeetingDurationMs <= hourMs) return 500;
  if (totalMeetingDurationMs === 8 * hourMs) return 1_500;
  return null;
}

export function attachJumpRendererProbe(button: HTMLElement): void {
  button.addEventListener(
    'click',
    () => {
      const state = window as Window & {
        transcriptJumpTrace?: {
          active: boolean;
          started: number;
          mutationBatches: number;
          renderer?: RendererJumpMetrics;
        };
      };
      const trace = state.transcriptJumpTrace;
      const region = document.querySelector<HTMLElement>('[aria-label="Transcript"]');
      if (!trace?.active || !region) return;

      const metrics: RendererJumpMetrics = {
        firstTargetRowRenderedMs: null,
        rendererFirstVisibleMs: null,
        rendererSettledVisibleMs: null,
        lastVisibleMs: null,
        lastScrollMs: null,
        rafFrames: 0,
        maxRafGapMs: 0,
        rafGapsOver50Ms: 0,
        settledInvalidations: 0,
      };
      trace.renderer = metrics;

      let previousFrame: number | null = null;
      let previousScroll: number | null = null;
      let previousTarget: HTMLElement | null = null;
      let previousTop: number | null = null;
      let previousBottom: number | null = null;
      let previousMutationCount = trace.mutationBatches;
      let stableSince: number | null = null;
      let stableFrames = 0;

      const sample = (frameTime: number): void => {
        if (!trace.active) return;
        metrics.rafFrames += 1;
        if (previousFrame !== null) {
          const gap = frameTime - previousFrame;
          metrics.maxRafGapMs = Math.max(metrics.maxRafGapMs, gap);
          if (gap > 50) metrics.rafGapsOver50Ms += 1;
        }
        previousFrame = frameTime;

        const target = region.querySelector<HTMLElement>('[data-ms][aria-current="true"]');
        const targetRect = target?.getBoundingClientRect();
        const viewport = region.getBoundingClientRect();
        const visible =
          targetRect !== undefined &&
          targetRect.top >= viewport.top &&
          targetRect.bottom <= viewport.bottom;
        const sinceClick = frameTime - trace.started;

        if (target?.closest('[data-row]') && metrics.firstTargetRowRenderedMs === null) {
          metrics.firstTargetRowRenderedMs = sinceClick;
        }
        if (visible) {
          if (metrics.rendererFirstVisibleMs === null) {
            metrics.rendererFirstVisibleMs = sinceClick;
          }
          metrics.lastVisibleMs = sinceClick;
        }

        const scrollChanged =
          previousScroll !== null && Math.abs(region.scrollTop - previousScroll) > 0.5;
        const targetChanged = previousTarget !== target;
        const positionChanged =
          targetRect !== undefined &&
          previousTop !== null &&
          previousBottom !== null &&
          (Math.abs(targetRect.top - previousTop) > 0.5 ||
            Math.abs(targetRect.bottom - previousBottom) > 0.5);
        const mutationsOccurred = trace.mutationBatches !== previousMutationCount;
        const unstable =
          !visible || scrollChanged || targetChanged || positionChanged || mutationsOccurred;

        if (scrollChanged) metrics.lastScrollMs = sinceClick;
        if (unstable) {
          if (metrics.rendererSettledVisibleMs !== null) {
            metrics.settledInvalidations += 1;
            metrics.rendererSettledVisibleMs = null;
          }
          stableSince = null;
          stableFrames = 0;
        } else {
          if (stableSince === null) stableSince = frameTime;
          stableFrames += 1;
          // At least three consecutive frames and 100 ms without a scroll,
          // target-rectangle change, or transcript DOM mutation.
          if (
            stableFrames >= 3 &&
            frameTime - stableSince >= 100 &&
            metrics.rendererSettledVisibleMs === null
          ) {
            metrics.rendererSettledVisibleMs = sinceClick;
          }
        }

        previousScroll = region.scrollTop;
        previousTarget = target;
        previousTop = targetRect?.top ?? null;
        previousBottom = targetRect?.bottom ?? null;
        previousMutationCount = trace.mutationBatches;
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    },
    { once: true },
  );
}
