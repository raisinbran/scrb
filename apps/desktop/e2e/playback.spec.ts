import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MEETING_TONE, MICROPHONE_TONE } from './playback-tones.ts';

const MEETING_ID = 'tone-meeting';
const NS = 1e6;

interface Row {
  file: string;
  startMs: number;
  endMs: number;
}

function writeTrack(audio: string, track: string, tone: string, rows: Row[]): void {
  const folder = join(audio, track);
  mkdirSync(folder, { recursive: true });
  for (const row of rows) writeFileSync(join(folder, row.file), Buffer.from(tone, 'base64'));
  const chunks = rows.map(({ file, startMs, endMs }, seq) => ({
    file,
    seq,
    startNs: startMs * NS,
    endNs: endMs * NS,
    rate: 48_000,
    preSkip: 312,
    openReason: 'test',
    closeReason: 'test',
    state: 'complete',
  }));
  const manifest = {
    schemaVersion: 2,
    origin: 'recorded',
    endedBy: 'stop',
    endNs: 0,
    chunks,
    gaps: [],
  };
  writeFileSync(join(folder, 'chunks.json'), JSON.stringify(manifest));
}

/** Both tracks for 4 s, 26 s with nothing, then 2 s of microphone alone. */
function writeMeeting(library: string): void {
  const folder = join(library, 'meetings', 'Tone meeting');
  mkdirSync(folder, { recursive: true });
  const now = '2026-11-02T00:00:00.000Z';
  writeFileSync(
    join(folder, 'meeting.json'),
    JSON.stringify({
      schemaVersion: 1,
      id: MEETING_ID,
      title: 'Tone meeting',
      date: now,
      createdAt: now,
      durationMs: 32_000,
      source: 'recorded',
      status: 'ready',
      audioDeletedAt: null,
      buildVoiceProfiles: false,
    }),
  );
  const word = (id: string, startMs: number) => ({
    id,
    text: 'tone',
    startMs,
    endMs: startMs + 500,
  });
  writeFileSync(
    join(folder, 'transcript.json'),
    JSON.stringify({
      schemaVersion: 2,
      meetingId: MEETING_ID,
      revision: 1,
      speakers: [
        { id: 's', label: 'You', name: null, profileId: null, userNamed: false, mergedInto: null },
      ],
      segments: [
        { id: 'a', speakerId: 's', track: 'microphone', pass: 'final', words: [word('a1', 1000)] },
        {
          id: 'b',
          speakerId: 's',
          track: 'microphone',
          pass: 'final',
          words: [word('b1', 30_000)],
        },
      ],
      gaps: [],
      corrections: [],
      speakerOverrides: [],
      undoStack: [],
      redoStack: [],
    }),
  );
  const a = { file: '000000.opus', startMs: 0, endMs: 2000 };
  const b = { file: '000001.opus', startMs: 2000, endMs: 4000 };
  const c = { file: '000002.opus', startMs: 30_000, endMs: 32_000 };
  writeTrack(join(folder, 'audio'), 'microphone', MICROPHONE_TONE, [a, b, c]);
  writeTrack(join(folder, 'audio'), 'meeting', MEETING_TONE, [a, b]);
}

interface Sample {
  positionMs: number;
  playing: { src: string; time: number; ready: number; failed: boolean }[];
}

declare global {
  interface Window {
    playbackLog: {
      positions: { positionMs: number; isPlaying: boolean }[];
      audios: HTMLAudioElement[];
    };
  }
}

/** Test-only spy, added after load: the app itself never exposes its audio elements. */
async function watchPlayback(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: Window['playbackLog'] = { positions: [], audios: [] };
    window.playbackLog = log;
    const Real = window.Audio;
    window.Audio = function (src?: string) {
      const audio = new Real(src);
      log.audios.push(audio);
      return audio;
    } as unknown as typeof Audio;
    window.scribeBridge?.subscribe('playbackPosition', (payload) =>
      log.positions.push(payload as { positionMs: number; isPlaying: boolean }),
    );
  });
  await page.reload();
}

const sample = (page: Page): Promise<Sample> =>
  page.evaluate(() => {
    const { positions, audios } = window.playbackLog;
    return {
      positionMs: positions.at(-1)?.positionMs ?? -1,
      playing: audios
        .filter((audio) => audio.src !== '' && !audio.paused)
        .map((audio) => ({
          src: audio.src,
          time: audio.currentTime,
          ready: audio.readyState,
          failed: audio.error !== null,
        })),
    };
  });

async function openMeeting(): Promise<{ app: ElectronApplication; page: Page }> {
  const userData = mkdtempSync(join(tmpdir(), 'scrb-playback-'));
  const library = join(userData, 'library');
  writeFileSync(join(userData, 'library-location.json'), JSON.stringify({ root: library }));
  writeMeeting(library);
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] });
  const page = await app.firstWindow();
  await page.evaluate(() =>
    window.scribeBridge?.invoke('updateSettings', { location: { country: 'US', usState: 'NY' } }),
  );
  await watchPlayback(page);
  await page.getByRole('button', { name: 'Recordings', exact: true }).click();
  await page.getByText('Tone meeting').first().click();
  await page.getByRole('tab', { name: 'Transcript' }).click();
  return { app, page };
}

