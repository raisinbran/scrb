import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { copyFile, mkdtemp, readFile, readdir, rm, truncate, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assembleChunks, decodeChunk, pcmToWav } from '../src/audio.js';
import { toolsIn, type ModelPaths } from '../src/config.js';
import {
  ImportError,
  importAudioFile,
  readChunkManifest,
  sweepAbandonedImports,
  type ImportOptions,
} from '../src/importFile.js';

const bin = join(import.meta.dirname, '../.bin');
const fixtures = join(import.meta.dirname, 'fixtures');
const tools = toolsIn(bin);
const haveFfmpeg = existsSync(tools.ffmpeg);

function tone(seconds: number, hz = 440): Int16Array {
  const out = new Int16Array(seconds * 16_000);
  for (let i = 0; i < out.length; i++) out[i] = Math.sin((2 * Math.PI * hz * i) / 16_000) * 8000;
  return out;
}

const sha = async (p: string): Promise<string> =>
  createHash('sha256').update(await readFile(p)).digest('hex');

describe.skipIf(!haveFfmpeg)('importAudioFile', () => {
  let dir: string;
  let meetingDir: string;
  const run = (sourcePath: string, extra: Partial<ImportOptions> = {}) =>
    importAudioFile({ tools, sourcePath, meetingDir, ...extra });
  const failure = async (p: Promise<unknown>): Promise<ImportError> => {
    const err = await p.then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(ImportError);
    return err as ImportError;
  };
  const expectNothingLeft = async (): Promise<void> => {
    const left = (await readdir(dir)).filter((n) => n.startsWith('meeting'));
    expect(left).toEqual([]);
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'scrb-import-'));
    meetingDir = join(dir, 'meeting-1');
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  for (const name of ['speech.wav', 'speech.mp3', 'speech-aac.m4a', 'speech-alac.m4a', 'speech.flac', 'speech.opus']) {
    it(`imports ${name} into 5 s Opus chunks and leaves the source alone`, async () => {
      const source = join(dir, name);
      await copyFile(join(fixtures, name), source);
      const when = new Date('2026-03-04T10:00:00Z');
      await utimes(source, when, when);
      const before = await sha(source);
      const fractions: number[] = [];

      const result = await run(source, { onProgress: (p) => fractions.push(p.fraction) });

      expect(await sha(source)).toBe(before);
      expect(statSync(source).mtime).toEqual(when);
      expect(result.fileDate).toEqual(when);
      expect(result.durationMs).toBeGreaterThan(9000);
      expect(result.durationMs).toBeLessThan(12_000);
      expect(result.truncated).toBe(false);
      expect(result.chunks.length).toBe(Math.ceil(result.durationMs / 5000));
      expect(fractions.at(-1)).toBe(1);
      expect(await readChunkManifest(meetingDir)).toEqual(result.chunks);
      const pcm = await decodeChunk(tools, result.chunks[0]!.path);
      expect(pcm.length / 16_000).toBeCloseTo(5, 0);
      expect(pcm.some((s) => Math.abs(s) > 500)).toBe(true);
      expect((await readdir(meetingDir)).sort()).toEqual(['audio']);
      await expect(sweepAbandonedImports(dir)).resolves.toEqual([]);
    });
  }

  it('downmixes stereo to one track', async () => {
    const source = join(dir, 'stereo.flac');
    await copyFile(join(fixtures, 'stereo.flac'), source);
    const result = await run(source);
    const pcm = await decodeChunk(tools, result.chunks[0]!.path);
    expect(pcm.some((s) => Math.abs(s) > 500)).toBe(true);
  });

  it('rejects a missing file', async () => {
    expect((await failure(run(join(dir, 'gone.mp3')))).code).toBe('not_found');
    await expectNothingLeft();
  });

  it('gives a plain reason for a damaged file with a good name', async () => {
    const source = join(dir, 'bad.mp3');
    await writeFile(source, Buffer.alloc(4096, 0x41));
    const err = await failure(run(source));
    expect(err.code).toBe('unreadable');
    expect(err.userMessage).toMatch(/damaged/);
    await expectNothingLeft();
  });

  it('rejects an unsupported type whatever its contents', async () => {
    const source = join(dir, 'notes.txt');
    await writeFile(source, 'hello');
    expect((await failure(run(source))).code).toBe('unsupported_format');
    const renamed = join(dir, 'audio.mkv');
    await copyFile(join(fixtures, 'speech.wav'), renamed);
    expect((await failure(run(renamed))).code).toBe('unsupported_format');
    await expectNothingLeft();
  });

  it.skipIf(!process.env['SCRB_VIDEO_FIXTURE'])('rejects a video file', async () => {
    const err = await failure(run(process.env['SCRB_VIDEO_FIXTURE']!));
    expect(err.code).toBe('video_not_accepted');
    await expectNothingLeft();
  });

  it('flags a cut-off file instead of pretending it is whole', async () => {
    const source = join(dir, 'cut.flac');
    await copyFile(join(fixtures, 'speech.flac'), source);
    const whole = await run(source);
    await rm(meetingDir, { recursive: true });
    await truncate(source, Math.floor(statSync(source).size / 3));
    const cut = await run(source);
    expect(cut.durationMs).toBeLessThan(whole.durationMs);
    expect(cut.truncated).toBe(true);
  });

  it('refuses to start while recording', async () => {
    const err = await failure(run(join(fixtures, 'speech.wav'), { recording: { isRecording: () => true } }));
    expect(err.code).toBe('recording_active');
    await expectNothingLeft();
  });

  describe('long decode', () => {
    // An hour of tone keeps ffmpeg busy long enough to interrupt.
    const longSource = async (): Promise<string> => {
      const source = join(dir, 'long.wav');
      await writeFile(source, pcmToWav(tone(3600)));
      return source;
    };

    it('cancels mid-decode and leaves nothing behind', async () => {
      const source = await longSource();
      const stop = new AbortController();
      const err = await failure(
        run(source, {
          signal: stop.signal,
          onProgress: (p) => {
            if (p.fraction > 0.01) stop.abort();
          },
        }),
      );
      expect(err.code).toBe('cancelled');
      await expectNothingLeft();
    });

    it('stops when a recording begins', async () => {
      const source = await longSource();
      let recording = false;
      const started = run(source, {
        recording: { isRecording: () => recording },
        onProgress: () => {
          recording = true;
        },
      });
      expect((await failure(started)).code).toBe('recording_active');
      await expectNothingLeft();
    });
  }, 60_000);

  it('leaves no meeting when the final pass fails', async () => {
    const models: ModelPaths = {
      speechFinal: '/no/model', speechLive: '/no/model', vad: '/no/model',
      segmentation: '/no/model', embedding: '/no/model',
    };
    const broken = { ...tools, whisperCli: '/usr/bin/false' };
    const err = await failure(
      importAudioFile({
        tools: broken, sourcePath: join(fixtures, 'speech.wav'), meetingDir, transcribe: { models },
      }),
    );
    expect(err.code).toBe('transcription_failed');
    await expectNothingLeft();
  });

  it('never overwrites an existing meeting', async () => {
    const source = join(fixtures, 'speech.wav');
    await run(source);
    await failure(run(source));
    expect((await readdir(dir)).filter((n) => n.includes('importing'))).toEqual([]);
  });

  it('sweeps staging folders abandoned by a crash', async () => {
    await writeFile(join(dir, 'meeting-2.importing-abcd'), '');
    await expect(sweepAbandonedImports(dir)).resolves.toEqual(['meeting-2.importing-abcd']);
    await expect(sweepAbandonedImports(join(dir, 'absent'))).resolves.toEqual([]);
  });

  it('assembles chunks onto the timeline with pauses kept as silence', async () => {
    const result = await run(join(fixtures, 'speech.wav'));
    const [a, b] = result.chunks;
    const out = join(dir, 'out.wav');
    await assembleChunks(tools, [a!, { ...b!, startMs: 8000 }], out, dir);
    const samples = (statSync(out).size - 44) / 2;
    expect(samples / 16_000).toBeCloseTo(8 + b!.durationMs / 1000, 0);
    const wav = await readFile(out);
    const inPause = wav.subarray(44 + 2 * 96_000, 44 + 2 * 112_000);
    expect(inPause.every((x) => x === 0)).toBe(true);
    expect(wav.subarray(44 + 2 * 128_000, 44 + 2 * 136_000).some((x) => x !== 0)).toBe(true);
  });
});
