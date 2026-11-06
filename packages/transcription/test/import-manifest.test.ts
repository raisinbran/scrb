// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { importedChunkManifest, readChunkManifest, retryWhileLocked } from '../src/importFile.js';
import { readOpusPreSkip } from '../src/ogg.js';

const roots: string[] = [];
async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'scrb-import-manifest-'));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('imported audio manifests', () => {
  it('uses the sealed v2 timeline', async () => {
    const root = await workspace();
    const folder = join(root, 'audio', 'meeting');
    await mkdir(folder, { recursive: true });
    const input = [
      { path: join(folder, '000000.opus'), startMs: 0, durationMs: 5000 },
      { path: join(folder, '000001.opus'), startMs: 5000, durationMs: 1550 },
    ];
    const manifest = importedChunkManifest(input, [312, 0]);
    expect(manifest).toEqual({
      schemaVersion: 2,
      origin: 'imported',
      endedBy: 'stop',
      endNs: 6_550_000_000,
      gaps: [],
      chunks: [
        {
          file: '000000.opus',
          seq: 0,
          startNs: 0,
          endNs: 5_000_000_000,
          rate: 48_000,
          preSkip: 312,
          openReason: 'imported',
          closeReason: 'imported',
          state: 'complete',
        },
        {
          file: '000001.opus',
          seq: 1,
          startNs: 5_000_000_000,
          endNs: 6_550_000_000,
          rate: 48_000,
          preSkip: 0,
          openReason: 'imported',
          closeReason: 'imported',
          state: 'complete',
        },
      ],
    });
    await writeFile(join(folder, 'chunks.json'), JSON.stringify(manifest));
    expect(await readChunkManifest(root)).toEqual(input);
    expect(JSON.parse(await readFile(join(folder, 'chunks.json'), 'utf8'))).toEqual(manifest);
  });

  it('refuses unsafe imported chunk paths', async () => {
    const root = await workspace();
    const folder = join(root, 'audio', 'meeting');
    await mkdir(folder, { recursive: true });
    const manifest = importedChunkManifest(
      [{ path: join(folder, '000000.opus'), startMs: 0, durationMs: 1000 }],
      [0],
    );
    await writeFile(
      join(folder, 'chunks.json'),
      JSON.stringify({
        ...manifest,
        chunks: [{ ...manifest.chunks[0], file: '../private.opus' }],
      }),
    );
    await expect(readChunkManifest(root)).rejects.toThrow('Invalid imported chunk');
    await writeFile(
      join(folder, 'chunks.json'),
      JSON.stringify({
        ...manifest,
        schemaVersion: 3,
      }),
    );
    await expect(readChunkManifest(root)).rejects.toThrow('Unsupported imported audio manifest');
  });

  it('rejects overlapping imported timestamps', () => {
    expect(() =>
      importedChunkManifest(
        [
          { path: '000000.opus', startMs: 0, durationMs: 5000 },
          { path: '000001.opus', startMs: 4900, durationMs: 1000 },
        ],
        [0, 0],
      ),
    ).toThrow('invalid imported chunk');
  });

  it('reads the recorded Opus pre-skip', async () => {
    const root = await workspace();
    const file = join(root, 'invented.opus');
    const header = Buffer.alloc(47);
    header.write('OggS', 0, 'ascii');
    header[26] = 1;
    header[27] = 19;
    header.write('OpusHead', 28, 'ascii');
    header.writeUInt16LE(312, 38);
    await writeFile(file, header);
    expect(await readOpusPreSkip(file)).toBe(312);
  });
});

describe('final import file steps', () => {
  const failure = (code: string) => Object.assign(new Error('invented'), { code });

  it('retries a locked file until it is released', async () => {
    const step = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(failure('EPERM'))
      .mockRejectedValueOnce(failure('EBUSY'))
      .mockResolvedValue(undefined);
    await retryWhileLocked(step, 0);
    expect(step).toHaveBeenCalledTimes(3);
  });

  it('gives up on a lock that stays and never retries other errors', async () => {
    const locked = vi.fn(async () => {
      throw failure('EACCES');
    });
    await expect(retryWhileLocked(locked, 0)).rejects.toMatchObject({ code: 'EACCES' });
    expect(locked).toHaveBeenCalledTimes(30);
    const full = vi.fn(async () => {
      throw failure('ENOSPC');
    });
    await expect(retryWhileLocked(full, 0)).rejects.toMatchObject({ code: 'ENOSPC' });
    expect(full).toHaveBeenCalledTimes(1);
  });
});
