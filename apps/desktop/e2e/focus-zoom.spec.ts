import { _electron as electron, expect, test, type Page, type Locator } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function inspectLayout(page: Page, label: string) {
  const dimensions = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    const body = document.body;
    const controls = [...main.querySelectorAll<HTMLElement>('button,input,select,textarea')].filter(
      (el) => el.getClientRects().length > 0,
    );
    const clipped = controls
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.left < (el.closest('[role="dialog"]') ? 0 : main.getBoundingClientRect().left) - 1 ||
          r.right > innerWidth + 1
        );
      })
      .map((el) => el.getAttribute('aria-label') ?? el.textContent?.trim());
    return {
      viewport: [innerWidth, innerHeight],
      body: [body.scrollWidth, body.clientWidth],
      main: [main.scrollWidth, main.clientWidth],
      clipped,
    };
  });
  console.log(label, JSON.stringify(dimensions));
  expect(dimensions.body[0]).toBeLessThanOrEqual(dimensions.body[1]! + 1);
  expect(dimensions.main[0]).toBeLessThanOrEqual(dimensions.main[1]! + 1);
  expect(dimensions.clipped).toEqual([]);
  if (process.env['SCRB_SCREENSHOT_DIR']) {
    await page.screenshot({ path: join(process.env['SCRB_SCREENSHOT_DIR'], `${label}.png`) });
  }
}

async function expectPanelHeight(page: Page, selector: string, minimum: number) {
  const height = await page
    .locator(selector)
    .first()
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(height, selector).toBeGreaterThanOrEqual(minimum);
}

async function reachByKeyboard(page: Page, target: Locator) {
  for (let step = 0; step < 80; step++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => el === document.activeElement)) {
      const reachable = await target.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return el === hit || el.contains(hit);
      });
      expect(reachable).toBe(true);
      return;
    }
  }
  throw new Error('Control was not reached by Tab');
}

test('keeps minimum-window controls usable at real zoom', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'scrb-focus-zoom-'));
  writeFileSync(
    join(userData, 'library-location.json'),
    JSON.stringify({ root: join(userData, 'library') }),
  );
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  for (const key of [
    'ELECTRON_RUN_AS_NODE',
    'SCRB_CAPTURE_HELPER',
    'SCRB_FINAL_PASS_CONFIG',
    'SCRB_LIVE_CONFIG',
    'SCRB_DEV_SERVER_URL',
  ])
    delete env[key];
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env });
  try {
    const page = await app.firstWindow();
    await page.evaluate(() =>
      window.scribeBridge!.invoke('updateSettings', { location: { country: 'US', usState: 'NY' } }),
    );
    await page.reload();
    for (const zoom of [2, 1]) {
      // macOS clamps the window to the display (the CI runner's is 1024 wide). The
      // supported size is 1280×720, so on a smaller display raise the zoom until the
      // CSS viewport is the one 1280 DIP would give at the requested zoom.
      const applied = await app.evaluate(async ({ BrowserWindow }, factor) => {
        const win = BrowserWindow.getAllWindows()[0]!;
        win.setSize(1280, 720);
        await new Promise((resolve) => setTimeout(resolve, 500));
        const effective =
          factor > 1 ? Math.min(factor, (win.getContentBounds().width * factor) / 1280) : factor;
        win.webContents.setZoomFactor(effective);
        return effective;
      }, zoom);
      const readWindow = () =>
        app.evaluate(({ BrowserWindow }) => {
          const win = BrowserWindow.getAllWindows()[0]!;
          return {
            bounds: win.getBounds(),
            contentWidth: win.getContentBounds().width,
            zoom: win.webContents.getZoomFactor(),
          };
        });
      await expect
        .poll(
          async () => {
            const w = await readWindow();
            const seen = await page.evaluate(() => innerWidth);
            return Math.abs(seen - w.contentWidth / applied) < 1;
          },
          { message: `viewport never matched the window at ${zoom * 100}%`, timeout: 30_000 },
        )
        .toBe(true);
      const window = await readWindow();
      console.log('window', JSON.stringify(window));
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      console.log('viewport', JSON.stringify(viewport));
      // Runner displays clamp the window; the app opens at 1280×800 DIP (its minimum in main.ts is 800×560, below these asserted sizes).
      const dimensions = `Effective Electron window ${window.bounds.width}×${window.bounds.height} DIP; CSS viewport ${viewport.width}×${viewport.height} at ${zoom * 100}%`;
      expect(window.bounds.width, dimensions).toBeGreaterThanOrEqual(1024);
      expect(window.bounds.height, dimensions).toBeGreaterThanOrEqual(600);
      expect(window.zoom).toBeCloseTo(applied, 5);
      await page.getByRole('button', { name: 'Live', exact: true }).click();
      await expect(page.getByRole('combobox', { name: 'Microphone' })).toBeVisible();
      await inspectLayout(page, `${zoom}-live-idle`);
      const trigger = async (id: string) => {
        await page.keyboard.press('Control+Shift+Alt+D');
        await page.locator(`[data-trigger="${id}"]`).click();
        await page.keyboard.press('Control+Shift+Alt+D');
      };
      await trigger('start');
      await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
      await inspectLayout(page, `${zoom}-live-recording`);
      await expectPanelHeight(page, 'section[aria-label="Transcript"]', 200);
      await trigger('lagging');
      await inspectLayout(page, `${zoom}-live-lag`);
      await page.locator('[data-word-id]').first().dblclick();
      const editor = page.getByLabel('Correct text');
      await editor.fill('Invented correction');
      await page.keyboard.type(' continues');
      await expect(editor).toBeFocused();
      await inspectLayout(page, `${zoom}-live-editor`);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
      await inspectLayout(page, `${zoom}-live-paused`);
      await trigger('stop');
      await page.getByRole('button', { name: 'Recordings', exact: true }).click();
      await expect(page.getByRole('button', { name: /Weekly project sync/ })).toBeVisible();
      await inspectLayout(page, `${zoom}-recordings`);
      await page.getByRole('button', { name: /Weekly project sync/ }).click();
      await expect(page.getByRole('heading', { name: /Weekly project sync/ })).toBeFocused();
      await inspectLayout(page, `${zoom}-detail`);
      await expectPanelHeight(page, '[role="tabpanel"]', 200);
      await page.getByRole('button', { name: 'Edit details', exact: true }).click();
      const title = page.getByLabel('Title', { exact: true });
      await title.fill(
        'Weekly project sync — invented accessibility fixture with long project and participant labels',
      );
      await expect(title).toBeFocused();
      await inspectLayout(page, `${zoom}-detail-dialog`);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await inspectLayout(page, `${zoom}-long-detail`);
      expect(await page.locator('[data-row]').count()).toBeLessThan(60);
      await reachByKeyboard(
        page,
        page.getByRole('button', { name: 'Play from 00:00', exact: true }),
      );
      await page.getByRole('button', { name: '← Recordings', exact: true }).click();
      await inspectLayout(page, `${zoom}-long-list`);
    }
  } finally {
    await app.close();
  }
});
