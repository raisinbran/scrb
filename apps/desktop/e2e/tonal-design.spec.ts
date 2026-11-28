import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The renderer in Electron carries the tonal design (the app's one look). Set SCRB_SCREENSHOT_DIR to also
// save a screenshot of every main screen in light and dark.
test('the Electron renderer carries the tonal design on every screen', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'scrb-tonal-'));
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
      window.scribeBridge!.invoke('updateSettings', { location: { country: 'US', usState: 'IL' } }),
    );
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-design', 'tonal');
    const dir = process.env['SCRB_SCREENSHOT_DIR'];
    const trigger = async (id: string) => {
      await page.keyboard.press('Control+Shift+Alt+D');
      await page.locator(`[data-trigger="${id}"]`).click();
      await page.keyboard.press('Control+Shift+Alt+D');
    };
    const shoot = async (name: string) => {
      if (!dir) return;
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.waitForTimeout(250);
        await page.screenshot({ path: join(dir, `${name}-${scheme}.png`) });
      }
    };
    const go = (name: string) => page.getByRole('button', { name, exact: true }).click();
    await go('Live');
    await shoot('01-live-idle');
    await trigger('start');
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await page.waitForTimeout(1500);
    await shoot('02-live-recording');
    await trigger('lagging');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await shoot('03-live-paused');
    await trigger('stop');
    await go('Recordings');
    await shoot('04-recordings-list');
    await page.getByRole('button', { name: /Weekly project sync/ }).click();
    for (const tab of ['Transcript', 'Summary', 'Audio']) {
      await page.getByRole('tab', { name: tab }).click();
      await page.waitForTimeout(400);
      await shoot(`05-recording-${tab.toLowerCase()}`);
    }
    await go('Speakers');
    await shoot('06-speakers');
    await go('Vocabulary');
    await shoot('07-vocabulary');
    await go('Settings');
    await shoot('08-settings');
    await go('Help');
    await shoot('09-help');
    await expect(page.locator('html')).toHaveAttribute('data-design', 'tonal');
  } finally {
    await app.close();
  }
});
