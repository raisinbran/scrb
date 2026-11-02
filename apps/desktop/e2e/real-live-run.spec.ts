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
import { spawn, type ChildProcess } from 'node:child_process';
import { LiveProgressWatch, requirePhysicalInputs } from '../scripts/real-live-checks.ts';

declare global {
  interface Window {
    qaPhysical: { peakMicDb: number; peakMeetingDb: number; ui: unknown[] };
  }
}

const evidence = process.env['QA_EVIDENCE'];
const minutes = Number(process.env['QA_MINUTES'] ?? 5);
const stallLimitMs = Number(process.env['QA_STALL_SECONDS'] ?? 120) * 1000;

// Needs the built helper, models and public audio playing, so it runs by hand from the terminal pane.
test.skip(
  process.env['QA_REQUIRE_PHYSICAL'] !== '1' &&
    (!evidence || !process.env['SCRB_CAPTURE_HELPER'] || !process.env['SCRB_LIVE_CONFIG']),
  'set QA_EVIDENCE, SCRB_CAPTURE_HELPER and SCRB_LIVE_CONFIG to run',
);

test('live text keeps up and the run keeps its evidence', async () => {
  requirePhysicalInputs(process.env);
  for (const key of ['SCRB_CAPTURE_HELPER', 'SCRB_LIVE_CONFIG'])
    expect(existsSync(process.env[key]!)).toBe(true);
  const finishBy =
    Date.parse(process.env['QA_FINISH_BY'] ?? '') || Date.now() + (minutes + 25) * 60_000;
  expect(finishBy - Date.now()).toBeGreaterThan(minutes * 60_000 + 60_000);
  test.setTimeout(Math.min((minutes + 30) * 60_000, finishBy - Date.now() + 60_000));
  mkdirSync(evidence!, { recursive: true });
  const liveCopies = join(evidence!, 'live-transcript');
  mkdirSync(liveCopies, { recursive: true });
  const log = (row: unknown) =>
    appendFileSync(join(evidence!, 'snapshots.jsonl'), JSON.stringify(row) + '\n');

  // Gate evidence policy: the library stays in the evidence folder, whatever the outcome.
  const userData = mkdtempSync(join(evidence!, 'userdata-'));
  const library = join(userData, 'library');
  writeFileSync(join(userData, 'library-location.json'), JSON.stringify({ root: library }));
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    ...(process.env['QA_ELECTRON_EXE'] ? { executablePath: process.env['QA_ELECTRON_EXE'] } : {}),
  });
  let monitor: ChildProcess | undefined;
  let transcript: string | undefined;
  try {
    const page = await app.firstWindow();
    page.on('pageerror', (error) => log({ pageerror: String(error).slice(0, 200) }));
    await page.evaluate(() =>
      window.scribeBridge?.invoke('updateSettings', { location: { country: 'US', usState: 'NY' } }),
    );
    await page.reload();
    if (process.env['QA_MEETING_APP_ID']) {
      const selected = await page.evaluate(
        (meetingAppId) =>
          window.scribeBridge?.invoke('selectSources', { meetingAppId, micDeviceId: null }),
        process.env['QA_MEETING_APP_ID'],
      );
      expect(selected?.ok).toBe(true);
    }
    await page.evaluate(() => {
      window.qaPhysical = { peakMicDb: -100, peakMeetingDb: -100, ui: [] as unknown[] };
      window.scribeBridge?.subscribe('levelMeter', (raw) => {
        const p = raw as { micDb: number; meetingDb: number };
        window.qaPhysical.peakMicDb = Math.max(window.qaPhysical.peakMicDb, p.micDb);
        window.qaPhysical.peakMeetingDb = Math.max(window.qaPhysical.peakMeetingDb, p.meetingDb);
      });
      const stamp = () => performance.timeOrigin + performance.now();
      document.addEventListener(
        'click',
        (e) => {
          const button = (e.target as HTMLElement).closest('button');
          if (button && ['Start', 'Stop'].includes(button.textContent?.trim() ?? ''))
            window.qaPhysical.ui.push({
              kind: 'click',
              button: button.textContent?.trim(),
              at: stamp(),
            });
        },
        true,
      );
      let last = '';
      new MutationObserver(() =>
        requestAnimationFrame(() => {
          const state =
            document
              .querySelector('[aria-label="Recording controls"] [role="status"]')
              ?.getAttribute('data-state') ?? '';
          if (state !== last) {
            last = state;
            window.qaPhysical.ui.push({ kind: 'paint', state, at: stamp() });
          }
        }),
      ).observe(document.body, {
        subtree: true,
        attributes: true,
        childList: true,
        characterData: true,
      });
    });
    await page.getByRole('button', { name: 'Live', exact: true }).click();
    const startedAt = Date.now();
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByTestId('recording-indicator')).toContainText('Recording');

    const id = readdirSync(join(library, 'meetings')).filter((name) => !name.startsWith('.'))[0]!;
    const folder = join(library, 'meetings', id);
    transcript = join(folder, 'transcript.json');
    writeFileSync(
      join(evidence!, 'recording-started.json'),
      JSON.stringify({ startedAt, folder, pid: await app.evaluate(() => process.pid) }),
    );
    if (process.env['QA_TELEMETRY_SCRIPT'])
      monitor = spawn(
        process.execPath,
        [
          process.env['QA_TELEMETRY_SCRIPT']!,
          evidence!,
          String(await app.evaluate(() => process.pid)),
        ],
        { windowsHide: true, stdio: 'ignore' },
      );
    const wordsIn = (): { endMs: number }[] =>
      existsSync(transcript!)
        ? JSON.parse(readFileSync(transcript!, 'utf8')).segments.flatMap(
            (segment: { words: { endMs: number }[] }) => segment.words,
          )
        : [];

    const end = startedAt + minutes * 60_000;
    let stalledAtMin: number | null = null;
    const watch = new LiveProgressWatch(startedAt, stallLimitMs);
    while (Date.now() < end) {
      await page.waitForTimeout(Math.min(60_000, Math.max(1000, end - Date.now())));
      const minute = Math.round((Date.now() - startedAt) / 60_000);
      // The final pass replaces transcript.json, so live text is copied here, while it exists.
      if (existsSync(transcript!)) cpSync(transcript!, join(liveCopies, `min-${minute}.json`));
      const words = wordsIn();
      const seen = words.reduce((end, word) => Math.max(end, word.endMs), 0);
      log({ minute, words: words.length, lastWordMs: seen });
      const tracked = watch.observe(
        Date.now(),
        existsSync(transcript!) ? JSON.parse(readFileSync(transcript!, 'utf8')).segments : [],
      );
      log({ minute, ...tracked, audio: await page.evaluate(() => window.qaPhysical) });
      if (tracked.stalled && stalledAtMin === null) stalledAtMin = minute;
    }
    const liveWords = wordsIn().length;
    if (existsSync(transcript!)) cpSync(transcript!, join(liveCopies, 'before-stop.json'));
    const sourceLevels = await page.evaluate(() => window.qaPhysical);
    writeFileSync(join(evidence!, 'source-activity.json'), JSON.stringify(sourceLevels));

    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible({ timeout: 60_000 });
    writeFileSync(join(evidence!, 'recording-stopped.json'), JSON.stringify({ at: Date.now() }));
    writeFileSync(
      join(evidence!, 'control-response.json'),
      JSON.stringify(await page.evaluate(() => window.qaPhysical.ui)),
    );
    const status = () => JSON.parse(readFileSync(join(folder, 'meeting.json'), 'utf8')).status;
    await expect
      .poll(status, { timeout: Math.max(1000, finishBy - Date.now()), intervals: [5000] })
      .not.toBe('finalPassRunning');
    const finalStatus = status();
    const finalWords = wordsIn().length;
    log({ liveWords, finalWords, status: finalStatus, stalledAtMin });
    expect(stalledAtMin, 'live text stopped advancing').toBeNull();
    const progress = watch.observe(
      Date.now(),
      JSON.parse(readFileSync(join(liveCopies, 'before-stop.json'), 'utf8')).segments,
    );
    expect(progress.meetingWords, 'actual meeting speech must produce live text').toBeGreaterThan(
      0,
    );
    expect(sourceLevels.peakMicDb, 'microphone audio activity').toBeGreaterThan(-65);
    expect(sourceLevels.peakMeetingDb, 'meeting audio activity').toBeGreaterThan(-65);
    expect(finalStatus).toBe('ready');
    expect(
      JSON.parse(readFileSync(transcript!, 'utf8')).segments.some(
        (s: { pass: string }) => s.pass === 'final',
      ),
      'a real final pass must complete',
    ).toBe(true);
  } finally {
    monitor?.kill();
    if (transcript && existsSync(transcript) && !existsSync(join(liveCopies, 'before-stop.json')))
      cpSync(transcript, join(liveCopies, 'before-stop.json'));
    const page = app.windows()[0];
    if (
      page &&
      (await page
        .getByRole('button', { name: 'Stop', exact: true })
        .isVisible()
        .catch(() => false))
    ) {
      await page.getByRole('button', { name: 'Stop', exact: true }).click();
      await page.getByRole('button', { name: 'Start', exact: true }).waitFor({ timeout: 60_000 });
    }
    await app.close();
  }
});
