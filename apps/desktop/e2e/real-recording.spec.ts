import { _electron as electron, expect, test } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const helper = process.env['SCRB_CAPTURE_HELPER'];

// Needs the built Mac helper and System Audio Recording, so it runs by hand from the terminal pane.
test.skip(!helper, 'set SCRB_CAPTURE_HELPER to run');

test('records, pauses, stops and saves real audio from the Live screen', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'scrb-real-'));
  const library = join(userData, 'library');
  writeFileSync(join(userData, 'library-location.json'), JSON.stringify({ root: library }));
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] });
  const page = await app.firstWindow();
  await page.evaluate(() =>
    window.scribeBridge?.invoke('updateSettings', { location: { country: 'US', usState: 'NY' } }),
  );
  await page.reload();
  await page.getByRole('button', { name: 'Live', exact: true }).click();

  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByTestId('recording-indicator')).toContainText('Recording');
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByText('No new audio is being recorded.')).toBeVisible();
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(500);

  const meetings = readdirSync(join(library, 'meetings')).filter((name) => !name.startsWith('.'));
  expect(meetings).toHaveLength(1);
  const folder = join(library, 'meetings', meetings[0] as string);
  const meta = JSON.parse(readFileSync(join(folder, 'meeting.json'), 'utf8'));
  expect(meta.status).toBe('ready');
  expect(meta.durationMs).toBeGreaterThan(7000);
  const mic = JSON.parse(readFileSync(join(folder, 'audio', 'microphone', 'chunks.json'), 'utf8'));
  expect(mic.chunks.length).toBeGreaterThanOrEqual(2);
  expect(mic.gaps).toEqual([]);
  const meeting = JSON.parse(readFileSync(join(folder, 'audio', 'meeting', 'chunks.json'), 'utf8'));
  expect(meeting.chunks.length).toBeGreaterThanOrEqual(2);
  expect(existsSync(join(folder, 'audio', 'writer.lock'))).toBe(false);
  await app.close();
});
