// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { Library } from '@scrb/storage';
import {
  encodePcmFrame,
  toolsIn,
  type LivePcmFrame,
  type ModelPaths,
} from '@scrb/transcription';
import { LiveCaptureSession, readLiveSetup, type LiveSetup } from './live-feed.ts';

const models: ModelPaths = {
  speechLive: 'invented',
  vad: 'invented',
  speechFinal: '',
  segmentation: '',
  embedding: '',
};
const setup: LiveSetup = { tools: toolsIn('invented'), models, workerArgs: ['invented.mjs'] };
const frame = (sequence: number): LivePcmFrame => ({
  track: 'mic',
  sequence,
  generation: 0,
  startNs: sequence * 100_000_000,
  samples: new Int16Array(1600).fill(100),
  boundary: false,
});
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

it('restarts live worker without reusing the helper clock', async () => {
  const offered: LivePcmFrame[][] = [];
  const close = vi.fn(async () => undefined);
  const start = vi.fn(async () => {
    const list: LivePcmFrame[] = [];
    offered.push(list);
    return {
      offer: (pcm: LivePcmFrame) => {
        list.push(pcm);
        return true;
      },
      close,
    };
  });
  const session = new LiveCaptureSession({} as Library, 'meeting', vi.fn(), setup, start);
  const first = session.startHelper()!;
  const encoded = encodePcmFrame(frame(0));
  first.onData(encoded.subarray(0, 7));
  first.onData(encoded.subarray(7));
  await vi.waitFor(() => expect(offered[0]?.map((pcm) => pcm.sequence)).toEqual([0]));

  const second = session.startHelper()!;
  second.onData(encodePcmFrame(frame(0)));
  first.onData(encodePcmFrame(frame(1)));
  await vi.waitFor(() => expect(offered[1]?.map((pcm) => pcm.sequence)).toEqual([0]));
  expect(offered[0]).toHaveLength(1);
  await session.stop();
  expect(start).toHaveBeenCalledTimes(2);
  expect(close).toHaveBeenCalledTimes(2);
});

it('bounds PCM while the live worker starts', async () => {
  let resolve!: (value: {
    offer: (frame: LivePcmFrame) => boolean;
    close: () => Promise<void>;
  }) => void;
  const launched = new Promise<{
    offer: (frame: LivePcmFrame) => boolean;
    close: () => Promise<void>;
  }>((done) => {
    resolve = done;
  });
  const offered: number[] = [];
  const emit = vi.fn();
  const session = new LiveCaptureSession({} as Library, 'meeting', emit, setup, () => launched);
  const pipe = session.startHelper()!;
  for (let i = 0; i < 25; i++) pipe.onData(encodePcmFrame(frame(i)));
  resolve({
    offer: (pcm) => {
      offered.push(pcm.sequence);
      return true;
    },
    close: async () => undefined,
  });
  await vi.waitFor(() => expect(offered).toHaveLength(20));
  expect(offered[0]).toBe(5);
  expect(offered.at(-1)).toBe(24);
  expect(emit).toHaveBeenCalledWith('transcriptionLag', { status: 'lagging', lagMs: 0 });
  await session.stop();
});

it('rejects malformed live PCM without stopping durable recording', async () => {
  const emit = vi.fn();
  const close = vi.fn(async () => undefined);
  const session = new LiveCaptureSession({} as Library, 'meeting', emit, setup, async () => ({
    offer: () => true,
    close,
  }));
  const pipe = session.startHelper()!;
  pipe.onData(Buffer.from('not a valid live frame'.repeat(4)));
  await vi.waitFor(() =>
    expect(emit).toHaveBeenCalledWith('transcriptionLag', { status: 'failed', lagMs: 0 }),
  );
  await session.stop();
  expect(close).toHaveBeenCalledOnce();
});

it('loads only existing live tools and forwards CPU settings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scrb-live-config-'));
  roots.push(root);
  const entry = join(root, 'liveWorkerEntry.mjs');
  const server = join(root, 'whisper-server');
  const vadTool = join(root, 'whisper-vad');
  const speech = join(root, 'live-model.bin');
  const vad = join(root, 'vad-model.bin');
  const config = join(root, 'live.json');
  for (const file of [entry, server, vadTool, speech, vad]) await writeFile(file, '');
  await writeFile(
    config,
    JSON.stringify({
      tools: { whisperServer: server, whisperVad: vadTool },
      models: { speechLive: speech, vad },
      whisper: { threads: 4, useGpu: false, audioContext: 768, language: 'en' },
    }),
  );
  const loaded = await readLiveSetup(config, entry);
  expect(loaded).toMatchObject({
    tools: { whisperServer: server, whisperVad: vadTool },
    models: { speechLive: speech, vad },
    whisper: { threads: 4, useGpu: false, audioContext: 768, language: 'en' },
    workerArgs: [entry],
  });
  await rm(vad);
  expect(await readLiveSetup(config, entry)).toBeNull();
});
