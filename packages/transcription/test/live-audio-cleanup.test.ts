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
