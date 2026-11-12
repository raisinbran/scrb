import { expect, it, vi } from 'vitest';
import { MeetingDiarizer, type SpeakerModel } from '../src/meetingDiarizer.js';
import { LivePcmEngine, type TimedLiveSegment } from '../src/livePcmEngine.js';
import type { LivePcmFrame } from '../src/livePcmProtocol.js';

const frame = (sequence: number, generation = 0): LivePcmFrame => ({
  track: 'meeting',
  sequence,
  generation,
  startNs: sequence * 100_000_000,
  boundary: false,
  samples: new Int16Array(1600).fill(10),
});
const segment = (): TimedLiveSegment => ({
  id: 'seg',
  track: 'meeting',
  sequence: 49,
  generation: 0,
  startMs: 3000,
  endMs: 4900,
  text: 'one two',
  words: [
    { text: 'one', startMs: 3000, endMs: 3500, confidence: 1 },
    { text: 'two', startMs: 4500, endMs: 4900, confidence: 1 },
  ],
  speakerId: 'meeting',
  speakerLabel: 'Meeting',
  provisional: true,
});
const model = (): SpeakerModel => ({
  diarizeWindow: vi.fn(async () => [
    { start: 0, end: 4, speaker: 0 },
    { start: 4, end: 5, speaker: 1 },
  ]),
  embedPcm: vi.fn(async () => [1, 0]),
  kill: vi.fn(),
});

it('never waits for slow speaker startup before ASR, and cancels stale generations', async () => {
  let resolve!: (m: SpeakerModel) => void;
  const start = vi.fn(
    () =>
      new Promise<SpeakerModel>((r) => {
        resolve = r;
      }),
  );
  const updates = vi.fn();
  const d = new MeetingDiarizer(start, updates);
  const emitted: TimedLiveSegment[] = [];
  const engine = new LivePcmEngine(
    {
      detect: async (_t, samples) => [{ startMs: 0, endMs: samples.length / 16 }],
      transcribe: async () =>
        segment().words.map((w) => ({ ...w, startMs: w.startMs - 3000, endMs: w.endMs - 3000 })),
    },
    (s) => emitted.push(s),
    () => undefined,
    undefined,
    d,
  );
  for (let i = 0; i < 100; i++) await engine.push(frame(i));
  expect(start).toHaveBeenCalledTimes(1);
  expect(emitted.length).toBeGreaterThan(0);
  d.push(frame(100, 1));
  const m = model();
  resolve(m);
  await d.waitForHop();
  expect(m.kill).toHaveBeenCalled();
  expect(updates).not.toHaveBeenCalled();
  engine.close();
});

it('matches only evidenced words, distinguishes two speakers, and preserves the original payload', async () => {
  let calls = 0;
  const valid = model();
  valid.diarizeWindow = async () => [
    { start: 0, end: 3.5, speaker: 0 },
    { start: 3.5, end: 5, speaker: 1 },
  ];
  valid.embedPcm = async () => (++calls % 2 ? [1, 0] : [0, 1]);
  const x = new MeetingDiarizer(
    async () => valid,
    () => undefined,
  );
  for (let i = 0; i < 50; i++) x.push(frame(i));
  await x.waitForHop();
  const before = segment();
  const result = x.attribute(before);
  expect(result.words).toEqual(before.words);
  expect(result.wordSpeakers).toEqual([
    { id: 'live-1', label: 'Speaker ?' },
    { id: 'live-2', label: 'Speaker ?' },
  ]);
  expect(
    x.attribute({ ...before, words: [{ text: 'gap', startMs: 6000, endMs: 6200, confidence: 1 }] })
      .wordSpeakers,
  ).toEqual([{ id: 'meeting', label: 'Meeting' }]);
  x.close();
});

