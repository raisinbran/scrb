import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Library } from '@scrb/storage';
import type { FinalTranscript } from '@scrb/transcription';
import {
  createFinalPassRunner,
  FinalPassQueue,
  MISSING_TOOLS_MESSAGE,
  NOT_ENABLED_MESSAGE,
  resumeFinalPasses,
  sealedTracks,
  toModelReplacement,
  WORKER_FAILED_MESSAGE,
  type RunFinalPass,
} from './final-pass.ts';

const MS = 1_000_000;

const TRANSCRIPT: FinalTranscript = {
  version: 1,
  durationMs: 3000,
  words: [
    { text: 'hello', startMs: 0, endMs: 500, confidence: 1, track: 'mic', speakerId: 'you' },
    { text: 'there', startMs: 500, endMs: 900, confidence: 1, track: 'mic', speakerId: 'you' },
    {
      text: 'hi',
      startMs: 2000,
      endMs: 2400,
      confidence: 1,
      track: 'meeting',
      speakerId: 'speaker-1',
    },
  ],
  turns: [
    { speakerId: 'you', startMs: 0, endMs: 900, text: 'hello there', firstWord: 0, wordCount: 2 },
    { speakerId: 'speaker-1', startMs: 2000, endMs: 2400, text: 'hi', firstWord: 2, wordCount: 1 },
  ],
  speakers: [{ id: 'you', label: 'You', speechMs: 900, embeddingSegments: 0 }],
  spans: [],
  models: { speech: 's', segmentation: 'g', embedding: 'e' },
  timing: { transcribeMs: 1, diarizeMs: 1 },
};

function fakeTool(dir: string, name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

function hashTree(dir: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    hashes[path] = createHash('sha256').update(readFileSync(path)).digest('hex');
  }
  return hashes;
}

