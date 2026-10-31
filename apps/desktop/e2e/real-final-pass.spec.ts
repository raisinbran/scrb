import { _electron as electron, expect, test } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const helper = process.env['SCRB_CAPTURE_HELPER'];
const config = process.env['SCRB_FINAL_PASS_CONFIG'];

// Needs speech playing, the built tools and models, so it runs by hand from the terminal pane.
test.skip(!helper || !config, 'set SCRB_CAPTURE_HELPER and SCRB_FINAL_PASS_CONFIG to run');

test('a real recording reaches a final transcript on the Recordings screen', async () => {
  test.setTimeout(600_000);
  const userData = mkdtempSync(join(tmpdir(), 'scrb-final-'));
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
  await page.waitForTimeout(60_000);
  const stoppedAt = Date.now();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible({ timeout: 10_000 });

  const meetings = readdirSync(join(library, 'meetings')).filter((name) => !name.startsWith('.'));
  expect(meetings).toHaveLength(1);
  const folder = join(library, 'meetings', meetings[0] as string);
  const status = () => JSON.parse(readFileSync(join(folder, 'meeting.json'), 'utf8')).status;
  await expect.poll(status, { timeout: 480_000, intervals: [2000] }).toBe('ready');
  console.log('final pass took', Date.now() - stoppedAt, 'ms');

  const transcript = JSON.parse(readFileSync(join(folder, 'transcript.json'), 'utf8'));
  const words = transcript.segments.flatMap((segment: { words: { text: string }[] }) =>
    segment.words.map((word) => word.text),
  );
  console.log('words', words.length);
  expect(words.length).toBeGreaterThan(20);
  expect(existsSync(join(library, 'cache', transcript.meetingId, 'final-pass'))).toBe(false);

  await page.getByRole('button', { name: 'Recordings', exact: true }).click();
  await page.getByText('Meeting', { exact: true }).first().click();
  await expect(page.getByText(words[1] as string, { exact: false }).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Transcript' }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(userData, 'recordings.png') });
  console.log('user data', userData);
  await app.close();
});
