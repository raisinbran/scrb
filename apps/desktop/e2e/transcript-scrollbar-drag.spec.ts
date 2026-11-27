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

      // The thumb is a native control, so its place is derived from the scroll position. Its
      // length only shifts the result by half of itself, which the tolerance covers.
      const thumb = () =>
        scroller.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          const track = el.clientHeight;
          const length = Math.max((track * track) / el.scrollHeight, 20);
          const range = el.scrollHeight - track;
          const fraction = range > 0 ? el.scrollTop / range : 0;
          return {
            x: rect.right - 3,
            top: rect.top,
            bottom: rect.top + track,
            length,
            centre: rect.top + length / 2 + fraction * (track - length),
          };
        });

      // Overlay scrollbars only exist while the pointer is over the list.
      const box = await scroller.boundingBox();
      if (!box) throw new Error('Transcript has no box');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, 30);
      await page.waitForTimeout(300);

      const start = await thumb();
      const end = start.bottom - start.length / 2;
      await page.mouse.move(start.x, start.centre);
      await page.mouse.down();
      let worst = 0;
      for (let step = 1; step <= STEPS; step += 1) {
        const y = start.centre + ((end - start.centre) * step) / STEPS;
        await page.mouse.move(start.x, y);
        await page.waitForTimeout(40);
        worst = Math.max(worst, Math.abs((await thumb()).centre - y));
      }
      await page.mouse.up();
      expect(worst).toBeLessThanOrEqual(MAX_OFFSET_PX);
    } finally {
      await app.close();
    }
  });
}
