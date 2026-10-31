import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { chunk } from './chunk-fixture.ts';
import { readPages, sealAudio, type TrackName } from './recovery.ts';

const dead = async () => false;
const SECOND = 1_000_000_000;

function flipped(data: Buffer, at: number): Buffer {
  const copy = Buffer.from(data);
  copy[at] = (copy[at] ?? 0) ^ 0xff;
  return copy;
}

describe('sealAudio', () => {
  let audio: string;

  const put = (track: TrackName, name: string, data: Buffer) => {
    mkdirSync(join(audio, track), { recursive: true });
    writeFileSync(join(audio, track, name), data);
  };
  const logLine = (track: TrackName, lines: object[]) =>
    put(
      track,
      'chunks.log',
      Buffer.from(lines.map((line) => JSON.stringify(line)).join('\n') + '\n'),
    );
  const events = (lines: object[]) =>
    writeFileSync(
      join(audio, 'session.log'),
      lines.map((line) => JSON.stringify(line)).join('\n') + '\n',
    );

  beforeEach(() => {
    audio = mkdtempSync(join(tmpdir(), 'scrb-recovery-'));
  });

  it('leaves a live worker alone', async () => {
    put('meeting', '000000.opus.part', chunk(0, 0, 3, 'start'));
    const result = await sealAudio(audio, async () => true);
    expect(result.outcome).toBe('writerAlive');
    expect(existsSync(join(audio, 'meeting', '000000.opus.part'))).toBe(true);
  });

  it('repairs a part cut mid-page, keeping the good pages', async () => {
    put('meeting', '000000.opus', chunk(0, 0, 5, 'start'));
    logLine('meeting', [{ file: '000000.opus', closeReason: 'rollover' }]);
    const part = chunk(1, 5 * SECOND, 3, 'rollover');
    put('meeting', '000001.opus.part', part.subarray(0, part.length - 40));

    const { outcome, tracks } = await sealAudio(audio, dead);

    expect(outcome).toBe('recovered');
    const chunks = tracks.meeting?.chunks ?? [];
    expect(chunks.map(({ state }) => state)).toEqual(['complete', 'recovered']);
    expect(chunks[1]?.endNs).toBe(7 * SECOND);
    const repaired = readFileSync(join(audio, 'meeting', '000001.opus'));
    const pages = readPages(repaired);
    expect(pages).toHaveLength(4);
    expect((pages.at(-1)?.flags ?? 0) & 4).toBe(4);
    expect(existsSync(join(audio, 'meeting', '000001.opus.part'))).toBe(false);
  });

  it('gives the same result when run twice', async () => {
    put('meeting', '000000.opus.part', chunk(0, 0, 3, 'start'));
    const first = await sealAudio(audio, dead);
    const second = await sealAudio(audio, dead);
    expect(second.tracks).toEqual(first.tracks);
    expect(second.endNs).toBe(first.endNs);
  });

  it('moves an unreadable file to damaged and keeps it', async () => {
    put('meeting', '000000.opus.part', Buffer.from('not audio'));
    put('meeting', '000001.opus', chunk(1, SECOND, 2, 'start'));
    const { tracks } = await sealAudio(audio, dead);
    expect(readdirSync(join(audio, 'meeting', 'damaged'))).toEqual(['000000.opus.part']);
    expect(tracks.meeting?.chunks.map(({ file }) => file)).toEqual(['000001.opus']);
  });

  it('marks a span with no pause record as missing, never paused', async () => {
    put('meeting', '000000.opus', chunk(0, 0, 2, 'start'));
    put('meeting', '000001.opus', chunk(1, 5 * SECOND, 2, 'discontinuity'));
    const { gaps } = await sealAudio(audio, dead);
    expect(gaps).toEqual([
      { kind: 'audioMissing', track: 'meeting', startNs: 2 * SECOND, endNs: 5 * SECOND },
    ]);
  });

  it('shows a confirmed pause as paused and nothing as missing', async () => {
    put('meeting', '000000.opus', chunk(0, 0, 2, 'start'));
    put('meeting', '000001.opus', chunk(1, 5 * SECOND, 2, 'resume'));
    events([
      { event: 'pause', atNs: 2 * SECOND, seq: 1 },
      { event: 'resume', atNs: 5 * SECOND, seq: 2 },
    ]);
    const { gaps } = await sealAudio(audio, dead);
    expect(gaps).toEqual([
      { kind: 'paused', track: 'both', startNs: 2 * SECOND, endNs: 5 * SECOND },
    ]);
  });

  it('ends a meeting that crashed while paused at the pause', async () => {
    put('meeting', '000000.opus', chunk(0, 0, 2, 'start'));
    events([{ event: 'pause', atNs: 2 * SECOND, seq: 1 }]);
    const { gaps, endNs, outcome } = await sealAudio(audio, dead);
    expect(outcome).toBe('recovered');
    expect(endNs).toBe(2 * SECOND);
    expect(gaps).toEqual([
      { kind: 'paused', track: 'both', startNs: 2 * SECOND, endNs: 2 * SECOND },
    ]);
  });

  it('marks the shorter track missing up to the end of the longer one', async () => {
    put('meeting', '000000.opus', chunk(0, 0, 4, 'start'));
    put('microphone', '000000.opus', chunk(0, 0, 2, 'start'));
    const { gaps } = await sealAudio(audio, dead);
    expect(gaps).toEqual([
      { kind: 'audioMissing', track: 'microphone', startNs: 2 * SECOND, endNs: 4 * SECOND },
    ]);
  });

  it('survives a cut or damage at every byte of the last page', async () => {
    const whole = chunk(0, 0, 2, 'start');
    const lastPage = readPages(whole).at(-1);
    for (let at = lastPage?.start ?? 0; at < whole.length; at += 7) {
      for (const damaged of [whole.subarray(0, at), flipped(whole, at)]) {
        rmSync(join(audio, 'meeting'), { recursive: true, force: true });
        put('meeting', '000000.opus.part', damaged);
        const { tracks } = await sealAudio(audio, dead);
        expect(tracks.meeting?.endNs).toBe(SECOND);
        expect(readPages(readFileSync(join(audio, 'meeting', '000000.opus')))).toHaveLength(3);
        rmSync(join(audio, 'meeting', 'chunks.json'), { force: true });
      }
    }
  });

  it('trusts the finished chunk when a crash left it and its part', async () => {
    put('meeting', '000000.opus', chunk(0, 0, 3, 'start'));
    put('meeting', '000000.opus.part', chunk(0, 0, 1, 'start'));
    const { tracks } = await sealAudio(audio, dead);
    expect(tracks.meeting?.endNs).toBe(3 * SECOND);
    expect(existsSync(join(audio, 'meeting', '000000.opus.part'))).toBe(false);
  });

  it('clears a half-written repair and repairs again', async () => {
    put('meeting', '000000.opus.part', chunk(0, 0, 2, 'start'));
    put('meeting', '000000.opus.tmp', Buffer.from('half a file'));
    const { tracks } = await sealAudio(audio, dead);
    expect(tracks.meeting?.endNs).toBe(2 * SECOND);
    expect(existsSync(join(audio, 'meeting', '000000.opus.tmp'))).toBe(false);
  });

  it('keeps a meeting that crashed before any audio was saved', async () => {
    mkdirSync(join(audio, 'meeting'));
    mkdirSync(join(audio, 'microphone'));
    const { outcome, endNs } = await sealAudio(audio, dead);
    expect(outcome).toBe('recovered');
    expect(endNs).toBe(0);
  });

  it('rebuilds a damaged chunks.json from the chunks', async () => {
    put('meeting', '000000.opus', chunk(0, 0, 2, 'start'));
    put('meeting', 'chunks.json', Buffer.from('{ not json'));
    const { tracks } = await sealAudio(audio, dead);
    expect(tracks.meeting?.endNs).toBe(2 * SECOND);
  });

  it('refuses a chunks.json from a newer version', async () => {
    put('meeting', '000000.opus', chunk(0, 0, 2, 'start'));
    put('meeting', 'chunks.json', Buffer.from(JSON.stringify({ schemaVersion: 99 })));
    await expect(sealAudio(audio, dead)).rejects.toThrow('newer');
  });

  it('keeps the good pages of a damaged chunk in mid-sequence, and marks the hole', async () => {
    put('meeting', '000000.opus', chunk(0, 0, 5, 'start'));
    const middle = chunk(1, 5 * SECOND, 5, 'rollover');
    put('meeting', '000001.opus', flipped(middle, readPages(middle)[4]?.start ?? 0));
    put('meeting', '000002.opus', chunk(2, 10 * SECOND, 5, 'rollover'));
    const { tracks, gaps } = await sealAudio(audio, dead);
    expect(tracks.meeting?.chunks).toHaveLength(3);
    expect(tracks.meeting?.chunks[1]?.endNs).toBe(7 * SECOND);
    expect(gaps).toEqual([
      { kind: 'audioMissing', track: 'meeting', startNs: 7 * SECOND, endNs: 10 * SECOND },
    ]);
  });

  it('calls a clean stop ready when one track has no audio, and marks that track missing', async () => {
    put('microphone', '000000.opus', chunk(0, 0, 2, 'start'));
    logLine('microphone', [{ file: '000000.opus', closeReason: 'stop' }]);
    mkdirSync(join(audio, 'meeting'));
    const { outcome, gaps } = await sealAudio(audio, dead);
    expect(outcome).toBe('ready');
    expect(gaps).toEqual([
      { kind: 'audioMissing', track: 'meeting', startNs: 0, endNs: 2 * SECOND },
    ]);
  });

  it('does not call a silent whole-computer track lost', async () => {
    put('microphone', '000000.opus', chunk(0, 0, 2, 'start'));
    mkdirSync(join(audio, 'meeting'));
    events([{ event: 'open', wholeComputer: true, seq: 1 }]);
    const { gaps } = await sealAudio(audio, dead);
    expect(gaps).toEqual([
      { kind: 'possiblyMissing', track: 'meeting', startNs: 0, endNs: 2 * SECOND },
    ]);
  });

  describe('after a worker restart', () => {
    const OPENED = { event: 'open', seq: 1 };
    const restart = (at: number) => ({ event: 'restart', atNs: at * SECOND, seq: 2 });
    const missing = (track: TrackName, start: number, end: number) => ({
      kind: 'audioMissing',
      track,
      startNs: start * SECOND,
      endNs: end * SECOND,
    });

    it('marks the down time on both tracks', async () => {
      for (const track of ['microphone', 'meeting'] as const) {
        put(track, '000000.opus', chunk(0, 0, 2, 'start'));
        put(track, '000001.opus', chunk(1, 5 * SECOND, 2, 'workerRestarted'));
      }
      events([OPENED, OPENED, restart(4)]);
      const { gaps, endNs } = await sealAudio(audio, dead);
      expect(gaps).toEqual(expect.arrayContaining([missing('microphone', 2, 5)]));
      expect(gaps).toEqual(expect.arrayContaining([missing('meeting', 2, 5)]));
      expect(gaps).toHaveLength(2);
      expect(endNs).toBe(7 * SECOND);
    });

    it('keeps pauses apart when each worker numbers its log from 1', async () => {
      put('microphone', '000000.opus', chunk(0, 0, 2, 'start'));
      put('microphone', '000001.opus', chunk(1, 3 * SECOND, 1, 'resume'));
      put('microphone', '000002.opus', chunk(2, 6 * SECOND, 1, 'workerRestarted'));
      put('microphone', '000003.opus', chunk(3, 9 * SECOND, 1, 'resume'));
      events([
        OPENED,
        { event: 'pause', atNs: 2 * SECOND, seq: 2 },
        { event: 'resume', atNs: 3 * SECOND, seq: 3 },
        OPENED,
        restart(6),
        { event: 'pause', atNs: 7 * SECOND, seq: 3 },
        { event: 'resume', atNs: 9 * SECOND, seq: 4 },
      ]);
      const { gaps } = await sealAudio(audio, dead);
      expect(gaps).toEqual([
        { kind: 'paused', track: 'both', startNs: 2 * SECOND, endNs: 3 * SECOND },
        missing('microphone', 4, 6),
        { kind: 'paused', track: 'both', startNs: 7 * SECOND, endNs: 9 * SECOND },
      ]);
    });

    it('calls the meeting track lost, not possibly lost, on whole-computer audio', async () => {
      put('meeting', '000000.opus', chunk(0, 0, 2, 'start'));
      put('meeting', '000001.opus', chunk(1, 5 * SECOND, 2, 'workerRestarted'));
      events([{ event: 'open', wholeComputer: true, seq: 1 }, restart(4)]);
      const { gaps } = await sealAudio(audio, dead);
      expect(gaps).toEqual([missing('meeting', 2, 5)]);
    });

    it('marks the start when nothing before the restart was saved', async () => {
      put('microphone', '000000.opus', chunk(0, 3 * SECOND, 2, 'workerRestarted'));
      events([OPENED, restart(3)]);
      const { gaps } = await sealAudio(audio, dead);
      expect(gaps).toEqual([missing('microphone', 0, 3)]);
    });

    it('marks the end when nothing after the restart was saved', async () => {
      put('microphone', '000000.opus', chunk(0, 0, 2, 'start'));
      events([OPENED, restart(6)]);
      const { gaps, endNs } = await sealAudio(audio, dead);
      expect(gaps).toEqual([missing('microphone', 2, 6)]);
      expect(endNs).toBe(6 * SECOND);
    });

    it('does not mark a restart during a pause as lost', async () => {
      put('microphone', '000000.opus', chunk(0, 0, 2, 'start'));
      put('microphone', '000001.opus', chunk(1, 8 * SECOND, 2, 'resume'));
      events([
        OPENED,
        { event: 'pause', atNs: 2 * SECOND, seq: 2 },
        OPENED,
        restart(5),
        { event: 'resume', atNs: 8 * SECOND, seq: 3 },
      ]);
      const { gaps } = await sealAudio(audio, dead);
      expect(gaps).toEqual([
        { kind: 'paused', track: 'both', startNs: 2 * SECOND, endNs: 8 * SECOND },
      ]);
    });

    it('leaves only the time around a pause taken while the worker was down', async () => {
      put('microphone', '000000.opus', chunk(0, 0, 2, 'start'));
      put('microphone', '000001.opus', chunk(1, 10 * SECOND, 2, 'workerRestarted'));
      events([
        OPENED,
        OPENED,
        restart(3),
        { event: 'pause', atNs: 4 * SECOND, seq: 3 },
        { event: 'resume', atNs: 6 * SECOND, seq: 4 },
      ]);
      const { gaps } = await sealAudio(audio, dead);
      expect(gaps).toEqual([
        missing('microphone', 2, 4),
        { kind: 'paused', track: 'both', startNs: 4 * SECOND, endNs: 6 * SECOND },
        missing('microphone', 6, 10),
      ]);
    });

    it('gives the same gaps when sealed twice', async () => {
      put('microphone', '000000.opus', chunk(0, 0, 2, 'start'));
      put('microphone', '000001.opus', chunk(1, 5 * SECOND, 2, 'workerRestarted'));
      events([OPENED, restart(4)]);
      const first = await sealAudio(audio, dead);
      expect((await sealAudio(audio, dead)).gaps).toEqual(first.gaps);
    });
  });

  it('marks a span after a sleep close as asleep, not lost', async () => {
    put('meeting', '000000.opus', chunk(0, 0, 2, 'start'));
    put('meeting', '000001.opus', chunk(1, 60 * SECOND, 2, 'wake'));
    logLine('meeting', [
      { file: '000000.opus', closeReason: 'sleep' },
      { file: '000001.opus', closeReason: 'stop' },
    ]);
    const { gaps } = await sealAudio(audio, dead);
    expect(gaps).toEqual([
      { kind: 'computerAsleep', track: 'meeting', startNs: 2 * SECOND, endNs: 60 * SECOND },
    ]);
  });

  it('rebuilds from chunks when the log is lost, with close details unknown', async () => {
    put('meeting', '000000.opus', chunk(0, 0, 2, 'start'));
    const { tracks } = await sealAudio(audio, dead);
    expect(tracks.meeting?.chunks[0]?.closeReason).toBe('unknown');
  });

  it('calls a clean stop ready, and removes the working files', async () => {
    for (const track of ['meeting', 'microphone'] as const) {
      put(track, '000000.opus', chunk(0, 0, 2, 'start'));
      logLine(track, [{ file: '000000.opus', closeReason: 'stop' }]);
    }
    writeFileSync(join(audio, 'writer.lock'), '');
    const { outcome, tracks } = await sealAudio(audio, dead);
    expect(outcome).toBe('ready');
    expect(tracks.meeting?.endedBy).toBe('stop');
    expect(existsSync(join(audio, 'meeting', 'chunks.log'))).toBe(false);
    expect(existsSync(join(audio, 'writer.lock'))).toBe(false);
    rmSync(audio, { recursive: true });
  });
});