it('counts each hop once and promotes three stable clusters after 30 seconds each', async () => {
  let hop = 0;
  const m = model();
  m.diarizeWindow = async (pcm) => [{ start: 0, end: pcm.length / 16000, speaker: 0 }];
  m.embedPcm = async () => {
    const v = [0, 0, 0];
    v[Math.floor(hop++ / 6)] = 1;
    return v;
  };
  const d = new MeetingDiarizer(
    async () => m,
    () => undefined,
  );
  const ids = new Set<string>();
  for (let i = 0; i < 900; i++) {
    d.push(frame(i));
    if ((i + 1) % 50 === 0) {
      await d.waitForHop();
      const endMs = (i + 1) * 100;
      const result = d.attribute({
        ...segment(),
        id: `seg-${i}`,
        words: [{ text: 'word', startMs: endMs - 300, endMs: endMs - 100, confidence: 1 }],
        startMs: endMs - 300,
        endMs: endMs - 100,
      });
      if ((i + 1) % 300 === 0) ids.add(result.wordSpeakers![0]!.label);
      else if (i === 249) expect(result.wordSpeakers![0]!.label).toBe('Speaker ?');
    }
  }
  expect([...ids]).toEqual(['Speaker 1', 'Speaker 2', 'Speaker 3']);
  d.close();
});

it('degrades failed speakers without retrying or attributing mic, and kills on Stop', async () => {
  const start = vi.fn(async () => {
    throw new Error('private path and model error');
  });
  const d = new MeetingDiarizer(start, vi.fn());
  for (let i = 0; i < 50; i++) d.push({ ...frame(i), track: 'mic' });
  expect(start).not.toHaveBeenCalled();
  for (let i = 0; i < 150; i++) {
    d.push(frame(i));
    await d.waitForHop();
  }
  expect(start).toHaveBeenCalledTimes(1);
  expect(d.attribute(segment()).wordSpeakers?.every((s) => s.id === 'meeting')).toBe(true);
  d.close();
});

it('kills timed-out inference and rejects a result arriving after Stop', async () => {
  vi.useFakeTimers();
  try {
    let finish!: (s: { start: number; end: number; speaker: number }[]) => void;
    const m = model();
    m.diarizeWindow = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    const update = vi.fn();
    const d = new MeetingDiarizer(async () => m, update);
    for (let i = 0; i < 50; i++) d.push(frame(i));
    await Promise.resolve();
    d.attribute(segment());
    await vi.advanceTimersByTimeAsync(5000);
    expect(m.kill).toHaveBeenCalledTimes(1);
    d.close();
    finish([{ start: 0, end: 5, speaker: 0 }]);
    await d.waitForHop();
    expect(update).not.toHaveBeenCalled();
    d.close();
  } finally {
    vi.useRealTimers();
  }
});

it('forwards a real centroid merge after the original parent leaves the 64-parent window', async () => {
  let hop = 0;
  const m = model();
  m.diarizeWindow = async (pcm) => [{ start: 0, end: pcm.length / 16000, speaker: 0 }];
  m.embedPcm = async () => (++hop === 1 ? [1, 0] : hop === 2 ? [0, 1] : [0.7, 1]);
  const merges = vi.fn();
  const updates = vi.fn();
  const d = new MeetingDiarizer(async () => m, updates, undefined, merges);
  for (let i = 0; i < 50; i++) d.push(frame(i));
  await d.waitForHop();
  d.attribute({ ...segment(), id: 'historical' });
  for (let i = 0; i < 70; i++) d.attribute({ ...segment(), id: `recent-${i}` });
  for (let i = 50; i < 600; i++) {
    d.push(frame(i));
    if ((i + 1) % 50 === 0) await d.waitForHop();
  }
  expect(merges).toHaveBeenCalledTimes(1);
  expect(merges.mock.calls[0]![0]).toMatchObject({ generation: 0, order: 1 });
  expect(updates.mock.calls.some(([s]) => s.id === 'historical')).toBe(false);
  d.close();
});
