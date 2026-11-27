import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Dragging the scrollbar thumb of the synthetic 8-hour transcript must keep the thumb under the
// pointer while measured row heights replace the estimated ones.
const MAX_OFFSET_PX = 12;
const STEPS = 40;

for (const [width, height] of [
  [1280, 800],
  [1000, 640],
]) {
  test(`transcript scrollbar thumb follows the pointer (${width}x${height})`, async () => {
    const userData = mkdtempSync(join(tmpdir(), 'scrb-transcript-drag-'));
    writeFileSync(
      join(userData, 'library-location.json'),
      JSON.stringify({ root: join(userData, 'library') }),
    );
    const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] });
    try {
      await app.evaluate(
        ({ BrowserWindow }, size) => {
          BrowserWindow.getAllWindows()[0]?.setContentSize(size[0] ?? 1280, size[1] ?? 800);
        },
        [width, height],
      );
      const page = await app.firstWindow();
      await page.evaluate(() =>
        window.scribeBridge?.invoke('updateSettings', {
          location: { country: 'US', usState: 'NY' },
        }),
      );
      await page.reload();
      await page.getByRole('button', { name: 'Recordings', exact: true }).click();
      await page.getByRole('button', { name: /Depot rollout planning workshop/ }).click();
      const scroller = page.getByRole('region', { name: 'Transcript' });
      await expect(scroller).toHaveAttribute('aria-busy', 'false');

      // The thumb is native, and its size and arrow buttons differ by platform, so the transcript
      // is compared with a plain scroller of the same box and height dragged the same way: both
      // must be scrolled to the same fraction by the same pointer positions.
      const box = await scroller.boundingBox();
      if (!box) throw new Error('Transcript has no box');
      const drag = async (target: typeof scroller) => {
        const g = await target.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          const bar = (el as HTMLElement).offsetWidth - el.clientWidth;
          return {
            x: rect.right - (bar > 0 ? bar / 2 : 3),
            top: rect.top + bar,
            bottom: rect.top + el.clientHeight - bar,
            track: el.clientHeight,
          };
        });
        const fraction = () =>
          target.evaluate((el) => el.scrollTop / (el.scrollHeight - el.clientHeight));
        // Overlay scrollbars only exist while the pointer is over the list.
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, 30);
        await page.waitForTimeout(300);
        await page.mouse.move(g.x, g.top + 10);
        await page.mouse.down();
        const fractions: number[] = [];
        for (let step = 1; step <= STEPS; step += 1) {
          await page.mouse.move(g.x, g.top + 10 + ((g.bottom - g.top - 14) * step) / STEPS);
          await page.waitForTimeout(40);
          fractions.push(await fraction());
        }
        await page.mouse.up();
        return { fractions, track: g.track };
      };

      const scrollHeight = await scroller.evaluate((el) => el.scrollHeight);
      await page.evaluate(
        ({ rect, height }) => {
          const control = document.createElement('div');
          control.id = 'drag-control';
          control.style.cssText = `position:fixed;z-index:99999;overflow-y:auto;background:#fff;left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px`;
          control.innerHTML = `<div style="height:${height}px"></div>`;
          document.body.append(control);
        },
        { rect: box, height: scrollHeight },
      );
      const reference = await drag(page.locator('#drag-control'));
      await page.evaluate(() => document.getElementById('drag-control')?.remove());
      expect(reference.fractions.at(-1)).toBeGreaterThan(0.8);

      const actual = await drag(scroller);
      const worst = Math.max(
        ...actual.fractions.map(
          (f, i) => Math.abs(f - (reference.fractions[i] ?? 0)) * actual.track,
        ),
      );
      expect(worst).toBeLessThanOrEqual(MAX_OFFSET_PX);
    } finally {
      await app.close();
    }
  });
}
