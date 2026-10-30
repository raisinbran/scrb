import { _electron as electron, expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCREENS = ['Live', 'Recordings', 'Speakers', 'Vocabulary', 'Settings', 'Help'];
const screenshotDir = process.env['SCRB_SCREENSHOT_DIR'];

test('launches and shows every screen against the mock backend', async () => {
  const userData = join(tmpdir(), `scrb-smoke-${process.pid}`);
  mkdirSync(userData, { recursive: true });
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] });
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  const security = await page.evaluate(() => ({
    require: typeof (window as unknown as { require?: unknown }).require,
    process: typeof (window as unknown as { process?: unknown }).process,
    bridgeKeys: Object.keys(window.scribeBridge ?? {}).sort(),
  }));
  expect(security).toEqual({
    require: 'undefined',
    process: 'undefined',
    bridgeKeys: ['invoke', 'platform', 'subscribe'],
  });

  const webPreferences = await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]?.webContents;
    return (contents as unknown as { getLastWebPreferences(): unknown }).getLastWebPreferences();
  });
  expect(webPreferences).toMatchObject({
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
  });

  for (const theme of ['Dark', 'Light']) {
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('radio', { name: theme }).check();
    for (const screen of SCREENS) {
      await page.getByRole('button', { name: screen, exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: screen })).toBeVisible();
      if (screenshotDir) {
        await page.screenshot({ path: join(screenshotDir, `${theme}-${screen}.png`) });
      }
    }
  }

  await page.keyboard.press('Control+Shift+Alt+D');
  await page.locator('[data-trigger="start"]').click();
  await expect(page.getByTestId('recording-indicator')).toContainText('Recording');
  await expect(page.getByTestId('transcription-status')).toBeVisible();
  await page.locator('[data-trigger="stop"]').click();
  await expect(page.getByTestId('recording-indicator')).toBeHidden();

  expect(errors).toEqual([]);
  await app.close();
});
