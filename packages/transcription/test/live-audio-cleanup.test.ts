import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { toolsIn, type ModelPaths } from '../src/config.js';
import { LiveAudioWorker, type LiveAudioEvent } from '../src/liveAudioWorker.js';
import { runToCompletion } from '../src/worker.js';

const fault = vi.hoisted(() => ({ remove: false }));
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rm: (...args: Parameters<typeof rm>) => {
      if (fault.remove && String(args[0]).includes('scrb-live-pcm-'))
        return Promise.reject(new Error('invented removal failure'));
      return actual.rm(...args);
    },
  };
});

it('bounds collected model-tool stdout and kills an invented noisy worker', async () => {
  await expect(
    runToCompletion({
      name: 'invented-vad',
      command: process.execPath,
      args: ['-e', 'setInterval(()=>process.stdout.write("x".repeat(65536)),1)'],
      maxStdoutBytes: 1024,
      timeoutMs: 5000,
    }),
  ).rejects.toThrow('Worker output limit exceeded');
});

it('reports scratch cleanup failure without rejecting into recording or hiding the retained directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scrb-live-cleanup-test-'));
  const events: LiveAudioEvent[] = [];
  const models: ModelPaths = {
    speechLive: 'unused',
    speechFinal: 'unused',
    vad: 'unused',
    segmentation: 'unused',
    embedding: 'unused',
  };
  const worker = await LiveAudioWorker.start({
    tools: toolsIn('unused'),
    models,
    tempRoot: root,
    onEvent: (event) => events.push(event),
    startModels: async () => ({
      port: 12345,
      detect: async () => [],
      close: async () => undefined,
    }),
    workerArgs: ['-e', 'process.on("message",()=>{});'],
  });
  try {
    fault.remove = true;
    await expect(worker.close()).resolves.toBeUndefined();
    expect(events).toContainEqual({ type: 'failed', reason: 'cleanup-failed' });
    expect((await readdir(root)).some((name) => name.startsWith('scrb-live-pcm-'))).toBe(true);
    expect(JSON.stringify(events)).not.toContain('invented removal failure');
  } finally {
    fault.remove = false;
    await rm(root, { recursive: true, force: true });
  }
});

it.each(['reject', 'hang'])('reports failed model cleanup: %s', async (mode) => {
  const root = await mkdtemp(join(tmpdir(), 'scrb-model-cleanup-'));
  const events: LiveAudioEvent[] = [];
  let started = false;
  const models: ModelPaths = {
    speechLive: 'unused',
    speechFinal: 'unused',
    vad: 'unused',
    segmentation: 'unused',
    embedding: 'unused',
  };
  const worker = await LiveAudioWorker.start({
    tools: toolsIn('unused'),
    models,
    tempRoot: root,
    cleanupTimeoutMs: 30,
    onEvent: (e) => events.push(e),
    workerArgs: ['-e', 'process.on("message",()=>{});'],
    startModels: async () => {
      started = true;
      return {
        port: 12345,
        detect: async () => [],
        close: () =>
          mode === 'reject'
            ? Promise.reject(new Error('private detail'))
            : new Promise<void>(() => {}),
      };
    },
  });
  try {
    await vi.waitFor(() => expect(started).toBe(true));
    worker.offer({
      track: 'mic',
      sequence: 0,
      generation: 0,
      startNs: 0,
      boundary: false,
      samples: new Int16Array(1600),
    });
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        worker.close(),
        new Promise<never>((_resolve, reject) => {
          deadline = setTimeout(() => reject(new Error('Shutdown exceeded deadline')), 1000);
        }),
      ]);
    } finally {
      clearTimeout(deadline);
    }
    expect(events.filter((e) => e.type === 'failed')).toEqual([
      { type: 'failed', reason: 'cleanup-failed' },
    ]);
    expect(events.filter((e) => e.type === 'skipped')).toContainEqual({
      type: 'skipped',
      gap: { track: 'mic', startMs: 0, endMs: 100, reason: 'closed' },
    });
    expect(await readdir(root)).toEqual([]);
    expect(JSON.stringify(events)).not.toContain('private detail');
  } finally {
    await worker.close();
    await rm(root, { recursive: true, force: true });
  }
});

it('refuses restart after cleanup failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scrb-restart-cleanup-'));
  const events: LiveAudioEvent[] = [];
  let starts = 0;
  const models: ModelPaths = {
    speechLive: 'unused',
    speechFinal: 'unused',
    vad: 'unused',
    segmentation: 'unused',
    embedding: 'unused',
  };
  const worker = await LiveAudioWorker.start({
    tools: toolsIn('unused'),
    models,
    tempRoot: root,
    onEvent: (e) => events.push(e),
    workerArgs: ['-e', 'process.on("message",()=>process.exit(3));'],
    startModels: async () => {
      starts++;
      return {
        port: 12345,
        detect: async () => [],
        close: async () => {
          throw new Error('private');
        },
      };
    },
  });
  try {
    await vi.waitFor(() => expect(events.some((e) => e.type === 'failed')).toBe(true));
    await worker.close();
    expect(starts).toBe(1);
    expect(events.filter((e) => e.type === 'restarting')).toEqual([]);
    expect(events.filter((e) => e.type === 'failed')).toEqual([
      { type: 'failed', reason: 'cleanup-failed' },
    ]);
    expect(await readdir(root)).toEqual([]);
  } finally {
    await worker.close();
    await rm(root, { recursive: true, force: true });
  }
});

it('reports rejected late startup cleanup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'scrb-late-cleanup-'));
  const events: LiveAudioEvent[] = [];
  let release!: () => void;
  let entered = false;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const models: ModelPaths = {
    speechLive: 'unused',
    speechFinal: 'unused',
    vad: 'unused',
    segmentation: 'unused',
    embedding: 'unused',
  };
  const worker = await LiveAudioWorker.start({
    tools: toolsIn('unused'),
    models,
    tempRoot: root,
    onEvent: (e) => events.push(e),
    startModels: async () => {
      entered = true;
      await gate;
      return {
        port: 12345,
        detect: async () => [],
        close: async () => {
          throw new Error('private');
        },
      };
    },
  });
  try {
    await vi.waitFor(() => expect(entered).toBe(true));
    const closing = worker.close();
    release();
    await closing;
    expect(events.filter((e) => e.type === 'failed')).toEqual([
      { type: 'failed', reason: 'cleanup-failed' },
    ]);
    expect(await readdir(root)).toEqual([]);
  } finally {
    release();
    await worker.close();
    await rm(root, { recursive: true, force: true });
  }
});
