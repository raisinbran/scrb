// @vitest-environment node
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Library } from '@scrb/storage';
import { readPlaybackChunk } from './playback-media-source.ts';

const folders: string[] = [];
async function setup(status: 'ready' | 'recording' = 'ready') {
  const root = await mkdtemp(join(tmpdir(), 'scrb-playback-media-'));
  folders.push(root);
  const folder = join(root, 'audio', 'meeting');
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, '000000.opus'), Buffer.from('invented, opaque audio bytes'));
  await writeFile(join(folder, 'chunks.json'), JSON.stringify({
    schemaVersion: 2,
    origin: 'imported',
    endedBy: 'stop',
    endNs: 1_000_000_000,
    gaps: [],
    chunks: [{
      file: '000000.opus', seq: 0, startNs: 0, endNs: 1_000_000_000,
      rate: 48_000, preSkip: 0, state: 'complete',
      openReason: 'imported', closeReason: 'imported',
    }],
  }));
  let audioDeletedAt: string | null = null;
  const library = {
    getMeeting: async (id: string) => {
      if (id !== 'known') throw new Error('not found');
      return { status, source: 'imported', audioDeletedAt };
    },
    meetingPaths: (id: string) => {
      if (id !== 'known') throw new Error('not found');
      return { folder: root, audio: join(root, 'audio') };
    },
  } as unknown as Pick<Library, 'getMeeting' | 'meetingPaths'>;
  return { root, folder, library, setDeleted: () => { audioDeletedAt = '2026-11-02'; } };
}
afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

describe('sealed playback media source', () => {
  it('reads only bounded authorized bytes', async () => {
    const f = await setup();
    const result = await readPlaybackChunk(f.library, 'known', 'meeting', '000000.opus', 4, 7);
    expect(result.bytes.toString()).toBe('nted, o');
    expect(result.totalBytes).toBe(Buffer.byteLength('invented, opaque audio bytes'));
    await expect(readPlaybackChunk(f.library, 'known', 'meeting', '000000.opus', 0, 1_048_577))
      .rejects.toMatchObject({ code: 'notFound' });
    await expect(readPlaybackChunk(f.library, 'wrong', 'meeting', '000000.opus', 0, 5))
      .rejects.toMatchObject({ code: 'notFound' });
  });

  it('rejects unlisted and deleted audio', async () => {
    const f = await setup();
    await writeFile(join(f.folder, '000001.opus'), 'invented unlisted bytes');
    await expect(readPlaybackChunk(f.library, 'known', 'meeting', '000001.opus', 0, 5))
      .rejects.toMatchObject({ code: 'notFound' });
    f.setDeleted();
    await expect(readPlaybackChunk(f.library, 'known', 'meeting', '000000.opus', 0, 5))
      .rejects.toMatchObject({ code: 'notFound' });
  });

  it.skipIf(process.platform === 'win32')('refuses symlink escapes', async () => {
    const f = await setup();
    const outside = join(f.root, 'private.opus');
    await writeFile(outside, 'invented private text');
    await rm(join(f.folder, '000000.opus'));
    await symlink(outside, join(f.folder, '000000.opus'));
    await expect(readPlaybackChunk(f.library, 'known', 'meeting', '000000.opus', 0, 10))
      .rejects.toMatchObject({ code: 'notFound' });
  });

  it('ignores incomplete live log entries', async () => {
    const f = await setup('recording');
    const line = JSON.stringify({ file: '000000.opus', closeReason: 'segment' });
    await writeFile(join(f.folder, 'chunks.log'), line);
    await expect(readPlaybackChunk(f.library, 'known', 'meeting', '000000.opus', 0, 5))
      .rejects.toMatchObject({ code: 'notFound' });
  });
});
