// @vitest-environment node
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackendEvents } from '@scrb/contracts';
import type { Library } from '@scrb/storage';
import { PlaybackMedia } from './playback-media.ts';
import { locatePlayback, type PlaybackChunk } from './playback-media-source.ts';

const NS = 1e6;
const folders: string[] = [];

interface Row {
  file: string;
  startMs: number;
  endMs: number;
  state?: string;
}

const manifest = (rows: Row[], origin = 'recorded') =>
  JSON.stringify({
    schemaVersion: 2,
    origin,
    endedBy: 'stop',
    gaps: [],
    chunks: rows.map(({ file, startMs, endMs, state }) => ({
      file,
      startNs: startMs * NS,
      endNs: endMs * NS,
      state: state ?? 'complete',
    })),
  });

const line = ({ file, startMs, endMs }: Row) =>
  `${JSON.stringify({ file, startNs: startMs * NS, endNs: endMs * NS, closeReason: 'rollover' })}\n`;

/** Invented bytes; these tests never decode audio. */
async function setup(
  tracks: Partial<Record<'microphone' | 'meeting', Row[]>>,
  status: 'ready' | 'recording' = 'ready',
) {
  const root = await mkdtemp(join(tmpdir(), 'scrb-playback-'));
  folders.push(root);
  for (const [track, rows] of Object.entries(tracks)) {
    const folder = join(root, 'audio', track);
    await mkdir(folder, { recursive: true });
    for (const row of rows) await writeFile(join(folder, row.file), `invented ${row.file}`);
    if (status === 'ready') await writeFile(join(folder, 'chunks.json'), manifest(rows));
    else await writeFile(join(folder, 'chunks.log'), rows.map(line).join(''));
  }
  const meeting = { status, source: 'recorded', audioDeletedAt: null as string | null };
  const library = {
    getMeeting: async (id: string) => {
      if (id !== 'one' && id !== 'two') throw new Error('not found');
      return meeting;
    },
    meetingPaths: () => ({ folder: root, audio: join(root, 'audio') }),
  } as unknown as Pick<Library, 'getMeeting' | 'meetingPaths'>;
  const events: BackendEvents['playbackPosition'][] = [];
  let clock = 1000;
  const media = new PlaybackMedia(
    library,
    (_name, payload) => events.push(payload as BackendEvents['playbackPosition']),
    () => clock,
  );
  const handlers = media.wrap({ deleteMeeting: async () => 'deleted' });
  return {
    root,
    meeting,
    media,
    handlers,
    events,
    advance: (ms: number) => {
      clock += ms;
      vi.advanceTimersByTime(250);
    },
    seek: (positionMs: number, meetingId = 'one') =>
      handlers.seekAudio?.({ meetingId, positionMs }) as Promise<void>,
    grant: (positionMs: number, meetingId = 'one') =>
      handlers.getPlaybackMedia?.({ meetingId, positionMs }) as Promise<{
        chunks: { track: string; startMs: number; endMs: number; url: string }[];
        nextPositionMs: number | null;
      }>,
    get: (url: string, range?: string) =>
      media.serve(
        new Request(url.replace('scribe-media:', 'http:'), {
          headers: range ? { range } : {},
        }),
      ),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(folders.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const A: Row = { file: '000000.opus', startMs: 0, endMs: 5000 };
const B: Row = { file: '000001.opus', startMs: 5000, endMs: 10_000 };
const C: Row = { file: '000002.opus', startMs: 60_000, endMs: 65_000 };

describe('locatePlayback', () => {
  const chunk = (track: 'microphone' | 'meeting', row: Row): PlaybackChunk => ({
    track,
    file: row.file,
    startMs: row.startMs,
    endMs: row.endMs,
  });
  const both = [
    chunk('microphone', A),
    chunk('microphone', B),
    chunk('meeting', { ...A, startMs: 2000 }),
    chunk('microphone', C),
  ];

  it('returns one chunk per track and the next boundary', () => {
    expect(locatePlayback(both, 3000)).toMatchObject({
      positionMs: 3000,
      chunks: [{ track: 'microphone' }, { track: 'meeting' }],
      nextPositionMs: 5000,
    });
  });

  it('plays only the surviving track and starts the other at its own time', () => {
    const spot = locatePlayback(both, 100);
    expect(spot?.chunks.map(({ track }) => track)).toEqual(['microphone']);
    expect(spot?.nextPositionMs).toBe(2000);
  });

  it('lands a seek into a gap on the next audio without changing timeline time', () => {
    expect(locatePlayback(both, 30_000)).toMatchObject({ positionMs: 60_000 });
    expect(locatePlayback(both, 7000)?.nextPositionMs).toBe(60_000);
    expect(locatePlayback(both, 61_000)?.nextPositionMs).toBeNull();
    expect(locatePlayback(both, 70_000)).toBeNull();
  });
});

describe('playback clock', () => {
  it('reports original timeline time, skips the gap and stops at the end', async () => {
    const f = await setup({ meeting: [A, B, C] });
    await f.seek(9000);
    expect(f.events.at(-1)).toEqual({ meetingId: 'one', positionMs: 9000, isPlaying: true });
    f.advance(500);
    expect(f.events.at(-1)?.positionMs).toBe(9500);
    f.advance(1000);
    expect(f.events.at(-1)).toMatchObject({ positionMs: 60_000, isPlaying: true });
    f.advance(4000);
    expect(f.events.at(-1)?.positionMs).toBe(64_000);
    f.advance(2000);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.events.at(-1)).toMatchObject({ positionMs: 65_000, isPlaying: false });
    const positions = f.events.map(({ positionMs }) => positionMs);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('holds at the end when asked to play past the saved audio', async () => {
    const f = await setup({ meeting: [A] });
    await f.seek(9000);
    expect(f.events).toEqual([{ meetingId: 'one', positionMs: 5000, isPlaying: false }]);
  });

  it('keeps the position on pause and revokes the URLs', async () => {
    const f = await setup({ meeting: [A] });
    await f.seek(1000);
    const { chunks } = await f.grant(1000);
    f.advance(750);
    await f.handlers.pauseAudio?.({ meetingId: 'one' });
    expect(f.events.at(-1)).toEqual({ meetingId: 'one', positionMs: 1750, isPlaying: false });
    expect((await f.get(chunks[0]?.url as string)).status).toBe(404);
    await expect(f.grant(1000)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('refuses a seek past the last sealed chunk of a live recording', async () => {
    const f = await setup({ meeting: [A] }, 'recording');
    await expect(f.seek(6000)).rejects.toMatchObject({ code: 'conflict' });
    await f.seek(1000);
    expect((await f.grant(1000)).chunks).toHaveLength(1);
  });

  it('picks up chunks sealed while playing a live recording', async () => {
    const f = await setup({ meeting: [A] }, 'recording');
    await f.seek(4900);
    await writeFile(join(f.root, 'audio', 'meeting', B.file), 'invented');
    await writeFile(join(f.root, 'audio', 'meeting', 'chunks.log'), line(A) + line(B));
    f.advance(500);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.events.at(-1)).toMatchObject({ isPlaying: true });
    await expect(f.grant(5400)).resolves.toMatchObject({ chunks: [{ startMs: 5000 }] });
  });

  it('never lists a torn log line or a .part file', async () => {
    const f = await setup({ meeting: [A] }, 'recording');
    const log = join(f.root, 'audio', 'meeting', 'chunks.log');
    await writeFile(join(f.root, 'audio', 'meeting', `${B.file}.part`), 'invented');
    await writeFile(log, `${line(A)}{"bad`);
    await f.seek(0);
    expect((await f.grant(0)).nextPositionMs).toBeNull();
    await writeFile(log, line(A) + line(B).trimEnd());
    await expect(f.seek(5500)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('plays recovered chunks and drops only a damaged track', async () => {
    const f = await setup({ microphone: [A], meeting: [{ ...A, state: 'recovered' }] });
    await writeFile(join(f.root, 'audio', 'microphone', 'chunks.json'), '{ damaged');
    await f.seek(0);
    expect((await f.grant(0)).chunks.map(({ track }) => track)).toEqual(['meeting']);
  });

  it.each([
    [
      'a newer schema',
      JSON.stringify({ schemaVersion: 3, origin: 'recorded', gaps: [], chunks: [] }),
    ],
    ['out-of-order chunks', manifest([B, A])],
    ['an unsafe name', manifest([{ ...A, file: '../../secret.opus' }])],
    ['the wrong origin', manifest([A], 'imported')],
  ])('refuses %s', async (_name, text) => {
    const f = await setup({ meeting: [A] });
    await writeFile(join(f.root, 'audio', 'meeting', 'chunks.json'), text);
    await expect(f.seek(0)).rejects.toMatchObject({ code: 'notFound' });
  });
});

describe('scribe-media URLs', () => {
  it('serves granted bytes with Range and no path in the URL', async () => {
    const f = await setup({ meeting: [A, B] });
    await f.seek(0);
    const { chunks, nextPositionMs } = await f.grant(0);
    const url = chunks[0]?.url as string;
    expect(nextPositionMs).toBe(5000);
    expect(url).toMatch(/^scribe-media:\/\/media\/[0-9a-f]{64}\/meeting\/000000\.opus$/);
    expect(url).not.toContain(f.root);

    const whole = await f.get(url);
    expect(whole.status).toBe(200);
    expect(whole.headers.get('content-type')).toBe('audio/ogg; codecs=opus');
    expect(await whole.text()).toBe('invented 000000.opus');

    const part = await f.get(url, 'bytes=9-14');
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 9-14/20');
    expect(await part.text()).toBe('000000');
    expect((await f.get(url, 'bytes=5-')).status).toBe(206);
  });

  it('caps a response at 1 MiB', async () => {
    const f = await setup({ meeting: [A] });
    await writeFile(join(f.root, 'audio', 'meeting', A.file), Buffer.alloc(3 * 1024 * 1024));
    await f.seek(0);
    const { chunks } = await f.grant(0);
    const response = await f.get(chunks[0]?.url as string);
    expect(response.status).toBe(206);
    expect((await response.arrayBuffer()).byteLength).toBe(1024 * 1024);
  });

  it('refuses bad ranges, methods, hosts and queries', async () => {
    const f = await setup({ meeting: [A] });
    await f.seek(0);
    const url = ((await f.grant(0)).chunks[0]?.url as string).replace('scribe-media:', 'http:');
    expect((await f.get(url, 'bytes=9-2')).status).toBe(416);
    expect((await f.get(url, 'bytes=0-1,4-5')).status).toBe(416);
    expect((await f.get(url, 'bytes=999-')).status).toBe(404);
    expect((await f.media.serve(new Request(url, { method: 'POST' }))).status).toBe(404);
    expect((await f.get(url.replace('//media/', '//other/'))).status).toBe(404);
    expect((await f.get(`${url}?x=1`)).status).toBe(404);
  });

  it('serves only chunks it granted, and never another meeting', async () => {
    const f = await setup({ meeting: [A, B] });
    await f.seek(0);
    const url = (await f.grant(0)).chunks[0]?.url as string;
    expect((await f.get(url.replace('000000', '000001'))).status).toBe(404);
    expect((await f.get(url.replace(/[0-9a-f]{64}/, '0'.repeat(64)))).status).toBe(404);
    expect((await f.get(url.replace('/meeting/', '/microphone/'))).status).toBe(404);
    expect((await f.get(url.replace('000000.opus', '%2e%2e%2fchunks.json'))).status).toBe(404);
    await expect(f.grant(0, 'two')).rejects.toMatchObject({ code: 'conflict' });
    await f.seek(0, 'two');
    expect((await f.get(url)).status).toBe(404);
  });

  it('expires a URL soon after its chunk would have finished', async () => {
    const f = await setup({ meeting: [A, { ...B, endMs: 200_000 }] });
    await f.seek(0);
    const url = (await f.grant(0)).chunks[0]?.url as string;
    f.advance(34_000);
    await vi.advanceTimersByTimeAsync(0);
    expect((await f.get(url)).status).toBe(200);
    f.advance(2000);
    await vi.advanceTimersByTimeAsync(0);
    expect((await f.get(url)).status).toBe(404);
  });

  it('stops before a delete and refuses audio deleted by retention', async () => {
    const f = await setup({ meeting: [A, B] });
    await f.seek(0);
    const url = (await f.grant(0)).chunks[0]?.url as string;
    await expect(f.handlers.deleteMeeting?.({ meetingId: 'one' })).resolves.toBe('deleted');
    expect((await f.get(url)).status).toBe(404);

    await f.seek(0);
    const again = (await f.grant(0)).chunks[0]?.url as string;
    f.meeting.audioDeletedAt = '2026-11-02';
    expect((await f.get(again)).status).toBe(404);
    await expect(f.grant(5000)).rejects.toMatchObject({ code: 'notFound' });
    expect(f.events.at(-1)).toMatchObject({ isPlaying: false });
  });

  it('stops on page reset, so a reloaded page cannot keep a URL or get ticks', async () => {
    const f = await setup({ meeting: [A] });
    await f.seek(0);
    const url = (await f.grant(0)).chunks[0]?.url as string;
    f.media.stop();
    const count = f.events.length;
    f.advance(1000);
    expect(f.events).toHaveLength(count);
    expect((await f.get(url)).status).toBe(404);
  });

  it.skipIf(process.platform === 'win32')('refuses a chunk swapped for a symlink', async () => {
    const f = await setup({ meeting: [A] });
    await f.seek(0);
    const url = (await f.grant(0)).chunks[0]?.url as string;
    const path = join(f.root, 'audio', 'meeting', A.file);
    const outside = join(f.root, 'private.opus');
    await writeFile(outside, 'invented private text');
    await rm(path);
    await symlink(outside, path);
    expect((await f.get(url)).status).toBe(404);
  });

  it('answers concurrent readers independently', async () => {
    const f = await setup({ meeting: [A] });
    await f.seek(0);
    const url = (await f.grant(0)).chunks[0]?.url as string;
    const replies = await Promise.all(
      Array.from({ length: 8 }, (_, i) => f.get(url, `bytes=${i}-${i}`)),
    );
    expect(await Promise.all(replies.map((reply) => reply.text()))).toEqual([...'invented']);
  });
});
