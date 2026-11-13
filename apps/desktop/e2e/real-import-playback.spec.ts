import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const helper = process.env['SCRB_CAPTURE_HELPER'];
const config = process.env['SCRB_FINAL_PASS_CONFIG'];
const audio = process.env['SCRB_PUBLIC_AUDIO'];

// Needs the built Mac helper, models and a public audio file, so it runs by hand from the terminal pane.
test.skip(
  !helper || !config || !audio,
  'set SCRB_CAPTURE_HELPER, SCRB_FINAL_PASS_CONFIG and SCRB_PUBLIC_AUDIO to run',
);

declare global {
  interface Window {
    realLog: {
      positions: { positionMs: number; isPlaying: boolean }[];
      audios: HTMLAudioElement[];
    };
  }
}

const playing = (page: Page) =>
  page.evaluate(() => ({
    positionMs: window.realLog.positions.at(-1)?.positionMs ?? -1,
    times: window.realLog.audios.filter((a) => !a.paused).map((a) => a.currentTime),
  }));

const meetings = (library: string) =>
  readdirSync(join(library, 'meetings'))
    .filter((name) => !name.startsWith('.'))
    .map((name) => {
      const folder = join(library, 'meetings', name);
      return { folder, ...JSON.parse(readFileSync(join(folder, 'meeting.json'), 'utf8')) };
    }) as { folder: string; id: string; title: string; source: string; status: string }[];

