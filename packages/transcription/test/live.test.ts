import { existsSync } from 'node:fs';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toolsIn, type ModelPaths } from '../src/config.js';
import { importAudioFile } from '../src/importFile.js';
import { LivePass, type LiveSegment } from '../src/livePass.js';
import type { AudioChunk } from '../src/types.js';
import type { LiveWhisper } from '../src/whisper.js';

const bin = join(import.meta.dirname, '../.bin');
const haveFfmpeg = existsSync(join(bin, 'ffmpeg'));
const models: ModelPaths = {
  speechFinal: 'x', speechLive: 'x', vad: 'x', segmentation: 'x', embedding: 'x',
};

function fakeWhisper(reply: () => Promise<string>): LiveWhisper {
  return { transcribe: reply, kill: () => undefined } as unknown as LiveWhisper;
}

describe.skipIf(!haveFfmpeg || process.platform === 'win32')('LivePass with fake workers', () => {
  let dir: string;
  let chunks: AudioChunk[];
  let tools: ReturnType<typeof toolsIn>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'scrb-live-'));
    const vad = join(dir, 'fake-vad');
    await writeFile(vad, '#!/bin/sh\necho "Speech segment 0: start = 50.00, end = 200.00"\n');
    await chmod(vad, 0o755);
    tools = toolsIn(bin, { whisperVad: vad });
    const source = join(import.meta.dirname, 'fixtures/speech.wav');
    chunks = (await importAudioFile({ tools, sourcePath: source, meetingDir: join(dir, 'm') })).chunks;
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const live = (extra: Partial<ConstructorParameters<typeof LivePass>[0]>): LivePass =>
    new LivePass({ tools, models, workDir: join(dir, 'work'), diarizeMeeting: false, ...extra });

  it('labels the mic "You" and the meeting "Meeting", provisional', async () => {
    const seen: LiveSegment[] = [];
    const pass = live({
      onSegment: (s) => seen.push(s),
      startWhisper: async () => fakeWhisper(async () => 'hello there'),
    });
    await pass.start();
    pass.addChunk('mic', chunks[0]!);
    pass.addChunk('meeting', chunks[0]!);
    await pass.finish();
    expect([...new Set(seen.map((s) => s.speakerLabel))].sort()).toEqual(['Meeting', 'You']);
    expect(seen.every((s) => s.provisional)).toBe(true);
    expect(seen[0]?.startMs).toBe(500);
    expect(existsSync(join(dir, 'work'))).toBe(false);
  });

  it('skips the oldest chunks when behind and reports the span, never blocking', async () => {
    const skipped: number[] = [];
    let release = (): void => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const pass = live({
      maxQueuedChunks: 2,
      onSkipped: (_t, start) => skipped.push(start),
      startWhisper: async () => fakeWhisper(async () => {
        await gate;
        return 'x';
      }),
    });
    await pass.start();
    const c = chunks[0]!;
    for (let i = 0; i < 6; i++) {
      pass.addChunk('meeting', { ...c, startMs: i * 5000 });
    }
    expect(skipped.length).toBeGreaterThanOrEqual(3);
    expect(skipped[0]).toBeLessThan(15_000);
    release();
    await pass.finish();
  });

  it('restarts whisper after a crash and carries on', async () => {
    let starts = 0;
    const seen: string[] = [];
    const pass = live({
      onSegment: (s) => seen.push(s.text),
      startWhisper: async () => {
        const n = ++starts;
        return fakeWhisper(async () => {
          if (n === 1) throw new Error('worker died');
          return 'back';
        });
      },
    });
    await pass.start();
    pass.addChunk('meeting', chunks[0]!);
    await pass.idle();
    pass.addChunk('meeting', chunks[1]!);
    await pass.finish();
    expect(starts).toBe(2);
    expect(seen).toContain('back');
  });

  it('gives up after repeated crashes without throwing to the caller', async () => {
    const reasons: string[] = [];
    const pass = live({
      onFailed: (r) => reasons.push(r),
      startWhisper: async () => fakeWhisper(async () => {
        throw new Error('still dead');
      }),
    });
    await pass.start();
    for (let i = 0; i < 6; i++) {
      pass.addChunk('meeting', chunks[0]!);
      await pass.idle();
    }
    pass.addChunk('meeting', chunks[0]!); // accepted and ignored
    await pass.kill();
    expect(reasons).toEqual(['still dead']);
  });
});
