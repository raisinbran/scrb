// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { isValidRequest } from '@scrb/contracts';
import { Library, resolveDisplay } from '@scrb/storage';
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
  const library = await Library.open({ root });
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

it('atomically splits attributed words, promotes model labels, publishes replacements and preserves owner names', async () => {
  const { library, id } = await setup();
  const emit = vi.fn();
  const original = { ...segment(), track: 'meeting' as const };
  const save = async (input: TimedLiveSegment) => {
    const sink = new LiveTranscriptSink(library, id, emit);
    sink.offer(input);
    await sink.stop();
    return library.readTranscript(id);
  };
  const initial = await save(original);
  const attributed = {
    ...original,
    wordSpeakers: [
      { id: 'session-1-live-1', label: 'Speaker ?' },
      { id: 'session-1-live-2', label: 'Speaker ?' },
    ],
  };
  const split = await save(attributed);
  expect(split.segments.map((s) => s.speakerId)).toEqual(['session-1-live-1', 'session-1-live-2']);
  expect(split.segments.flatMap((s) => s.words)).toEqual(initial.segments[0]!.words);
  const promoted = await save({
    ...attributed,
    wordSpeakers: attributed.wordSpeakers.map((s, i) => ({ ...s, label: `Speaker ${i + 1}` })),
  });
  expect(promoted.speakers.filter((s) => s.id.includes('-live-')).map((s) => s.label)).toEqual([
    'Speaker 1',
    'Speaker 2',
  ]);
  expect(emit.mock.calls.filter(([name]) => name === 'transcriptChanged').at(-1)![1]).toMatchObject(
    {
      revision: promoted.revision,
      change: { kind: 'replace' },
      speakers: expect.arrayContaining([expect.objectContaining({ label: 'Speaker 1' })]),
    },
  );
  await library.renameSpeaker(id, 'session-1-live-1', 'Owner name');
  const renamed = await save({
    ...attributed,
    wordSpeakers: attributed.wordSpeakers.map((s) => ({ ...s, label: 'Speaker 9' })),
  });
  expect(renamed.speakers.find((s) => s.id === 'session-1-live-1')!.name).toBe('Owner name');
});

it('preserves a frozen correction and history when attribution splits the parent segment', async () => {
  const { library, id } = await setup();
  const input = { ...segment(), track: 'meeting' as const };
  let sink = new LiveTranscriptSink(library, id, vi.fn());
  sink.offer(input);
  await sink.stop();
  const initial = await library.readTranscript(id);
  const frozen = initial.segments[0]!.words[0]!.id;
  await library.applyCorrection(id, { wordIds: [frozen], replacement: 'owner edit' });
  const corrected = await library.readTranscript(id);
  sink = new LiveTranscriptSink(library, id, vi.fn());
  sink.offer({
    ...input,
    wordSpeakers: [
      { id: 'session-1-live-1', label: 'Speaker 1' },
      { id: 'session-1-live-2', label: 'Speaker 2' },
    ],
  });
  await sink.stop();
  const after = await library.readTranscript(id);
  expect(after.corrections).toEqual(corrected.corrections);
  expect(after.undoStack).toEqual(corrected.undoStack);
  expect(after.redoStack).toEqual(corrected.redoStack);
  await library.undo(id);
  expect(
    resolveDisplay(await library.readTranscript(id)).flatMap((s) => s.tokens.map((t) => t.text)),
  ).toEqual(['hello', 'world']);
  await library.redo(id);
  expect(
    resolveDisplay(await library.readTranscript(id)).flatMap((s) => s.tokens.map((t) => t.text)),
  ).toEqual(['owner edit', 'world']);
  expect(resolveDisplay(after).flatMap((s) => s.tokens.map((t) => t.text))).toEqual([
    'owner edit',
    'world',
  ]);
  expect(after.segments.flatMap((s) => s.words).map((w) => w.id)).toEqual(
    initial.segments[0]!.words.map((w) => w.id),
  );
});

