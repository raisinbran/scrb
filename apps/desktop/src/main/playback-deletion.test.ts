// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BackendEvents } from '@scrb/contracts';
import { Library } from '@scrb/storage';
import { PlaybackMedia } from './playback-media.ts';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'scrb-playback-deletion-'));
  let date = new Date('2026-01-01T00:00:00Z');
  const library = await Library.open({ root, now: () => date });
  const events: BackendEvents['playbackPosition'][] = [];
  const playback = new PlaybackMedia(
    library,
    (_name, payload) => events.push(payload as BackendEvents['playbackPosition']),
    () => 1000,
  );
  let stopSchedule: (() => void) | undefined;
  cleanups.push(async () => {
    stopSchedule?.();
    playback.stop();
    await library.close();
    await rm(root, { recursive: true, force: true });
  });
  const seed = async () => {
    const { id } = await library.createMeeting({ title: 'Invented playback', status: 'ready' });
    const folder = library.meetingPaths(id).audioMeeting;
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, '000000.opus'), 'invented bytes, never decoded');
    await writeFile(
      join(folder, 'chunks.json'),
      JSON.stringify({
        schemaVersion: 2,
        origin: 'recorded',
        endedBy: 'stop',
        gaps: [],
        chunks: [{ file: '000000.opus', startNs: 0, endNs: 60e9, state: 'complete' }],
      }),
    );
    return id;
  };
  const old = await seed();
  date = new Date('2026-02-10T00:00:00Z');
  const young = await seed();
  const handlers = playback.wrap({
    deleteMeeting: async (request) => {
      const { meetingId } = request as { meetingId: string };
      return library.deleteMeeting(meetingId);
    },
  });
  const stopped = () => events.filter(({ isPlaying }) => !isPlaying);
  const get = (url: string) => playback.serve(new Request(url.replace('scribe-media:', 'http:')));
  const play = async (meetingId: string) => {
    await handlers.seekAudio!({ meetingId, positionMs: 1000 });
    const media = (await handlers.getPlaybackMedia!({ meetingId, positionMs: 1000 })) as {
      chunks: Array<{ url: string }>;
    };
    const url = media.chunks[0]!.url;
    expect((await get(url)).status).toBe(200);
    return url;
  };
  return {
    library,
    playback,
    old,
    young,
    handlers,
    stopped,
    get,
    play,
    schedule: (beforeDelete: (id: string) => void) => {
      stopSchedule = library.startAutoDeleteSchedule(undefined, beforeDelete);
    },
  };
}

describe('playback revocation before deletion', () => {
  it.each([
    ['audio', 'once'],
    ['meeting', 'once'],
    ['audio', 'schedule'],
    ['meeting', 'schedule'],
  ] as const)(
    '%s retention (%s) revokes before removing the playing meeting',
    async (scope, mode) => {
      const f = await fixture();
      const url = await f.play(f.old);
      f.library.settings.setAutoDelete({ period: '30d', scope });
      const remove = scope === 'audio' ? 'deleteAudio' : 'deleteMeeting';
      const original = f.library[remove].bind(f.library);
      vi.spyOn(f.library, remove).mockImplementation(async (id: string) => {
        expect(f.stopped()).toEqual([{ meetingId: id, positionMs: 1000, isPlaying: false }]);
        expect((await f.get(url)).status).toBe(404);
        return original(id);
      });
      const revoke = (id: string) => f.playback.revokeMeeting(id);
      if (mode === 'schedule') f.schedule(revoke);
      const result = await f.library.runAutoDelete(revoke);
      expect(result.results).toEqual([{ meetingId: f.old, ok: true, remaining: [] }]);
      expect((await f.get(url)).status).toBe(404);
      await expect(
        f.handlers.getPlaybackMedia!({ meetingId: f.old, positionMs: 1000 }),
      ).rejects.toMatchObject({ code: 'conflict' });
      expect(f.stopped()).toHaveLength(1);
      expect((await f.library.getMeeting(f.young)).audioDeletedAt).toBeNull();
      await f.play(f.young);
    },
  );

  it.each(['audio', 'meeting'] as const)(
    '%s retention leaves a different playing meeting alone',
    async (scope) => {
      const f = await fixture();
      const url = await f.play(f.young);
      f.library.settings.setAutoDelete({ period: '30d', scope });
      await f.library.runAutoDelete((id) => f.playback.revokeMeeting(id));
      expect(f.stopped()).toEqual([]);
      expect((await f.get(url)).status).toBe(200);
    },
  );

  it.each(['audio', 'meeting'] as const)(
    '%s retention emits no stop when nothing plays',
    async (scope) => {
      const f = await fixture();
      f.library.settings.setAutoDelete({ period: '30d', scope });
      expect(
        (await f.library.runAutoDelete((id) => f.playback.revokeMeeting(id))).results[0]?.ok,
      ).toBe(true);
      expect(f.stopped()).toEqual([]);
    },
  );

  it('explicit meeting deletion revokes its URL and emits stop before deletion', async () => {
    const f = await fixture();
    const url = await f.play(f.old);
    const original = f.library.deleteMeeting.bind(f.library);
    vi.spyOn(f.library, 'deleteMeeting').mockImplementation(async (id) => {
      expect(f.stopped()).toEqual([{ meetingId: id, positionMs: 1000, isPlaying: false }]);
      expect((await f.get(url)).status).toBe(404);
      return original(id);
    });
    await expect(f.handlers.deleteMeeting!({ meetingId: f.old })).resolves.toMatchObject({
      ok: true,
    });
    expect((await f.get(url)).status).toBe(404);
    expect(f.stopped()).toHaveLength(1);
  });

  it('explicit deletion leaves another playing meeting alone', async () => {
    const f = await fixture();
    const url = await f.play(f.young);
    await f.handlers.deleteMeeting!({ meetingId: f.old });
    expect(f.stopped()).toEqual([]);
    expect((await f.get(url)).status).toBe(200);
  });

  it('explicit deletion emits no stop when nothing plays', async () => {
    const f = await fixture();
    await f.handlers.deleteMeeting!({ meetingId: f.old });
    expect(f.stopped()).toEqual([]);
  });
});
