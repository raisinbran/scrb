import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Library } from '@scrb/storage';
import type { FinalTranscript } from '@scrb/transcription';
import { FinalPassQueue, type RunFinalPass } from './final-pass.ts';
import { APPROVED_EMBEDDING_SHA256, APPROVED_PROFILE_MODEL } from './profile-matching.ts';
import { saveFinalVoices } from './voices.ts';

const MS = 1_000_000;
const approved = async (): Promise<string> => APPROVED_EMBEDDING_SHA256;
const unapproved = async (): Promise<string> => 'f'.repeat(64);

function transcript(embedding: number[] = [3, 4, 0]): FinalTranscript {
  return {
    version: 1,
    durationMs: 3000,
    words: [
      { text: 'hello', startMs: 0, endMs: 500, confidence: 1, track: 'mic', speakerId: 'you' },
      {
        text: 'there',
        startMs: 2000,
        endMs: 2400,
        confidence: 1,
        track: 'meeting',
        speakerId: 'v1',
      },
    ],
    turns: [
      { speakerId: 'you', startMs: 0, endMs: 500, text: 'hello', firstWord: 0, wordCount: 1 },
      { speakerId: 'v1', startMs: 2000, endMs: 2400, text: 'there', firstWord: 1, wordCount: 1 },
    ],
    speakers: [
      { id: 'you', label: 'You', speechMs: 500, embedding: [1, 0, 0], embeddingSegments: 9 },
      { id: 'v1', label: 'Speaker 1', speechMs: 400, embedding, embeddingSegments: 11 },
      { id: 'v2', label: 'Speaker 2', speechMs: 100, embeddingSegments: 0 },
    ],
    spans: [],
    models: { speech: 's', segmentation: 'g', embedding: 'e' },
    timing: { transcribeMs: 1, diarizeMs: 1 },
  };
}

describe('voices.json after a final pass', () => {
  let root: string;
  let library: Library;
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'scrb-voices-'));
    library = await Library.open({ root: join(root, 'library') });
  });
  afterEach(() => library.close());

  async function meeting(buildVoiceProfiles: boolean): Promise<string> {
    const { id } = await library.createMeeting({
      title: 'Invented',
      status: 'finalPassRunning',
      buildVoiceProfiles,
    });
    const { audio } = library.meetingPaths(id);
    mkdirSync(join(audio, 'meeting'), { recursive: true });
    writeFileSync(join(audio, 'meeting', '000001.opus'), 'invented audio');
    writeFileSync(
      join(audio, 'meeting', 'chunks.json'),
      JSON.stringify({
        chunks: [{ file: '000001.opus', startNs: 0, endNs: 3000 * MS }],
        gaps: [],
      }),
    );
    return id;
  }

  it('keeps every other speaker with a voice, unit length, 0600, when the meeting opted in', async () => {
    const id = await meeting(true);
    await saveFinalVoices(library, id, transcript(), '/model.onnx', approved);
    const voices = await library.readVoices(id);
    expect(voices?.modelId).toBe(APPROVED_PROFILE_MODEL);
    expect(voices?.speakers.map((s) => [s.speakerId, s.segments])).toEqual([['v1', 11]]);
    expect(Array.from(voices?.speakers[0]?.embedding ?? [])).toEqual([
      Math.fround(0.6),
      Math.fround(0.8),
      0,
    ]);
    if (process.platform !== 'win32') {
      expect(statSync(library.meetingPaths(id).voices).mode & 0o777).toBe(0o600);
    }
  });

  it('a re-run that no longer qualifies removes the old voices.json', async () => {
    const id = await meeting(true);
    await saveFinalVoices(library, id, transcript(), '/model.onnx', approved);
    expect(await library.readVoices(id)).not.toBeNull();
    await saveFinalVoices(library, id, transcript(), '/model.onnx', unapproved);
    expect(await library.readVoices(id)).toBeNull();
  });

  it('writes nothing when the meeting did not opt in, or the model is not the approved one', async () => {
    const off = await meeting(false);
    await saveFinalVoices(library, off, transcript(), '/model.onnx', approved);
    expect(await library.readVoices(off)).toBeNull();
    const on = await meeting(true);
    await saveFinalVoices(library, on, transcript(), '/model.onnx', unapproved);
    await saveFinalVoices(library, on, transcript(), undefined, approved);
    expect(await library.readVoices(on)).toBeNull();
  });

  it('skips vectors that are empty, zero or not finite', async () => {
    const id = await meeting(true);
    for (const bad of [
      [0, 0, 0],
      [Number.NaN, 1, 0],
    ]) {
      await saveFinalVoices(library, id, transcript(bad), '/model.onnx', approved);
      expect((await library.readVoices(id))?.speakers).toEqual([]);
    }
  });

  it('the queue writes it before applying the transcript, and a re-run replaces it', async () => {
    const id = await meeting(true);
    const run: RunFinalPass = async (input) => {
      input.onEmbeddingModel?.('/model.onnx');
      return transcript();
    };
    const queue = new FinalPassQueue(
      library,
      run,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      approved,
    );
    queue.enqueue(id);
    await queue.idle();
    expect((await library.readVoices(id))?.speakers).toHaveLength(1);
    expect((await library.getMeeting(id)).status).toBe('ready');

    await library.updateMeeting(id, { status: 'finalPassRunning', statusBeforeReprocess: 'ready' });
    const second = new FinalPassQueue(
      library,
      async (input) => {
        input.onEmbeddingModel?.('/model.onnx');
        return { ...transcript(), speakers: [] };
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      approved,
    );
    second.enqueue(id);
    await second.idle();
    expect((await library.readVoices(id))?.speakers).toEqual([]);
  });

  it('a queue for a meeting that did not opt in leaves no voices.json', async () => {
    const id = await meeting(false);
    const queue = new FinalPassQueue(
      library,
      async () => transcript(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      approved,
    );
    queue.enqueue(id);
    await queue.idle();
    expect(await library.readVoices(id)).toBeNull();
  });
});
