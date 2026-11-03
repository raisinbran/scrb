import { _electron as electron, expect, test } from '@playwright/test';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const evidence = process.env['QA_EVIDENCE'];
const minutes = Number(process.env['QA_MINUTES'] ?? 5);
const stallLimitMs = Number(process.env['QA_STALL_SECONDS'] ?? 120) * 1000;

// Needs the built helper, models and public audio playing, so it runs by hand from the terminal pane.
test.skip(
  !evidence || !process.env['SCRB_CAPTURE_HELPER'] || !process.env['SCRB_LIVE_CONFIG'],
  'set QA_EVIDENCE, SCRB_CAPTURE_HELPER and SCRB_LIVE_CONFIG to run',
);

test('live text keeps up and the run keeps its evidence', async () => {
  test.setTimeout((minutes + 30) * 60_000);
  mkdirSync(evidence!, { recursive: true });
  const liveCopies = join(evidence!, 'live-transcript');
  mkdirSync(liveCopies, { recursive: true });
  const log = (row: unknown) =>
    appendFileSync(join(evidence!, 'snapshots.jsonl'), JSON.stringify(row) + '\n');

  // Gate evidence policy: the library stays in the evidence folder, whatever the outcome.
  const userData = mkdtempSync(join(evidence!, 'userdata-'));
  const library = join(userData, 'library');
  writeFileSync(join(userData, 'library-location.json'), JSON.stringify({ root: library }));
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] });
  const page = await app.firstWindow();
  page.on('pageerror', (error) => log({ pageerror: String(error).slice(0, 200) }));
  await page.evaluate(() =>
    window.scribeBridge?.invoke('updateSettings', { location: { country: 'US', usState: 'NY' } }),
  );
  await page.reload();
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  const startedAt = Date.now();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByTestId('recording-indicator')).toContainText('Recording');

  const id = readdirSync(join(library, 'meetings')).filter((name) => !name.startsWith('.'))[0]!;
  const folder = join(library, 'meetings', id);
  const transcript = join(folder, 'transcript.json');
  const wordsIn = (): { endMs: number }[] =>
    existsSync(transcript)
      ? JSON.parse(readFileSync(transcript, 'utf8')).segments.flatMap(
          (segment: { words: { endMs: number }[] }) => segment.words,
        )
      : [];

  const end = startedAt + minutes * 60_000;
  let lastWordMs = -1;
  let lastAdvanceAt = Date.now();
  let stalledAtMin: number | null = null;
  while (Date.now() < end) {
    await page.waitForTimeout(Math.min(60_000, Math.max(1000, end - Date.now())));
    const minute = Math.round((Date.now() - startedAt) / 60_000);
    // The final pass replaces transcript.json, so live text is copied here, while it exists.
    if (existsSync(transcript)) cpSync(transcript, join(liveCopies, `min-${minute}.json`));
    const words = wordsIn();
    const seen = words.at(-1)?.endMs ?? 0;
    log({ minute, words: words.length, lastWordMs: seen });
    if (seen !== lastWordMs) {
      lastWordMs = seen;
      lastAdvanceAt = Date.now();
    } else if (stalledAtMin === null && Date.now() - lastAdvanceAt >= stallLimitMs) {
      stalledAtMin = Math.round((lastAdvanceAt - startedAt) / 60_000);
      log({ stalledAtMin, lastWordMs });
    }
  }
  const liveWords = wordsIn().length;
  if (existsSync(transcript)) cpSync(transcript, join(liveCopies, 'before-stop.json'));

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible({ timeout: 60_000 });
  const status = () => JSON.parse(readFileSync(join(folder, 'meeting.json'), 'utf8')).status;
  await expect
    .poll(status, { timeout: (minutes + 25) * 60_000, intervals: [5000] })
    .not.toBe('finalPassRunning');
  const finalStatus = status();
  const finalWords = wordsIn().length;
  log({ liveWords, finalWords, status: finalStatus, stalledAtMin });
  await app.close();

  expect(stalledAtMin, 'live text stopped advancing').toBeNull();
  expect(finalStatus).toBe('ready');
});
