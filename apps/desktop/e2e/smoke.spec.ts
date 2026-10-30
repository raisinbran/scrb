import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCREENS = ['Live', 'Recordings', 'Speakers', 'Vocabulary', 'Settings', 'Help'];
const screenshotDir = process.env['SCRB_SCREENSHOT_DIR'];

/** Keeps tests out of the real `Documents/Meeting Scribe`. */
function pointAtTestLibrary(userData: string, root = join(userData, 'library')): void {
  writeFileSync(join(userData, 'library-location.json'), JSON.stringify({ root }));
}

/** The real settings start with no location, so the first-launch question opens. */
async function answerFirstLaunch(page: Page): Promise<void> {
  await page.evaluate(() =>
    window.scribeBridge?.invoke('updateSettings', { location: { country: 'US', usState: 'NY' } }),
  );
  await page.reload();
}

test('settings survive a restart and go to the real library', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'scrb-restart-'));
  pointAtTestLibrary(userData);
  const launch = () => electron.launch({ args: ['.', `--user-data-dir=${userData}`] });

  const first = await launch();
  const page = await first.firstWindow();
  await answerFirstLaunch(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: 'Dark' }).check();
  await expect
    .poll(() => page.evaluate(() => window.scribeBridge?.invoke('getSettings', undefined)))
    .toMatchObject({
      ok: true,
      value: { theme: 'dark', storageLocation: join(userData, 'library') },
    });
  await first.close();

  const second = await launch();
  const reopened = await second.firstWindow();
  await reopened.getByRole('button', { name: 'Settings' }).click();
  await expect(reopened.getByRole('radio', { name: 'Dark' })).toBeChecked();
  await second.close();
});

test('a library that cannot open leaves the app usable', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'scrb-nolib-'));
  const blocked = join(userData, 'not-a-folder');
  writeFileSync(blocked, '');
  pointAtTestLibrary(userData, blocked);
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] });
  const page = await app.firstWindow();
  await answerFirstLaunch(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: 'Dark' }).check();
  await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
  await app.close();
});

test('a damaged index is set aside and the app still opens with defaults', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'scrb-damaged-'));
  const library = join(userData, 'library');
  mkdirSync(library, { recursive: true });
  pointAtTestLibrary(userData, library);
  writeFileSync(join(library, 'index.sqlite'), 'this is not a database, '.repeat(200));
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] });
  const page = await app.firstWindow();
  await expect
    .poll(() => page.evaluate(() => window.scribeBridge?.invoke('getSettings', undefined)))
    .toMatchObject({ ok: true, value: { theme: 'system' } });
  expect(readdirSync(library).some((name) => name.startsWith('index.sqlite.corrupt-'))).toBe(true);
  await app.close();
});

test('a second copy quits and the first keeps working', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'scrb-second-'));
  pointAtTestLibrary(userData);
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] });
  const page = await app.firstWindow();
  const binary = await app.evaluate(() => process.execPath);
  const second = spawn(binary, ['.', `--user-data-dir=${userData}`], { stdio: 'ignore' });
  const exitCode = await new Promise((resolve) => second.once('exit', resolve));
  expect(exitCode).toBe(0);
  const settings = await page.evaluate(() => window.scribeBridge?.invoke('getSettings', undefined));
  expect(settings).toMatchObject({ ok: true });
  await app.close();
});

test('launches and shows every screen against the mock backend', async () => {
  const userData = join(tmpdir(), `scrb-smoke-${process.pid}`);
  mkdirSync(userData, { recursive: true });
  pointAtTestLibrary(userData);
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

  const policy = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(policy).toContain("script-src 'self'");
  expect(new URL(page.url()).protocol).toBe('scribe:');

  const refused = await page.evaluate(async () => {
    try {
      await window.scribeBridge?.invoke('notARealCall' as never, undefined);
      return 'allowed';
    } catch {
      return 'refused';
    }
  });
  expect(refused).toBe('refused');

  const webPreferences = await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]?.webContents;
    return (contents as unknown as { getLastWebPreferences(): unknown }).getLastWebPreferences();
  });
  expect(webPreferences).toMatchObject({
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
  });

  await answerFirstLaunch(page);
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
