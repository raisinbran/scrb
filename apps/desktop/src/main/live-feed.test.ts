// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { Library } from '@scrb/storage';
import { encodePcmFrame, toolsIn, type LivePcmFrame, type ModelPaths } from '@scrb/transcription';
import { LiveCaptureSession, readLiveSetup, type LiveSetup } from './live-feed.ts';
import { WindowsLivePipePool } from './windows-live-pipe.ts';

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
const liveSessions: LiveCaptureSession[] = [];
afterEach(async () => {
  for (const session of liveSessions.splice(0)) await session.stop();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function testPipes(count = 4): Promise<WindowsLivePipePool> {
  const root = await mkdtemp(join(tmpdir(), 'scrb-win-live-'));
  roots.push(root);
  let index = 0;
  return new WindowsLivePipePool(count, () =>
    process.platform === 'win32'
      ? String.raw`\\.\pipe\scrb-test-${randomUUID()}`
      : join(root, `pipe-${index++}.sock`),
  );
}

async function connectPipe(args: string[]) {
  expect(args[0]).toBe('--live-pipe');
  const name = args[1];
  if (!name) throw new Error('Missing native live pipe name');
  const socket = createConnection(name);
  await once(socket, 'connect');
  return socket;
}

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

it('delivers PCM across helper restarts', async () => {
  const received: LivePcmFrame[][] = [];
  const closed = vi.fn(async () => undefined);
  const session = new LiveCaptureSession({} as Library, 'meeting', vi.fn(), setup, async () => {
    const frames: LivePcmFrame[] = [];
    received.push(frames);
    return {
      offer: (pcm: LivePcmFrame) => {
        frames.push(pcm);
        return true;
      },
      close: closed,
    };
  });
  liveSessions.push(session);
  const pipes = await testPipes();
  await session.prepareWindowsPipes(pipes);

  const firstArgs = session.startWindowsHelper();
  const first = await connectPipe(firstArgs);
  const mic = { ...frame(0), generation: 3 };
  const meeting = { ...frame(0), track: 'meeting' as const, generation: 9 };
  const boundary = { ...frame(1), generation: 3, boundary: true, samples: new Int16Array() };
  const resumed = { ...frame(2), generation: 4 };
  first.write(
    Buffer.concat([mic, meeting, boundary, resumed].map((pcm) => encodePcmFrame(pcm))),
  );
  await vi.waitFor(() =>
    expect(received[0]?.map((pcm) => [pcm.track, pcm.sequence, pcm.generation, pcm.boundary])).toEqual([
      ['mic', 0, 3, false],
      ['meeting', 0, 9, false],
      ['mic', 1, 3, true],
      ['mic', 2, 4, false],
    ]),
  );
  first.end();
  await once(first, 'close');
  await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));

  const secondArgs = session.startWindowsHelper();
  expect(secondArgs[1]).not.toBe(firstArgs[1]);
  const second = await connectPipe(secondArgs);
  second.write(encodePcmFrame(frame(0)));
  await vi.waitFor(() => expect(received[1]?.map((pcm) => pcm.sequence)).toEqual([0]));
  second.destroy();
  await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(2));
  await session.stop();
  expect(pipes.hasNext()).toBe(false);
});

it('isolates malformed Windows PCM frames', async () => {
  const emit = vi.fn();
  const close = vi.fn(async () => undefined);
  const session = new LiveCaptureSession({} as Library, 'meeting', emit, setup, async () => ({
    offer: () => true,
    close,
  }));
  liveSessions.push(session);
  await session.prepareWindowsPipes(await testPipes(1));
  const socket = await connectPipe(session.startWindowsHelper());

  socket.write(Buffer.alloc(64, 255));
  await vi.waitFor(() =>
    expect(emit).toHaveBeenCalledWith('transcriptionLag', { status: 'failed', lagMs: 0 }),
  );
  await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
  await session.stop();
});

it('isolates Windows model startup failure', async () => {
  const emit = vi.fn();
  const session = new LiveCaptureSession(
    {} as Library,
    'meeting',
    emit,
    setup,
    async () => {
      throw new Error('Invented model startup failure');
    },
  );
  liveSessions.push(session);
  await session.prepareWindowsPipes(await testPipes(1));
  const args = session.startWindowsHelper();
  await vi.waitFor(() =>
    expect(emit).toHaveBeenCalledWith('transcriptionLag', { status: 'failed', lagMs: 0 }),
  );
  const socket = await connectPipe(args);
  socket.write(encodePcmFrame(frame(0)));
  socket.end();
  await session.stop();
});

it('keeps capture available after pipe bind failure', async () => {
  const emit = vi.fn();
  const session = new LiveCaptureSession({} as Library, 'meeting', emit, setup);
  liveSessions.push(session);
  const pipes = await testPipes(1);
  vi.spyOn(pipes, 'prepare').mockRejectedValue(new Error('Invented pipe bind failure'));

  await session.prepareWindowsPipes(pipes);

  expect(session.startWindowsHelper()).toEqual([]);
  expect(emit).toHaveBeenCalledWith('transcriptionLag', { status: 'failed', lagMs: 0 });
  await session.stop();
});
