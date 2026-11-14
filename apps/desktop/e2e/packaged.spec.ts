import { _electron as electron, expect, test } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const executable = process.env['SCRB_PACKAGED_APP'];

// Runs the built Scribe.app against an invented HOME. Set SCRB_PACKAGED_APP to
// .../Scribe.app/Contents/MacOS/Scribe (macOS) or ...\win-unpacked\Scribe.exe (Windows).
test.skip(!executable, 'set SCRB_PACKAGED_APP to run');

// Both platforms' refusals start with this; macOS also names its install command.
const refusal = process.platform === 'darwin' ? '--install-models' : 'Scribe cannot record yet';

test('packaged app keeps the saved library, is named Scribe, and refuses to record without models', async () => {
  const home = mkdtempSync(join(tmpdir(), 'scrb-home-'));
  // Electron ignores HOME for its application-data folder, so an explicit one keeps this off the
  // real profile; the pin itself is covered by unit tests.
  const userData = join(home, 'userData');
  const library = join(home, 'chosen-library');
  mkdirSync(userData, { recursive: true });
  writeFileSync(join(userData, 'library-location.json'), JSON.stringify({ root: library }));
  const app = await electron.launch({
    executablePath: executable!,
    args: [`--user-data-dir=${userData}`],
    env: { ...process.env, HOME: home, LOCALAPPDATA: join(home, 'AppData', 'Local') } as Record<
      string,
      string
    >,
  });
  const page = await app.firstWindow();
  const call = (name: string, request?: unknown) =>
    page.evaluate(([n, r]) => window.scribeBridge?.invoke(n as never, r as never), [name, request]);

  expect(await call('getSettings')).toMatchObject({
    ok: true,
    value: { storageLocation: library },
  });
  expect(await call('getAppInfo')).toMatchObject({ ok: true, value: { name: 'Scribe' } });
  expect(await call('getSetupStatus')).toMatchObject({ ok: true, value: { complete: false } });
  expect(await call('startRecording', {})).toMatchObject({
    ok: false,
    error: { message: expect.stringContaining(refusal) },
  });
  // Through the UI's hybrid backend: the Live screen must show the refusal, not simulate recording.
  await page.evaluate(() =>
    window.scribeBridge?.invoke('updateSettings', { location: { country: 'US', usState: 'NY' } }),
  );
  await page.reload();
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByTestId('recording-indicator')).toHaveCount(0);
  await expect(page.getByText(refusal).first()).toBeVisible();
  await app.close();
});
