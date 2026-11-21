import { _electron as electron, expect, test } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Library } from '@scrb/storage';

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

  expect(page.url()).toMatch(/^scribe:\/\/app\//);
  // The window refuses to leave the app address.
  await page.evaluate(() => {
    location.href = 'file:///etc/hosts';
  });
  await page.waitForTimeout(500);
  expect(page.url()).toMatch(/^scribe:\/\/app\//);

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
  const start = page.getByRole('button', { name: 'Start' });
  await expect(start).toBeDisabled();
  await expect(start).not.toHaveAttribute('title');
  await expect(page.locator('#start-blocked-reason')).toHaveText(
    'Download the speech models first',
  );
  await start.locator('..').hover();
  await expect(page.locator('[role="tooltip"][data-open="true"]')).toHaveText(
    'Download the speech models first',
  );
  await expect(start).toHaveAttribute('aria-describedby', /start-blocked-reason .+/);
  await expect(page.getByTestId('recording-indicator')).toHaveCount(0);
  await app.close();
});

test('packaged app exposes Copy transcript and copies the complete invented transcript', async () => {
  test.setTimeout(90_000);
  const home = mkdtempSync(join(tmpdir(), 'scrb-packaged-copy-'));
  const userData = join(home, 'userData');
  const libraryRoot = join(home, 'test-library');
  mkdirSync(userData, { recursive: true });
  writeFileSync(join(userData, 'library-location.json'), JSON.stringify({ root: libraryRoot }));
  const library = await Library.open({ root: libraryRoot });
  const { id } = await library.createMeeting({
    title: 'Invented packaged clipboard check',
    date: '2026-11-20T12:00:00.000Z',
    source: 'recorded',
    status: 'ready',
    durationMs: 120_000,
  });
  const segments = Array.from({ length: 80 }, (_, index) => ({
    id: `invented-segment-${index}`,
    speakerId: 'invented-speaker',
    track: 'meeting' as const,
    pass: 'final' as const,
    words: [
      {
        id: `invented-word-${index}`,
        text: `invented line ${index.toString().padStart(2, '0')}`,
        startMs: index * 1000,
        endMs: index * 1000 + 500,
      },
    ],
  }));
  await library.appendSegments(id, segments, [
    {
      id: 'invented-speaker',
      label: 'Invented Speaker',
      name: null,
      profileId: null,
      userNamed: false,
      mergedInto: null,
    },
  ]);
  await library.close();

  const app = await electron.launch({
    executablePath: executable!,
    args: [`--user-data-dir=${userData}`],
    env: { ...process.env, HOME: home, LOCALAPPDATA: join(home, 'AppData', 'Local') } as Record<
      string,
      string
    >,
  });
  try {
    const page = await app.firstWindow();
    const settings = await page.evaluate(() =>
      window.scribeBridge?.invoke('getSettings', undefined),
    );
    expect(settings).toMatchObject({ ok: true, value: { storageLocation: libraryRoot } });
    await page.evaluate(() =>
      window.scribeBridge?.invoke('updateSettings', { location: { country: 'US', usState: 'CA' } }),
    );
    await page.reload();
    await page.getByRole('button', { name: 'Recordings', exact: true }).click();
    await page.getByText('Invented packaged clipboard check').first().click();
    const copy = page.getByRole('button', { name: 'Copy transcript' });
    await expect(copy).toBeVisible();
    await expect(copy).toBeEnabled();
    await copy.click();
    await expect(page.getByText('Transcript copied.', { exact: true })).toBeVisible();
    const clipboard = await app.evaluate(({ clipboard }) => clipboard.readText());
    const expected = segments
      .map(
        (segment, index) => `Invented Speaker: invented line ${index.toString().padStart(2, '0')}`,
      )
      .join('\n');
    expect(clipboard).toBe(expected);
    expect(clipboard).toContain('Invented Speaker: invented line 79');
  } finally {
    await app.close();
  }
});
