// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { Library, resolveDisplay } from '@scrb/storage';
import { openTestLibrary } from '@scrb/storage/test-library';
import type { TimedLiveSegment } from '@scrb/transcription';
import { LiveTranscriptSink } from './live-transcript.ts';

const roots: string[] = [];
const libraries: Library[] = [];
afterEach(async () => {
  for (const lib of libraries.splice(0)) await lib.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'scrb-bridge-'));
  roots.push(root);
  const library = await openTestLibrary({ root });
  libraries.push(library);
  const meeting = await library.createMeeting({ title: 'Invented speech', date: '2026-11-01' });
  return { library, id: meeting.id };
}
const segment = (id = 'seg'): TimedLiveSegment => ({
  id,
  track: 'mic',
  sequence: 4,
  startMs: 100,
  endMs: 390,
  text: 'hello world',
  speakerId: 'you',
  speakerLabel: 'You',
  provisional: true,
  words: [
    { text: 'hello', startMs: 100, endMs: 190, confidence: 1 },
    { text: 'world', startMs: 300, endMs: 390, confidence: 1 },
  ],
});

it('persists individual timings and stable identities', async () => {
  const { library, id } = await setup();
  const emit = vi.fn();
  let sink = new LiveTranscriptSink(library, id, emit);
  sink.handle({ type: 'segment', segment: segment() });
  sink.offer({ ...segment('other'), track: 'meeting' });
  await sink.stop();
  const before = await library.readTranscript(id);
  expect(before.segments.map((s) => s.track)).toEqual(['microphone', 'meeting']);
  expect(before.segments[0]!.words.map((w) => [w.text, w.startMs, w.endMs])).toEqual([
    ['hello', 100, 190],
    ['world', 300, 390],
  ]);
  sink = new LiveTranscriptSink(library, id, emit);
  sink.offer(segment());
  await sink.stop();
  expect((await library.readTranscript(id)).revision).toBe(before.revision);
  sink = new LiveTranscriptSink(library, id, emit);
  sink.offer({
    ...segment(),
    words: [...segment().words, { text: 'again', startMs: 400, endMs: 450, confidence: 1 }],
  });
  await sink.stop();
  const after = await library.readTranscript(id);
  expect(after.segments).toHaveLength(2);
  expect(
    after.segments
      .find((s) => s.id === 'seg')!
      .words.slice(0, 2)
      .map((w) => w.id),
  ).toEqual(before.segments[0]!.words.map((w) => w.id));
  expect(
    emit.mock.calls.filter(([name]) => name === 'transcriptChanged').at(-1)?.[1].revision,
  ).toBe(after.revision);
});

it('waits for persistence before publishing', async () => {
  const { library, id } = await setup();
  const emit = vi.fn();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const real = library.appendSegments.bind(library);
  const append = vi.spyOn(library, 'appendSegments');
  append.mockImplementation(async (...args) => {
    await gate;
    return real(...args);
  });
  const sink = new LiveTranscriptSink(library, id, emit);
  sink.offer(segment());
  await vi.waitFor(() => expect(append).toHaveBeenCalledOnce());
  expect(emit.mock.calls.filter(([n]) => n === 'transcriptChanged')).toEqual([]);
  expect(sink.getProgress()).toMatchObject({
    lastSavedAtMs: null,
    lastPublishedAtMs: null,
    lastRevision: null,
    queued: 0,
    draining: true,
  });
  release();
  await sink.stop();
  expect(emit.mock.calls.find(([n]) => n === 'transcriptChanged')?.[1].revision).toBe(
    (await library.readTranscript(id)).revision,
  );
  expect(sink.getProgress()).toMatchObject({
    lastSavedAtMs: expect.any(Number),
    lastPublishedAtMs: expect.any(Number),
    lastRevision: (await library.readTranscript(id)).revision,
    queued: 0,
    draining: false,
  });
});

it('preserves corrections during live revisions', async () => {
  const { library, id } = await setup();
  let sink = new LiveTranscriptSink(library, id, vi.fn());
  sink.offer(segment());
  await sink.stop();
  const old = await library.readTranscript(id);
  const frozen = old.segments[0]!.words[0]!.id;
  await library.applyCorrection(id, { wordIds: [frozen], replacement: 'corrected' });
  const emit = vi.fn();
  sink = new LiveTranscriptSink(library, id, emit);
  sink.offer({
    ...segment(),
    words: [{ text: 'wrong', startMs: 100, endMs: 190, confidence: 1 }, segment().words[1]!],
  });
  await sink.stop();
  const saved = await library.readTranscript(id);
  expect(
    resolveDisplay(saved)
      .flatMap((s) => s.tokens)
      .some((w) => w.text === 'corrected' && w.wordIds.includes(frozen)),
  ).toBe(true);
  for (const [name, event] of emit.mock.calls)
    if (name === 'transcriptChanged') {
      expect(
        event.change.segments
          .flatMap((s: { words: { text: string }[] }) => s.words)
          .some((w: { text: string }) => w.text === 'wrong'),
      ).toBe(false);
      expect(event.revision).toBe(saved.revision);
    }
});

it('keeps failure sticky during pending persistence', async () => {
  const { library, id } = await setup();
  const emit = vi.fn();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const real = library.appendSegments.bind(library);
  const append = vi.spyOn(library, 'appendSegments').mockImplementation(async (...args) => {
    await gate;
    return real(...args);
  });
  const sink = new LiveTranscriptSink(library, id, emit);
  sink.offer(segment());
  await vi.waitFor(() => expect(append).toHaveBeenCalledOnce());
  sink.workerFailed();
  release();
  await sink.stop();
  expect(emit.mock.calls.filter(([n]) => n === 'transcriptionLag').at(-1)?.[1].status).toBe(
    'failed',
  );
});