test('a transcript click plays both tracks in sync across a chunk, a gap and one track', async () => {
  const { app, page } = await openMeeting();
  await page.getByRole('button', { name: 'Play from 00:01' }).click();

  const samples: Sample[] = [];
  const started = Date.now();
  let last = await sample(page);
  while (Date.now() - started < 12_000 && !(last.positionMs >= 31_900)) {
    samples.push(last);
    await page.waitForTimeout(100);
    last = await sample(page);
  }
  const { positions } = await page.evaluate(() => ({ positions: window.playbackLog.positions }));
  const moving = samples.filter(({ positionMs }) => positionMs >= 1000);
  const both = moving.filter(({ playing }) => playing.length === 2);
  // Elements that are still seeking or starting can lag for a moment under load, until the
  // engine's next drift correction, so a single late sample is not a sync failure.
  // A skew that lasts two samples in a row, or is beyond 0.5 s, is.
  const skewAt = ({ positionMs, playing }: Sample): number | null => {
    const [one, two] = playing;
    if (playing.length !== 2 || !playing.every(({ ready }) => ready >= 2)) return null;
    if (positionMs % 2000 <= 300 || positionMs % 2000 >= 1700) return null;
    return Math.abs((one?.time ?? 0) - (two?.time ?? 0));
  };
  const series = moving.map(skewAt);
  const skews = series.filter((skew): skew is number => skew !== null);
  const persistent = series.filter(
    (skew, i) => skew !== null && skew > 0.15 && (series[i - 1] ?? 0) > 0.15,
  );
  console.log(`samples ${samples.length}; max track skew ${Math.max(...skews).toFixed(3)} s`);

  // Both tracks really decode and advance, on each side of the chunk boundary.
  expect(both.some(({ positionMs }) => positionMs < 2000)).toBe(true);
  expect(both.some(({ positionMs }) => positionMs > 2000)).toBe(true);
  expect(persistent).toEqual([]);
  expect(Math.max(...skews)).toBeLessThan(0.5);
  expect(moving.flatMap(({ playing }) => playing).some(({ failed }) => failed)).toBe(false);

  // The clock keeps original time: it reaches the gap, jumps it, and never compresses it.
  const times = positions.map(({ positionMs }) => positionMs);
  expect(times.filter((ms) => ms > 4300 && ms < 30_000)).toEqual([]);
  expect(times.some((ms) => ms >= 30_000)).toBe(true);
  expect(Date.now() - started).toBeLessThan(11_000);

  // Only the surviving track plays after the gap.
  const after = moving.filter(({ positionMs }) => positionMs > 30_300 && positionMs < 31_700);
  expect(after.length).toBeGreaterThan(0);
  expect(after.every(({ playing }) => playing.length === 1)).toBe(true);
  expect(after.every(({ playing }) => playing[0]?.src.includes('/microphone/'))).toBe(true);

  await expect.poll(async () => (await sample(page)).playing.length).toBe(0);
  expect(positions.length).toBeGreaterThan(0);
  await expect
    .poll(() => page.evaluate(() => window.playbackLog.positions.at(-1)))
    .toEqual({ meetingId: MEETING_ID, positionMs: 32_000, isPlaying: false });
  await app.close();
});

test('pause stops sound and revokes the URL; the page has no other way to the files', async () => {
  const { app, page } = await openMeeting();
  await page.getByRole('button', { name: 'Play from 00:01' }).click();
  await expect.poll(async () => (await sample(page)).playing.length).toBe(2);
  const url = await page.evaluate(() => window.playbackLog.audios[0]?.src as string);
  expect(url).toMatch(/^scribe-media:\/\/media\/[0-9a-f]{64}\/microphone\/\d+\.opus$/);

  // Never read, so only the main process can answer: a page keeps what it already buffered.
  const unread = await page.evaluate(async (meetingId) => {
    const reply = await window.scribeBridge?.invoke('getPlaybackMedia', {
      meetingId,
      positionMs: 30_000,
    });
    return (reply as { value: { chunks: { url: string }[] } }).value.chunks[0]?.url as string;
  }, MEETING_ID);

  await page.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(async () => (await sample(page)).playing.length).toBe(0);

  const loads = (src: string) =>
    page.evaluate(
      (target) =>
        new Promise<boolean>((resolve) => {
          const probe = document.createElement('audio');
          probe.oncanplay = () => resolve(true);
          probe.onerror = () => resolve(false);
          probe.src = target;
        }),
      src,
    );
  expect(await loads(unread)).toBe(false);
  expect(await loads(url.replace(/[0-9a-f]{64}/, 'f'.repeat(64)))).toBe(false);
  expect(await loads('file:///etc/hosts')).toBe(false);
  await app.close();
});

test('a reload ends playback and its URLs', async () => {
  const { app, page } = await openMeeting();
  await page.getByRole('button', { name: 'Play from 00:30' }).click();
  await expect.poll(async () => (await sample(page)).playing.length).toBe(1);
  const url = await page.evaluate(() => window.playbackLog.audios[0]?.src as string);
  await page.reload();
  const failed = await page.evaluate(
    (target) =>
      new Promise<boolean>((resolve) => {
        const probe = document.createElement('audio');
        probe.oncanplay = () => resolve(false);
        probe.onerror = () => resolve(true);
        probe.src = target;
      }),
    url,
  );
  expect(failed).toBe(true);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.playbackLog.positions.length)).toBe(0);
  await app.close();
});