test('imported public audio plays and seeks, and playback leaves a recording intact', async () => {
  test.setTimeout(420_000);
  const userData = mkdtempSync(join(tmpdir(), 'scrb-gate3-'));
  const library = join(userData, 'library');
  writeFileSync(join(userData, 'library-location.json'), JSON.stringify({ root: library }));
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] });
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [path],
    })) as unknown as typeof dialog.showOpenDialog;
  }, audio as string);
  const page = await app.firstWindow();
  await page.evaluate(() =>
    window.scribeBridge?.invoke('updateSettings', { location: { country: 'US', usState: 'NY' } }),
  );
  await page.addInitScript(() => {
    const log: Window['realLog'] = { positions: [], audios: [] };
    window.realLog = log;
    const Real = window.Audio;
    window.Audio = function (src?: string) {
      const element = new Real(src);
      log.audios.push(element);
      return element;
    } as unknown as typeof Audio;
    window.scribeBridge?.subscribe('playbackPosition', (payload) =>
      log.positions.push(payload as { positionMs: number; isPlaying: boolean }),
    );
  });
  await page.reload();

  await page.getByRole('button', { name: 'Recordings', exact: true }).click();
  await page
    .getByRole('button', { name: /^Import/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const started = Date.now();
  await expect
    .poll(() => (existsSync(join(library, 'meetings')) ? meetings(library).length : 0), {
      timeout: 240_000,
      intervals: [1000],
    })
    .toBe(1);
  const imported = meetings(library)[0] as ReturnType<typeof meetings>[number];
  console.log('import took', Date.now() - started, 'ms; status', imported.status, imported.source);
  expect(imported.source).toBe('imported');

  const manifest = JSON.parse(
    readFileSync(join(imported.folder, 'audio', 'meeting', 'chunks.json'), 'utf8'),
  );
  expect(manifest.schemaVersion).toBe(2);
  const transcript = JSON.parse(readFileSync(join(imported.folder, 'transcript.json'), 'utf8'));
  const text = transcript.segments
    .map((segment: { words: { text: string }[] }) =>
      segment.words.map((word) => word.text).join(' '),
    )
    .join('\n');
  writeFileSync(process.env['SCRB_TRANSCRIPT_OUT'] ?? join(userData, 'transcript.txt'), text);
  expect(text.split(/\s+/).length).toBeGreaterThan(20);

  await page
    .getByRole('button', { name: /\d+ speakers?/ })
    .first()
    .click();
  await page.getByRole('tab', { name: 'Transcript' }).click();
  const lines = page.getByRole('button', { name: /^Play from/ });
  expect(await lines.count()).toBeGreaterThan(1);
  await lines.first().click();
  await expect.poll(async () => (await playing(page)).times.length).toBeGreaterThan(0);
  const before = await playing(page);
  await page.waitForTimeout(6500);
  const after = await playing(page);
  console.log('played', before, after);
  expect(after.positionMs).toBeGreaterThan(before.positionMs + 5000);

  const last = lines.last();
  const label = (await last.getAttribute('aria-label')) as string;
  const [mm, ss] = (label.match(/(\d+):(\d+)$/) as RegExpMatchArray).slice(1).map(Number);
  const target = ((mm as number) * 60 + (ss as number)) * 1000;
  await last.click();
  await expect
    .poll(async () => Math.abs((await playing(page)).positionMs - target) < 3000)
    .toBe(true);
  await expect.poll(async () => (await playing(page)).times.length).toBeGreaterThan(0);
  console.log('seeked to', target, await playing(page));
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(async () => (await playing(page)).times.length).toBe(0);

  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByTestId('recording-indicator')).toContainText('Recording');
  await page.waitForTimeout(6500);

  await page.getByRole('button', { name: 'Recordings', exact: true }).click();
  await page.waitForTimeout(500);
  if (await page.getByRole('button', { name: /\d+ speakers?/ }).count())
    await page
      .getByRole('button', { name: /\d+ speakers?/ })
      .first()
      .click();
  await page.getByRole('tab', { name: 'Transcript' }).click();
  await lines.first().click();
  await expect.poll(async () => (await playing(page)).times.length).toBeGreaterThan(0);
  await page.waitForTimeout(11_000);
  const during = await playing(page);
  console.log('played during recording', during);
  expect(during.times.length).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause' }).click();

  const live = meetings(library).find((meeting) => meeting.status === 'recording');
  expect(live).toBeDefined();
  const own = await page.evaluate(async (meetingId) => {
    await window.scribeBridge?.invoke('seekAudio', { meetingId, positionMs: 0 });
    const reply = await window.scribeBridge?.invoke('getPlaybackMedia', {
      meetingId,
      positionMs: 0,
    });
    if (!(reply as { value?: unknown }).value) throw new Error(JSON.stringify(reply));
    const { chunks } = (reply as { value: { chunks: { url: string; track: string }[] } }).value;
    const loaded = await Promise.all(
      chunks.map(
        ({ url }) =>
          new Promise<boolean>((resolve) => {
            const element = new Audio(url);
            element.oncanplay = () => resolve(true);
            element.onerror = () => resolve(false);
          }),
      ),
    );
    await window.scribeBridge?.invoke('pauseAudio', { meetingId });
    return { tracks: chunks.map((chunk) => chunk.track), loaded };
  }, live?.id);
  console.log('own sealed chunks during recording', own);
  expect(own.loaded.length).toBeGreaterThan(0);
  expect(own.loaded.every(Boolean)).toBe(true);

  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible({ timeout: 20_000 });

  const folder = (live as { folder: string }).folder;
  for (const track of ['microphone', 'meeting']) {
    const sealed = JSON.parse(readFileSync(join(folder, 'audio', track, 'chunks.json'), 'utf8'));
    const { chunks, gaps } = sealed as {
      chunks: { startNs: number; endNs: number; state: string }[];
      gaps: { kind: string; startNs: number; endNs: number }[];
    };
    const joins = chunks.slice(1).map((chunk, i) => {
      const previous = chunks[i] as { endNs: number };
      return (chunk.startNs - previous.endNs) / 1e6;
    });
    console.log(track, 'chunks', chunks.length, 'gaps', gaps.length, 'join ms', joins);
    // A meeting track has no packets until something plays, which reads as possiblyMissing.
    // Stop can leave a few milliseconds at the end; the helper's own break limit is 50 ms.
    const lost = gaps.filter(
      (gap) => gap.kind !== 'possiblyMissing' && gap.endNs - gap.startNs > 50 * 1e6,
    );
    expect(lost).toEqual([]);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.every((chunk) => chunk.state === 'complete')).toBe(true);
    expect(Math.max(...joins.map(Math.abs))).toBeLessThan(100);
  }
  console.log('user data', userData);
  await app.close();
});