it('does not publish failed persistence', async () => {
  const { library, id } = await setup();
  vi.spyOn(library, 'appendSegments').mockRejectedValue(new Error('invented write failure'));
  const emit = vi.fn();
  const sink = new LiveTranscriptSink(library, id, emit);
  sink.offer(segment());
  await sink.stop();
  expect(emit.mock.calls.filter(([n]) => n === 'transcriptChanged')).toEqual([]);
  expect(emit.mock.calls.find(([n]) => n === 'transcriptionLag')?.[1].status).toBe('failed');
  expect((await library.readTranscript(id)).segments).toEqual([]);
});

it('retries correction races without losing edits', async () => {
  const { library, id } = await setup();
  let sink = new LiveTranscriptSink(library, id, vi.fn());
  sink.offer(segment());
  await sink.stop();
  const word = (await library.readTranscript(id)).segments[0]!.words[0]!.id;
  const real = library.replaceLiveSegments.bind(library);
  vi.spyOn(library, 'replaceLiveSegments').mockImplementationOnce(async (...args) => {
    await library.applyCorrection(id, { wordIds: [word], replacement: 'owner edit' });
    return real(...args);
  });
  sink = new LiveTranscriptSink(library, id, vi.fn());
  sink.offer({
    ...segment(),
    words: [segment().words[0]!, { text: 'earth', startMs: 300, endMs: 390, confidence: 1 }],
  });
  await sink.stop();
  expect(
    resolveDisplay(await library.readTranscript(id)).flatMap((s) => s.tokens.map((w) => w.text)),
  ).toEqual(['owner edit', 'earth']);
});

it('replaces correction fragments across revisions and reconnects', async () => {
  const { library, id } = await setup();
  let sink = new LiveTranscriptSink(library, id, vi.fn());
  sink.offer(segment());
  await sink.stop();
  const frozen = (await library.readTranscript(id)).segments[0]!.words[0]!.id;
  await library.applyCorrection(id, { wordIds: [frozen], replacement: 'owner edit' });
  for (const text of ['hello', 'wrong']) {
    sink = new LiveTranscriptSink(library, id, vi.fn());
    sink.offer({
      ...segment(),
      words: [
        { text, startMs: 100, endMs: 190, confidence: 1 },
        { text: 'earth', startMs: 300, endMs: 390, confidence: 1 },
      ],
    });
    await sink.stop();
    const tokens = resolveDisplay(await library.readTranscript(id)).flatMap((s) => s.tokens);
    expect(tokens.map((w) => w.text)).toEqual(['owner edit', 'earth']);
    expect(tokens[0]!.wordIds).toContain(frozen);
  }
});

it('bridges invented PCM into persisted words', async () => {
  const { LivePcmEngine } = await import('@scrb/transcription');
  const { library, id } = await setup();
  const sink = new LiveTranscriptSink(library, id, vi.fn());
  const engine = new LivePcmEngine(
    {
      detect: async (_track, pcm) => [{ startMs: 0, endMs: pcm.length / 16 }],
      transcribe: async () => segment().words,
    },
    (s) => sink.handle({ type: 'segment', segment: s }),
    () => undefined,
  );
  for (let i = 0; i < 5; i++)
    await engine.push({
      track: 'mic',
      sequence: i,
      generation: 0,
      startNs: (1000 + i * 100) * 1e6,
      boundary: false,
      samples: new Int16Array(1600).fill(100),
    });
  await engine.push({
    track: 'mic',
    sequence: 5,
    generation: 0,
    startNs: 1500e6,
    boundary: true,
    samples: new Int16Array(),
  });
  await sink.stop();
  engine.close();
  const saved = await library.readTranscript(id);
  expect(saved.segments[0]!.words.map((w) => [w.text, w.startMs, w.endMs])).toEqual([
    ['hello', 1100, 1190],
    ['world', 1300, 1390],
  ]);
});

it('bounds pending provisional updates', async () => {
  const { library, id } = await setup();
  const real = library.appendSegments.bind(library);
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const write = vi.spyOn(library, 'appendSegments').mockImplementation(async (...args) => {
    await gate;
    return real(...args);
  });
  const sink = new LiveTranscriptSink(library, id, vi.fn(), 2);
  sink.offer(segment('first'));
  sink.offer(segment('second'));
  sink.offer(segment('third'));
  sink.offer(segment('fourth'));
  await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
  release();
  await sink.stop();
  expect((await library.readTranscript(id)).segments.map((s) => s.id)).toEqual([
    'first',
    'third',
    'fourth',
  ]);
});

it('rejects live words after final transcription', async () => {
  const { library, id } = await setup();
  const sink = new LiveTranscriptSink(library, id, vi.fn());
  const real = library.appendSegments.bind(library);
  vi.spyOn(library, 'appendSegments').mockImplementationOnce(async (...args) => {
    await library.applyFinalPass(id, {
      segments: [
        {
          id: 'final',
          speakerId: 'you',
          track: 'microphone',
          pass: 'final',
          words: [{ id: 'final-word', text: 'final', startMs: 0, endMs: 100 }],
        },
      ],
      speakers: [
        {
          id: 'you',
          label: 'You',
          name: null,
          profileId: null,
          userNamed: false,
          mergedInto: null,
        },
      ],
    });
    return real(...args);
  });
  sink.offer(segment());
  await sink.stop();
  expect((await library.readTranscript(id)).segments.map((s) => s.pass)).toEqual(['final']);
});