describe('final pass after Stop', () => {
  let root: string;
  let library: Library;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'scrb-final-'));
    library = await Library.open({ root: join(root, 'library') });
  });

  afterEach(() => library.close());

  const sealedMeeting = async (title = 'Sync'): Promise<{ id: string; audio: string }> => {
    const { id } = await library.createMeeting({ title, status: 'finalPassRunning' });
    const { audio } = library.meetingPaths(id);
    mkdirSync(join(audio, 'meeting'), { recursive: true });
    mkdirSync(join(audio, 'microphone'), { recursive: true });
    writeFileSync(join(audio, 'meeting', '000001.opus'), 'invented audio');
    writeFileSync(
      join(audio, 'meeting', 'chunks.json'),
      JSON.stringify({
        chunks: [{ file: '000001.opus', startNs: 5000 * MS, endNs: 10_000 * MS }],
        gaps: [],
      }),
    );
    writeFileSync(join(audio, 'microphone', 'chunks.json'), '{"chunks":[],"gaps":[]}');
    return { id, audio };
  };

  const runQueue = async (id: string, run: RunFinalPass): Promise<void> => {
    const queue = new FinalPassQueue(library, run);
    queue.enqueue(id);
    await queue.idle();
  };

  it('reads sealed chunks onto the timeline and skips an empty track', async () => {
    const { audio } = await sealedMeeting();
    expect(sealedTracks(audio)).toEqual([
      {
        kind: 'meeting',
        source: {
          chunks: [
            { path: join(audio, 'meeting', '000001.opus'), startMs: 5000, durationMs: 5000 },
          ],
        },
      },
    ]);
  });

  it('gives each segment its track and names a fallback speaker', () => {
    const { segments, speakers } = toModelReplacement(TRANSCRIPT);
    expect(segments.map((s) => [s.track, s.pass, s.words.map((w) => w.text)])).toEqual([
      ['microphone', 'final', ['hello', 'there']],
      ['meeting', 'final', ['hi']],
    ]);
    expect(speakers?.map((s) => [s.id, s.label])).toEqual([
      ['you', 'You'],
      ['speaker-1', 'Speaker 2'],
    ]);
  });

  it('moves the meeting to ready with its transcript, using scratch space outside it', async () => {
    const { id } = await sealedMeeting();
    let workDir = '';
    await runQueue(id, async (input) => {
      workDir = input.workDir;
      return TRANSCRIPT;
    });
    expect((await library.getMeeting(id)).status).toBe('ready');
    expect((await library.readTranscript(id)).segments).toHaveLength(2);
    expect(workDir.startsWith(library.meetingPaths(id).folder)).toBe(false);
  });

  it('runs meetings one at a time', async () => {
    const first = await sealedMeeting('One');
    const second = await sealedMeeting('Two');
    let active = 0;
    let most = 0;
    const queue = new FinalPassQueue(library, async () => {
      most = Math.max(most, ++active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return TRANSCRIPT;
    });
    queue.enqueue(first.id);
    queue.enqueue(second.id);
    await queue.idle();
    expect(most).toBe(1);
    expect((await library.getMeeting(second.id)).status).toBe('ready');
  });

  it('fails clearly and keeps the audio when the config is unreadable', async () => {
    const { id, audio } = await sealedMeeting();
    const before = hashTree(audio);
    await runQueue(id, createFinalPassRunner(join(root, 'absent.json')));
    expect(await library.getMeeting(id)).toMatchObject({
      status: 'transcriptionFailed',
      transcriptionFailure: MISSING_TOOLS_MESSAGE,
    });
    expect(hashTree(audio)).toEqual(before);
  });

  it('fails clearly when a tool or model is missing', async () => {
    const { id } = await sealedMeeting();
    const config = join(root, 'config.json');
    const ffmpeg = fakeTool(root, 'ffmpeg', 'exit 0');
    writeFileSync(config, JSON.stringify({ tools: { ffmpeg }, models: {} }));
    await runQueue(id, createFinalPassRunner(config));
    expect((await library.getMeeting(id)).transcriptionFailure).toBe(MISSING_TOOLS_MESSAGE);
  });

  it('leaves saved audio byte for byte when a worker process is killed', async () => {
    const { id, audio } = await sealedMeeting();
    const before = hashTree(audio);
    const model = join(root, 'model');
    writeFileSync(model, 'invented');
    const config = join(root, 'config.json');
    writeFileSync(
      config,
      JSON.stringify({
        tools: {
          ffmpeg: fakeTool(root, 'ffmpeg', 'head -c 3200 /dev/zero'),
          whisperCli: fakeTool(root, 'whisper-cli', 'kill -9 $$'),
          sherpaSidecar: fakeTool(root, 'scrb-sherpa', 'exit 1'),
        },
        models: { speechFinal: model, vad: model, segmentation: model, embedding: model },
      }),
    );
    await runQueue(id, createFinalPassRunner(config));
    expect(await library.getMeeting(id)).toMatchObject({
      status: 'transcriptionFailed',
      transcriptionFailure: WORKER_FAILED_MESSAGE,
    });
    expect(hashTree(audio)).toEqual(before);
  });

  it('marks a damaged chunk list failed rather than leaving it running', async () => {
    const { id, audio } = await sealedMeeting();
    writeFileSync(join(audio, 'meeting', 'chunks.json'), '{');
    await runQueue(id, async () => TRANSCRIPT);
    expect((await library.getMeeting(id)).status).toBe('transcriptionFailed');
  });

  it('skips the tools when nothing was recorded', async () => {
    const { id } = await library.createMeeting({ title: 'Empty', status: 'finalPassRunning' });
    await runQueue(id, async () => {
      throw new Error('should not run');
    });
    expect((await library.getMeeting(id)).status).toBe('ready');
  });

  it('keeps the meeting running on shutdown, so the next launch resumes it', async () => {
    const { id } = await sealedMeeting();
    const queue = new FinalPassQueue(
      library,
      ({ signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('stopped')));
        }),
    );
    queue.enqueue(id);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await queue.shutdown();
    expect((await library.getMeeting(id)).status).toBe('finalPassRunning');

    await library.close();
    library = await Library.open({ root: join(root, 'library') });
    const next = new FinalPassQueue(library, async () => TRANSCRIPT);
    await resumeFinalPasses(library, next);
    await next.idle();
    expect((await library.getMeeting(id)).status).toBe('ready');
  });

  it('ends an interrupted pass when transcription is not turned on', async () => {
    const { id } = await sealedMeeting();
    await library.close();
    library = await Library.open({ root: join(root, 'library') });
    await resumeFinalPasses(library, null);
    expect(await library.getMeeting(id)).toMatchObject({
      status: 'transcriptionFailed',
      transcriptionFailure: NOT_ENABLED_MESSAGE,
    });
  });
});
