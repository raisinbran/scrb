import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

/** Ids of the scrb-core processes that Electron's main process started, found through the OS. */
function coreProcessIds(mainPid: number): number[] {
  const { stdout } =
    process.platform === 'win32'
      ? spawnSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-Command',
            `Get-CimInstance Win32_Process -Filter ParentProcessId=${mainPid} | Where-Object Name -eq scrb-core.exe | ForEach-Object ProcessId`,
          ],
          { encoding: 'utf8' },
        )
      : spawnSync('pgrep', ['-P', String(mainPid), '-x', 'scrb-core'], { encoding: 'utf8' });
  return stdout.split(/\s+/).filter(Boolean).map(Number);
}

/**
 * Waits for a scrb-core process not killed before, kills it as a crash would, and records its id.
 */
async function killNextCore(mainPid: number, killed: Set<number>): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const pid = coreProcessIds(mainPid).find((id) => !killed.has(id));
    if (pid !== undefined) {
      process.kill(pid, 'SIGKILL');
      killed.add(pid);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('scrb-core did not start again.');
}

/** Only scrb-core answers with this build date; the mock uses a different one. */
const CORE_BUILD_DATE = 'Development build';
/** What every call gets once the relay stops restarting the core. */
const KEEPS_STOPPING = 'The recorder keeps stopping. Restart Meeting Scribe.';

// The About section must come from the core, not the mock, once the hybrid backend sends it there.
test('Help shows getAppInfo from scrb-core', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'scrb-core-info-'));
  pointAtTestLibrary(userData);
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] });
  const page = await app.firstWindow();

  const info = await page.evaluate(() => window.scribeBridge?.invoke('getAppInfo', undefined));
  await answerFirstLaunch(page);
  await page.getByRole('button', { name: 'Help', exact: true }).click();

  expect(info).toMatchObject({ ok: true, value: { buildDate: CORE_BUILD_DATE } });
  await expect(page.getByText(`built ${CORE_BUILD_DATE}`)).toBeVisible();
  await app.close();
});

// A crash must not leave the window waiting, and a core that keeps crashing must show an error.
test('the core restarts, then reports repeated crashes', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'scrb-core-crash-'));
  pointAtTestLibrary(userData);
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] });
  const page = await app.firstWindow();
  const mainPid = await app.evaluate(() => process.pid);
  const killed = new Set<number>();
  await answerFirstLaunch(page);
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(page.getByText(`built ${CORE_BUILD_DATE}`)).toBeVisible();

  // After one crash, main restarts the core and reloads the window once it answers hello.
  const reloaded = page.waitForEvent('load');
  await killNextCore(mainPid, killed);
  await reloaded;
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(page.getByText(`built ${CORE_BUILD_DATE}`)).toBeVisible();

  // After three more crashes within a minute, main stops restarting and calls fail at once.
  // Crashes 2 and 3 each reload the window, which would destroy a page.evaluate run during it.
  for (let crash = 2; crash <= 3; crash += 1) {
    const restarted = page.waitForEvent('load');
    await killNextCore(mainPid, killed);
    await restarted;
  }
  await killNextCore(mainPid, killed);
  await expect
    .poll(() => page.evaluate(() => window.scribeBridge?.invoke('getAppInfo', undefined)))
    .toMatchObject({ ok: false, error: { code: 'internal', message: KEEPS_STOPPING } });
  await page.reload();
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(page.getByText(KEEPS_STOPPING)).toBeVisible();
  await app.close();
});

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

test('a damaged index is kept untouched and the app still opens', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'scrb-damaged-'));
  const library = join(userData, 'library');
  mkdirSync(library, { recursive: true });
  pointAtTestLibrary(userData, library);
  const damaged = 'this is not a database, '.repeat(200);
  writeFileSync(join(library, 'index.sqlite'), damaged);
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] });
  const page = await app.firstWindow();
  await expect
    .poll(() => page.evaluate(() => window.scribeBridge?.invoke('getSettings', undefined)))
    .toMatchObject({ ok: false });
  expect(readFileSync(join(library, 'index.sqlite'), 'utf8')).toBe(damaged);
  expect(readdirSync(library).some((name) => name.startsWith('index.sqlite.corrupt-'))).toBe(false);
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
