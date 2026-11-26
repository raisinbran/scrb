import { createHash } from 'node:crypto';
import {
  existsSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  overallProgress,
  type FinalPassReport,
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
  it('passes no vocabulary hint while hints are off', async () => {
    library.vocabulary.remember({ term: 'Rosmont' });
    library.vocabulary.update(library.vocabulary.remember({ term: 'Quillon' }).id, {
      enabled: false,
    });
    const { id } = await sealedMeeting();
    let hint: string | undefined;
    await runQueue(id, async (input) => {
      hint = input.vocabularyHint;
      return TRANSCRIPT;
    });
    expect(hint).toBe('');
  });

  it('logs one speaker-diagnostics line per pass, with no text or names', async () => {
    const { id } = await sealedMeeting('Quarterly budget');
    await runQueue(id, async (input) => {
      input.onDiagnostics?.({
        clustersBefore: 3,
        clustersAfter: 2,
        clusterSecondsBefore: '120:45:8',
        clusterSecondsAfter: '120:53',
        closestRawSimilarity: 0.71,
        closestFinalSimilarity: 0.46,
        mergeLine: 0.65,
        minSpeakerSeconds: 30,
        shortSpeakerSeconds: -1,
        shortMergeLine: 0.65,
        speechModel: 'ggml-large-v3-turbo-q5_0.bin',
        segmentationModel: 'model.int8.onnx',
        embeddingModel: 'eres2net.onnx',
      });
      return TRANSCRIPT;
    });
    await library.logger.flush();
    const dir = join(root, 'library', 'logs');
    const body = readdirSync(dir)
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('');
    const lines = body
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .filter((l) => l['event'] === 'final-pass-speakers');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      clustersBefore: 3,
      clustersAfter: 2,
      clusterSecondsBefore: '120:45:8',
      closestFinalSimilarity: 0.46,
      embeddingModel: 'eres2net.onnx',
    });
    expect(body).not.toContain('Quarterly');
  });

  let root: string;
  let library: Library;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'scrb-final-'));
    library = await Library.open({ root: join(root, 'library') });
  });

  afterEach(() => library.close());

  const sealedMeeting = async (
    title = 'Sync',
    withMicrophone = false,
  ): Promise<{ id: string; audio: string }> => {
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
    if (withMicrophone) {
      writeFileSync(join(audio, 'microphone', '000001.opus'), 'invented microphone audio');
      writeFileSync(
        join(audio, 'microphone', 'chunks.json'),
        JSON.stringify({
          chunks: [{ file: '000001.opus', startNs: 0, endNs: 2_000 * MS }],
          gaps: [],
        }),
      );
    } else {
      writeFileSync(join(audio, 'microphone', 'chunks.json'), '{"chunks":[],"gaps":[]}');
    }
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

  it('passes both saved tracks through the final pass and persists their speaker labels', async () => {
    const { id, audio } = await sealedMeeting('Two tracks', true);
    let inputTracks: Parameters<RunFinalPass>[0]['tracks'] = [];
    await runQueue(id, async (input) => {
      inputTracks = input.tracks;
      return TRANSCRIPT;
    });

    expect(
      inputTracks.map(({ kind, source }) => {
        if (!('chunks' in source)) throw new Error('Expected final-pass inputs from sealed chunks');
        return {
          kind,
          chunks: source.chunks.map(({ path, startMs, durationMs }) => ({
            path,
            startMs,
            durationMs,
          })),
        };
      }),
    ).toEqual([
      {
        kind: 'mic',
        chunks: [{ path: join(audio, 'microphone', '000001.opus'), startMs: 0, durationMs: 2000 }],
      },
      {
        kind: 'meeting',
        chunks: [{ path: join(audio, 'meeting', '000001.opus'), startMs: 5000, durationMs: 5000 }],
      },
    ]);

    const transcript = await library.readTranscript(id);
    expect(transcript.segments.map(({ track, speakerId }) => [track, speakerId])).toEqual([
      ['microphone', 'you'],
      ['meeting', 'speaker-1'],
    ]);
    expect(transcript.speakers.map(({ id: speakerId, label }) => [speakerId, label])).toEqual([
      ['you', 'You'],
      ['speaker-1', 'Speaker 2'],
    ]);
  });

  it('calls onReady once the meeting is ready, and a throwing listener does not fail the pass', async () => {
    const { id } = await sealedMeeting();
    const seen: string[] = [];
    const queue = new FinalPassQueue(
      library,
      async () => TRANSCRIPT,
      undefined,
      undefined,
      undefined,
      undefined,
      (meetingId) => {
        seen.push(meetingId);
        throw new Error('listener failed');
      },
    );
    queue.enqueue(id);
    await queue.idle();
    expect(seen).toEqual([id]);
    expect((await library.getMeeting(id)).status).toBe('ready');
  });

  it('does not call onReady when the pass fails', async () => {
    const { id } = await sealedMeeting();
    const seen: string[] = [];
    const queue = new FinalPassQueue(
      library,
      async () => {
        throw new Error('boom');
      },
      undefined,
      undefined,
      undefined,
      undefined,
      (meetingId) => seen.push(meetingId),
    );
    queue.enqueue(id);
    await queue.idle();
    expect(seen).toEqual([]);
  });

  it('reports monotonic real progress and ends with finishing at 1', async () => {
    const { id } = await sealedMeeting();
    const reports: FinalPassReport[] = [];
    const queue = new FinalPassQueue(
      library,
      async ({ onProgress }) => {
        onProgress?.({ phase: 'assembling', fraction: 0.5 });
        onProgress?.({ phase: 'transcribing', fraction: 0.5 });
        onProgress?.({ phase: 'transcribing', fraction: 0.3 });
        onProgress?.({ phase: 'diarizing', fraction: 1 });
        onProgress?.({ phase: 'done', fraction: 1 });
        return TRANSCRIPT;
      },
      undefined,
      undefined,
      undefined,
      (report) => reports.push(report),
    );
    queue.enqueue(id);
    await queue.idle();
    const fractions = reports.map((r) => r.fraction);
    expect(fractions).toEqual([...fractions].sort((a, b) => a - b));
    expect(reports[0]).toMatchObject({ meetingId: id, stage: 'queued', fraction: 0 });
    expect(reports.at(-1)).toMatchObject({ stage: 'finishing', fraction: 1 });
    expect(reports.map((r) => r.stage)).toContain('diarizing');
    expect(new Set(reports.map((r) => r.startedAt)).size).toBe(1);
  });

  it('stops reporting when the pass fails', async () => {
    const { id } = await sealedMeeting();
    const reports: FinalPassReport[] = [];
    const queue = new FinalPassQueue(
      library,
      async ({ onProgress }) => {
        onProgress?.({ phase: 'transcribing', fraction: 0.5 });
        throw new Error('boom');
      },
      undefined,
      undefined,
      undefined,
      (report) => reports.push(report),
    );
    queue.enqueue(id);
    await queue.idle();
    expect(reports.map((r) => r.stage)).toEqual(['queued', 'transcribing']);
    expect((await library.getMeeting(id)).status).toBe('transcriptionFailed');
  });

  it('keeps a finished meeting readable when its re-run fails, and clears the marker on success', async () => {
    const { id } = await sealedMeeting();
    await library.updateMeeting(id, { status: 'recovered', statusBeforeReprocess: 'recovered' });
    const failing = new FinalPassQueue(library, async () => {
      throw new Error('boom');
    });
    failing.enqueue(id);
    await failing.idle();
    expect(await library.getMeeting(id)).toMatchObject({
      status: 'recovered',
      statusBeforeReprocess: null,
      transcriptionFailure: null,
    });
    await library.updateMeeting(id, { status: 'finalPassRunning', statusBeforeReprocess: 'ready' });
    const working = new FinalPassQueue(library, async () => TRANSCRIPT);
    working.enqueue(id);
    await working.idle();
    expect(await library.getMeeting(id)).toMatchObject({
      status: 'ready',
      statusBeforeReprocess: null,
    });
  });

  it('restores the old status when a queued re-run loses its audio while waiting', async () => {
    const first = await sealedMeeting('First');
    const { id, audio } = await sealedMeeting('Re-run');
    // The re-run meeting already has a finished transcript from an earlier pass.
    await runQueue(id, async () => TRANSCRIPT);
    const before = await library.readTranscript(id);
    expect(before.segments.length).toBeGreaterThan(0);
    await library.updateMeeting(id, { status: 'finalPassRunning', statusBeforeReprocess: 'ready' });
    let release: () => void = () => undefined;
    const run = vi.fn(async () => {
      await new Promise<void>((resolve) => (release = resolve));
      return TRANSCRIPT;
    });
    const queue = new FinalPassQueue(library, run);
    queue.enqueue(first.id);
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    queue.enqueue(id);
    rmSync(audio, { recursive: true, force: true });
    release();
    await queue.idle();
    expect(run).toHaveBeenCalledTimes(1);
    expect(await library.getMeeting(id)).toMatchObject({
      status: 'ready',
      statusBeforeReprocess: null,
    });
    expect(await library.readTranscript(id)).toEqual(before);
  });

  it('reports a meeting busy until the pass and matching finish', async () => {
    const { id } = await sealedMeeting();
    let release: () => void = () => undefined;
    const matching = async () => {
      await new Promise<void>((resolve) => (release = resolve));
      return undefined;
    };
    const queue = new FinalPassQueue(
      library,
      async () => TRANSCRIPT,
      undefined,
      (() => matching) as never,
    );
    expect(queue.isBusy(id)).toBe(false);
    queue.enqueue(id);
    expect(queue.isBusy(id)).toBe(true);
    await vi.waitFor(async () => expect((await library.getMeeting(id)).status).toBe('ready'));
    expect(queue.isBusy(id)).toBe(true);
    release();
    await queue.idle();
    expect(queue.isBusy(id)).toBe(false);
  });

  it('has work from enqueue until the pass and matching finish', async () => {
    const { id } = await sealedMeeting();
    const queue = new FinalPassQueue(library, async () => TRANSCRIPT);
    expect(queue.hasWork()).toBe(false);
    queue.enqueue(id);
    expect(queue.hasWork()).toBe(true);
    await queue.idle();
    expect(queue.hasWork()).toBe(false);
  });

  it('stops reporting when the pass is cancelled', async () => {
    const { id } = await sealedMeeting();
    const reports: FinalPassReport[] = [];
    let late: (() => void) | undefined;
    const queue = new FinalPassQueue(
      library,
      ({ signal, onProgress }) =>
        new Promise((_, reject) => {
          onProgress?.({ phase: 'transcribing', fraction: 0.2 });
          late = () => onProgress?.({ phase: 'transcribing', fraction: 0.9 });
          signal.addEventListener('abort', () => reject(new Error('stopped')));
        }),
      undefined,
      undefined,
      undefined,
      (report) => reports.push(report),
    );
    queue.enqueue(id);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await queue.shutdown();
    late?.();
    expect(reports.map((r) => r.stage)).toEqual(['queued', 'transcribing']);
    expect(reports.at(-1)!.fraction).toBeLessThan(0.9);
  });

  it('maps every phase inside 0..1 and in order', () => {
    const points = [
      overallProgress('assembling', 0),
      overallProgress('transcribing', 0),
      overallProgress('transcribing', 1),
      overallProgress('diarizing', 0),
      overallProgress('diarizing', 1),
      overallProgress('done', 1),
    ].map((p) => p.fraction);
    expect(points).toEqual([...points].sort((a, b) => a - b));
    expect(points[0]).toBe(0);
    expect(points.at(-1)!).toBeLessThan(1);
    expect(overallProgress('transcribing', Number.NaN).fraction).toBe(0.05);
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

  it('removes scratch files when the pass fails before it starts', async () => {
    const { id } = await sealedMeeting();
    const scratch = join(library.meetingCache(id), 'final-pass');
    await runQueue(id, async ({ workDir }) => {
      mkdirSync(workDir, { recursive: true });
      writeFileSync(join(workDir, 'track-0.wav'), 'invented');
      throw new Error('no tools');
    });
    expect(existsSync(scratch)).toBe(false);
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
