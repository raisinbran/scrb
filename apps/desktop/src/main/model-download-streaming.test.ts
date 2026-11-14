// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DownloadError, downloadModels, type DownloadSource } from './model-download.ts';

describe('bounded model download streams', () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  const makeDir = async (): Promise<void> => {
    dir = await mkdtemp(join(tmpdir(), 'scrb-bounded-download-'));
  };

  const source = (bytes: number): DownloadSource => ({
    file: 'invented-model.bin',
    role: 'liveSpeech',
    label: 'Invented model',
    url: 'https://huggingface.co/invented/model.bin',
    sha256: createHash('sha256').update('unused').digest('hex'),
    bytes,
  });

  it('cancels a mocked oversized response before writing beyond the pinned size', async () => {
    await makeDir();
    let sent = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1;
        controller.enqueue(new Uint8Array(8));
        if (sent === 1000) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchFn = (async () => new Response(body, { status: 200 })) as typeof fetch;
    const result = downloadModels({
      dir,
      sources: [source(10)],
      fetchFn,
      freeBytes: async () => 1_000_000_000,
      marginBytes: 0,
    });
    await expect(result).rejects.toMatchObject<Partial<DownloadError>>({ code: 'size' });
    expect(sent).toBeLessThan(1000);
    expect(cancelled).toBe(true);
    await expect(stat(join(dir, 'invented-model.bin'))).rejects.toThrow();
    await expect(stat(join(dir, 'invented-model.bin.part'))).rejects.toThrow();
  });

  it('rechecks free space during streaming and cancels when the reserve is consumed', async () => {
    await makeDir();
    let sent = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1;
        controller.enqueue(new Uint8Array(8));
        if (sent === 1000) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    let freeChecks = 0;
    const fetchFn = (async () => new Response(body, { status: 200 })) as typeof fetch;
    const result = downloadModels({
      dir,
      sources: [source(1000)],
      fetchFn,
      freeBytes: async () => (++freeChecks === 1 ? 1_000_000_000 : 0),
      marginBytes: 0,
      freeSpaceCheckIntervalBytes: 16,
    });
    await expect(result).rejects.toMatchObject<Partial<DownloadError>>({ code: 'diskSpace' });
    expect(freeChecks).toBeGreaterThan(1);
    expect(sent).toBeLessThan(1000);
    expect(cancelled).toBe(true);
    await expect(stat(join(dir, 'invented-model.bin'))).rejects.toThrow();
  });
});
