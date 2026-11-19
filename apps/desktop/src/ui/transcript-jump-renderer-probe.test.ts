import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attachJumpRendererProbe,
  type RendererJumpMetrics,
} from './transcript-jump-renderer-probe.ts';

interface FakeTrace {
  active: boolean;
  started: number;
  mutationBatches: number;
  playwrightPollObservedMs?: number;
  renderer?: RendererJumpMetrics;
}

function syntheticTranscript() {
  const region = document.createElement('section');
  region.setAttribute('aria-label', 'Transcript');
  const row = document.createElement('div');
  row.dataset['row'] = 'invented';
  const word = document.createElement('span');
  word.dataset['ms'] = '1800000';
  word.setAttribute('aria-current', 'true');
  row.append(word);
  region.append(row);
  const button = document.createElement('button');
  document.body.append(region, button);

  let wordTop = 240;
  vi.spyOn(region, 'getBoundingClientRect').mockImplementation(
    () => ({ top: 0, bottom: 200 }) as DOMRect,
  );
  vi.spyOn(word, 'getBoundingClientRect').mockImplementation(
    () => ({ top: wordTop, bottom: wordTop + 20 }) as DOMRect,
  );

  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  const trace: FakeTrace = { active: true, started: 0, mutationBatches: 0 };
  (window as Window & { transcriptJumpTrace?: FakeTrace }).transcriptJumpTrace = trace;
  attachJumpRendererProbe(button);
  button.click();

  return {
    region,
    trace,
    setWordTop(value: number) {
      wordTop = value;
    },
    frame(timeMs: number) {
      const callback = frames.shift();
      if (!callback) throw new Error('No invented animation frame is queued');
      callback(timeMs);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (window as Window & { transcriptJumpTrace?: FakeTrace }).transcriptJumpTrace;
  document.body.replaceChildren();
});

describe('renderer transcript-jump timing probe (invented transcript)', () => {
  it('keeps renderer completion separate from delayed Playwright observation', () => {
    const probe = syntheticTranscript();
    probe.frame(10);
    probe.setWordTop(100);
    probe.region.scrollTop = 180;
    probe.frame(80);
    probe.frame(130);
    probe.frame(180);
    probe.frame(240);
    const metrics = probe.trace.renderer;
    expect(metrics?.firstTargetRowRenderedMs).toBe(10);
    expect(metrics?.rendererFirstVisibleMs).toBe(80);
    expect(metrics?.rendererSettledVisibleMs).toBe(240);

    // A fictional host polling delay must not rewrite the in-renderer timestamp.
    probe.trace.playwrightPollObservedMs = 1_200;
    expect(probe.trace.playwrightPollObservedMs).toBeGreaterThan(1_000);
    expect(metrics?.rendererSettledVisibleMs).toBeLessThan(1_000);
  });

  it('does not treat transient visibility during scrolling as completion', () => {
    const probe = syntheticTranscript();
    probe.setWordTop(100);
    probe.frame(10);
    probe.region.scrollTop = 25;
    probe.frame(70);
    probe.region.scrollTop = 50;
    probe.frame(130);
    probe.region.scrollTop = 75;
    probe.frame(190);
    expect(probe.trace.renderer?.rendererFirstVisibleMs).toBe(10);
    expect(probe.trace.renderer?.rendererSettledVisibleMs).toBeNull();

    probe.frame(250);
    probe.frame(310);
    probe.frame(370);
    expect(probe.trace.renderer?.rendererSettledVisibleMs).toBe(370);

    // Continued movement revokes an earlier apparently stable completion.
    probe.region.scrollTop = 95;
    probe.frame(420);
    expect(probe.trace.renderer?.rendererSettledVisibleMs).toBeNull();
    expect(probe.trace.renderer?.settledInvalidations).toBe(1);
    expect(probe.trace.renderer?.lastScrollMs).toBe(420);
  });
});
