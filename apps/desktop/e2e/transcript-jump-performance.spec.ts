import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  approvedJumpLatencyLimitMs,
  attachJumpRendererProbe,
  type RendererJumpMetrics,
} from '../src/ui/transcript-jump-renderer-probe.ts';

interface JumpTrace {
  active: boolean;
  started: number;
  firstScrollMs: number | null;
  firstMutationMs: number | null;
  mutationBatches: number;
  resizeCallbacks: number;
  resizeCallbackMs: number;
  scrollEvents: number;
  scrollPositions: number[];
  playwrightPollObservedMs?: number | null;
  renderer?: RendererJumpMetrics;
}

test('distant jumps in the synthetic 8-hour transcript finish promptly', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'scrb-transcript-jump-'));
  writeFileSync(
    join(userData, 'library-location.json'),
    JSON.stringify({ root: join(userData, 'library') }),
  );
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] });
  try {
    const page = await app.firstWindow();
    await page.evaluate(() =>
      window.scribeBridge?.invoke('updateSettings', { location: { country: 'US', usState: 'NY' } }),
    );
    await page.addInitScript(() => {
      const state = window as Window & { transcriptJumpTrace?: JumpTrace };
      state.transcriptJumpTrace = {
        active: false,
        started: 0,
        firstScrollMs: null,
        firstMutationMs: null,
        mutationBatches: 0,
        resizeCallbacks: 0,
        resizeCallbackMs: 0,
        scrollEvents: 0,
        scrollPositions: [],
      };
      const NativeResizeObserver = window.ResizeObserver;
      window.ResizeObserver = class extends NativeResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          super((entries, observer) => {
            const trace = state.transcriptJumpTrace;
            const started = performance.now();
            callback(entries, observer);
            if (trace?.active) {
              trace.resizeCallbacks += 1;
              trace.resizeCallbackMs += performance.now() - started;
            }
          });
        }
      };
    });
    await page.reload();
    await page.getByRole('button', { name: 'Recordings', exact: true }).click();
    await page.getByRole('button', { name: /Depot rollout planning workshop/ }).click();
    await page.getByRole('tab', { name: 'Transcript' }).waitFor();
    // The 8-hour mock spans several paginated backend replies. Do not time an out-of-range
    // jump while the transcript is still filling in.
    const scroller = page.getByRole('region', { name: 'Transcript' });
    await expect(scroller).toHaveAttribute('aria-busy', 'false');
    const slider = page.getByRole('slider', { name: 'Playback position' });
    await scroller.evaluate((element) => {
      const state = window as Window & { transcriptJumpTrace?: JumpTrace };
      const trace = state.transcriptJumpTrace;
      if (!trace) throw new Error('Jump instrumentation was not installed');
      element.addEventListener('scroll', () => {
        if (!trace.active) return;
        trace.scrollEvents += 1;
        if (trace.firstScrollMs === null) trace.firstScrollMs = performance.now() - trace.started;
      });
      new MutationObserver(() => {
        if (!trace.active) return;
        trace.mutationBatches += 1;
        if (trace.firstMutationMs === null)
          trace.firstMutationMs = performance.now() - trace.started;
      }).observe(element, {
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true,
      });
    });
    const totalMeetingDurationMs = 8 * 60 * 60_000;
    const rendererLimitMs = approvedJumpLatencyLimitMs(totalMeetingDurationMs);
    if (rendererLimitMs === null) throw new Error('Missing approved limit for 8-hour meeting');
    const observations: {
      targetMs: number;
      elapsedMs: number;
      renderer: RendererJumpMetrics | undefined;
    }[] = [];
    for (const targetMs of [30, 59, 242, 470].map((minutes) => minutes * 60_000)) {
      await slider.evaluate((input, value) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, String(value));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, targetMs);
      await scroller.evaluate((el) => {
        el.scrollTop = 0;
        el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 1 }));
        el.dispatchEvent(new Event('scroll'));
      });
      const jump = page.getByRole('button', { name: 'Jump to current position' });
      await expect(jump).toBeVisible();
      await jump.evaluate((button) => {
        const state = window as Window & { transcriptJumpTrace?: JumpTrace };
        const region = document.querySelector('[aria-label="Transcript"]');
        const trace = state.transcriptJumpTrace;
        button.addEventListener(
          'click',
          () => {
            if (!trace || !region) return;
            Object.assign(trace, {
              active: true,
              started: performance.now(),
              firstScrollMs: null,
              firstMutationMs: null,
              mutationBatches: 0,
              resizeCallbacks: 0,
              resizeCallbackMs: 0,
              scrollEvents: 0,
              scrollPositions: [],
              playwrightPollObservedMs: null,
              renderer: undefined,
            });
            let previous = region.scrollTop;
            const sample = () => {
              if (!trace.active) return;
              if (region.scrollTop !== previous) {
                trace.scrollPositions.push(region.scrollTop);
                previous = region.scrollTop;
              }
              requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
          },
          { once: true },
        );
      });
      // A self-contained renderer probe; no production scrolling code is changed.
      await jump.evaluate(attachJumpRendererProbe);
      await jump.click();
      try {
        await expect
          .poll(
            () =>
              page.evaluate(() => {
                const region = document.querySelector('[aria-label="Transcript"]');
                const word = region?.querySelector('[data-ms][aria-current="true"]');
                if (!region || !word) return false;
                const viewport = region.getBoundingClientRect();
                const target = word.getBoundingClientRect();
                return target.top >= viewport.top && target.bottom <= viewport.bottom;
              }),
            { timeout: 5_000 },
          )
          .toBe(true);
        // This is only an upper bound on when Playwright noticed visibility.
        await page.evaluate(() => {
          const trace = (window as Window & { transcriptJumpTrace?: JumpTrace })
            .transcriptJumpTrace;
          if (trace) trace.playwrightPollObservedMs = performance.now() - trace.started;
        });
      } catch (error) {
        console.log(
          JSON.stringify({
            failedTargetMs: targetMs,
            elapsedMs: await page.evaluate(() => {
              const trace = (window as Window & { transcriptJumpTrace?: JumpTrace })
                .transcriptJumpTrace;
              return trace ? performance.now() - trace.started : null;
            }),
            failedState: await page.evaluate(() => {
              const region = document.querySelector<HTMLElement>('[aria-label="Transcript"]');
              const word = region?.querySelector<HTMLElement>('[data-ms][aria-current="true"]');
              const viewport = region?.getBoundingClientRect();
              const target = word?.getBoundingClientRect();
              const trace = (window as Window & { transcriptJumpTrace?: JumpTrace })
                .transcriptJumpTrace;
              return {
                loading: document.body.innerText.includes('Loading the transcript…'),
                sliderValue: document.querySelector<HTMLInputElement>(
                  '[aria-label="Playback position"]',
                )?.value,
                scrollTop: region?.scrollTop,
                scrollHeight: region?.scrollHeight,
                viewportHeight: region?.clientHeight,
                renderedRows: region?.querySelectorAll('[data-row]').length,
                activeRow: word?.closest<HTMLElement>('[data-row]')?.dataset['row'],
                activeWord: word?.textContent,
                wordTop: target?.top,
                wordBottom: target?.bottom,
                viewportTop: viewport?.top,
                viewportBottom: viewport?.bottom,
                firstScrollMs: trace?.firstScrollMs,
                firstMutationMs: trace?.firstMutationMs,
                mutationBatches: trace?.mutationBatches,
                resizeCallbacks: trace?.resizeCallbacks,
                resizeCallbackMs: trace?.resizeCallbackMs,
                scrollEvents: trace?.scrollEvents,
                distinctScrollPositions: trace?.scrollPositions.length,
                renderer: trace?.renderer,
                playwrightPollObservedMs: trace?.playwrightPollObservedMs,
              };
            }),
          }),
        );
        throw error;
      }
      if (targetMs === 242 * 60_000) {
        await expect(page.locator('[data-ms][aria-current="true"]')).toHaveText('extended');
      }
      // Preserve the old clock only for diagnosis. The owner's revised limit is
      // applied to in-renderer stable visibility, not Playwright polling delay.
      const legacyElapsedMs = await page.evaluate(() => {
        const trace = (window as Window & { transcriptJumpTrace?: JumpTrace }).transcriptJumpTrace;
        if (!trace) throw new Error('Jump instrumentation was lost');
        return performance.now() - trace.started;
      });
      try {
        await expect
          .poll(
            () =>
              page.evaluate(() => {
                const trace = (window as Window & { transcriptJumpTrace?: JumpTrace })
                  .transcriptJumpTrace;
                return typeof trace?.renderer?.rendererSettledVisibleMs === 'number';
              }),
            { timeout: 5_000 },
          )
          .toBe(true);
      } catch (error) {
        console.log(
          JSON.stringify({
            unsettledTargetMs: targetMs,
            renderer: await page.evaluate(() => {
              const trace = (window as Window & { transcriptJumpTrace?: JumpTrace })
                .transcriptJumpTrace;
              return trace?.renderer ?? null;
            }),
          }),
        );
        throw error;
      }
      observations.push(
        await page.evaluate(
          ({ targetMs, legacyElapsedMs }) => {
            const state = window as Window & { transcriptJumpTrace?: JumpTrace };
            const trace = state.transcriptJumpTrace;
            if (!trace) throw new Error('Jump instrumentation was lost');
            const elapsedMs = legacyElapsedMs;
            trace.active = false;
            return {
              targetMs,
              elapsedMs,
              firstScrollMs: trace.firstScrollMs,
              firstMutationMs: trace.firstMutationMs,
              mutationBatches: trace.mutationBatches,
              resizeCallbacks: trace.resizeCallbacks,
              resizeCallbackMs: trace.resizeCallbackMs,
              scrollEvents: trace.scrollEvents,
              distinctScrollPositions: trace.scrollPositions.length,
              playwrightPollObservedMs: trace.playwrightPollObservedMs,
              renderer: trace.renderer,
            };
          },
          { targetMs, legacyElapsedMs },
        ),
      );
    }
    console.log(JSON.stringify({ observations }));
    // The eight-hour allowance applies to every offset within this one meeting.
    // Use the measured renderer settling time, never Playwright's later receipt.
    expect(
      observations.every(
        ({ renderer }) =>
          typeof renderer?.rendererSettledVisibleMs === 'number' &&
          renderer.rendererSettledVisibleMs <= rendererLimitMs,
      ),
    ).toBe(true);
  } finally {
    await app.close();
  }
});