it('publishes persisted historical aliases beyond 64 parents and reloads a missed event', async () => {
  const { library, id } = await setup();
  const emit = vi.fn();
  const run = 'invented-1';
  const sink = new LiveTranscriptSink(library, id, emit, 64);
  // Persist sequentially without wall-clock waits or overflowing the bounded input queue.
  for (let i = 0; i < 70; i++) {
    const one = new LiveTranscriptSink(library, id, emit);
    one.offer({
      ...segment(`s${i}`),
      track: 'meeting',
      wordSpeakers: [0, 1].map(() => ({ id: `${run}-live-${(i % 3) + 1}`, label: 'Speaker ?' })),
    });
    await one.stop();
  }
  const before = await library.readTranscript(id);
  sink.handle({
    type: 'speakerMerge',
    merge: {
      from: `${run}-live-1`,
      into: `${run}-live-2`,
      workerRun: run,
      generation: 0,
      order: 1,
      label: 'Speaker 1',
    },
  });
  sink.handle({
    type: 'speakerMerge',
    merge: {
      from: `${run}-live-2`,
      into: `${run}-live-3`,
      workerRun: run,
      generation: 0,
      order: 2,
      label: 'Speaker 1',
    },
  });
  await sink.stop();
  const after = await library.readTranscript(id);
  expect(after.revision).toBe(before.revision + 2);
  expect(after.segments).toEqual(before.segments);
  expect(resolveDisplay(after).every((s) => s.speakerId === `${run}-live-3`)).toBe(true);
  const last = emit.mock.calls.filter(([name]) => name === 'transcriptChanged').at(-1)![1];
  expect(last.revision).toBe(after.revision);
  expect(last.change.kind).toBe('replace');
  // A reader that missed both events obtains the same resolved display from persisted storage.
  expect(resolveDisplay(await library.readTranscript(id))).toEqual(resolveDisplay(after));
});

it.each(['rename', 'manual'] as const)(
  'does not bypass %s through a recent reattribution before the alias',
  async (kind) => {
    const { library, id } = await setup();
    const run = 'protected-1';
    const a = `${run}-live-1`,
      b = `${run}-live-2`,
      c = `${run}-live-3`;
    const attributed = (sid: string, who: string) => ({
      ...segment(sid),
      track: 'meeting' as const,
      wordSpeakers: [0, 1].map(() => ({ id: who, label: 'Speaker ?' })),
    });
    for (const [i, who] of [a, b, c].entries()) {
      const sink = new LiveTranscriptSink(library, id, vi.fn());
      sink.offer(attributed(`s${i}`, who));
      await sink.stop();
    }
    if (kind === 'rename') await library.renameSpeaker(id, a, 'User choice');
    else await library.mergeSpeakers(id, a, c);
    const before = await library.readTranscript(id);
    const sink = new LiveTranscriptSink(library, id, vi.fn());
    sink.offer(attributed('s0', b));
    sink.handle({
      type: 'speakerMerge',
      merge: { from: a, into: b, workerRun: run, generation: 0, order: 1, label: 'Speaker 1' },
    });
    await sink.stop();
    expect(await library.readTranscript(id)).toEqual(before);
  },
);

it('retains coalesced merge edges through a full slow-storage segment queue', async () => {
  const { library, id } = await setup();
  const run = 'burst-1';
  const [a, b, c] = [1, 2, 3].map((n) => `${run}-live-${n}`) as [string, string, string];
  await library.appendSegments(
    id,
    [],
    [a, b, c].map((s) => ({
      id: s,
      label: 'Speaker ?',
      name: null,
      userNamed: false,
      profileId: null,
      mergedInto: null,
    })),
  );
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const read = library.readTranscript.bind(library);
  vi.spyOn(library, 'readTranscript').mockImplementationOnce(async (key) => {
    await gate;
    return read(key);
  });
  const sink = new LiveTranscriptSink(library, id, vi.fn(), 1);
  sink.offer(segment('inflight'));
  sink.handle({
    type: 'speakerMerge',
    merge: { from: a, into: b, workerRun: run, generation: 0, order: 1, label: 'Speaker 1' },
  });
  sink.handle({
    type: 'speakerMerge',
    merge: { from: b, into: c, workerRun: run, generation: 0, order: 2, label: 'Speaker 1' },
  });
  for (let i = 0; i < 10; i++) sink.offer(segment(`burst-${i}`));
  release();
  await sink.stop();
  const saved = await library.readTranscript(id);
  expect(saved.speakers.find((s) => s.id === a)?.mergedInto).toBe(b);
  expect(saved.speakers.find((s) => s.id === b)?.mergedInto).toBe(c);
});

it('gives live words ids that pass the real applyCorrection request validation', async () => {
  const { library, id } = await setup();
  const sink = new LiveTranscriptSink(library, id, vi.fn());
  sink.offer(segment());
  sink.offer({ ...segment('other'), track: 'meeting' });
  await sink.stop();
  for (const s of (await library.readTranscript(id)).segments) {
    for (const word of s.words) {
      expect(
        isValidRequest('applyCorrection', {
          meetingId: id,
          range: { firstWordId: word.id, lastWordId: word.id },
          text: 'Testing!',
          remember: false,
        }),
      ).toBe(true);
    }
  }
});
