import { describe, expect, it, vi } from 'vitest';
import { LivePcmEngine, type LiveSkip, type TimedLiveSegment } from '../src/livePcmEngine.js';
import { encodePcmFrame, PcmFrameDecoder, type LivePcmFrame } from '../src/livePcmProtocol.js';
import { parseLiveWords, requestLiveWords } from '../src/whisper.js';
import type { TrackKind } from '../src/types.js';

export function frame(
  sequence: number,
  startMs = sequence * 100,
  track: TrackKind = 'mic',
  value = 100,
): LivePcmFrame {
  return {
    track,
    sequence,
    generation: 0,
    startNs: startMs * 1e6,
    boundary: false,
    samples: new Int16Array(1600).fill(value),
  };
}

function rig() {
  const segments: TimedLiveSegment[] = [];
  const skipped: LiveSkip[] = [];
  const values: number[] = [];
  const engine = new LivePcmEngine(
    {
      detect: async (_track, pcm) => [{ startMs: 0, endMs: pcm.length / 16 }],
      transcribe: async (pcm) => {
        values.push(pcm[0]!);
        return [
          { text: 'hello', startMs: 10, endMs: 100, confidence: 0.9 },
          { text: 'world', startMs: 120, endMs: 200, confidence: 0.8 },
        ];
      },
    },
    (s) => segments.push(s),
    (s) => skipped.push(s),
  );
  const boundary = (sequence: number, startMs: number, track: TrackKind = 'mic') =>
    engine.push({ ...frame(sequence, startMs, track), boundary: true, samples: new Int16Array() });
  return { engine, segments, skipped, values, boundary };
}

describe('live PCM framing', () => {
  it('preserves signed PCM, track, sequence, generation and nanoseconds across fragmented writes', () => {
    const a = {
      ...frame(42, 1234, 'meeting'),
      generation: 9,
      samples: Int16Array.from([-32768, 0, 32767]),
    };
    const b = { ...frame(43, 1235), boundary: true, samples: new Int16Array() };
    const encoded = Buffer.concat([encodePcmFrame(a), encodePcmFrame(b)]);
    const seen: LivePcmFrame[] = [];
    const decoder = new PcmFrameDecoder((f) => seen.push(f));
    for (const byte of encoded) decoder.write(Uint8Array.of(byte));
    decoder.end();
    expect(seen).toEqual([a, b]);
  });

  it('rejects oversized, wrong-rate, unsafe-time and truncated frames before allocating their payload', () => {
    for (const change of [
      (b: Buffer) => b.writeUInt32LE(0xffff_ffff, 28),
      (b: Buffer) => b.writeUInt32LE(48_000, 24),
      (b: Buffer) => b.writeBigUInt64LE(2n ** 63n, 16),
    ]) {
      const bytes = encodePcmFrame(frame(0));
      change(bytes);
      expect(() => new PcmFrameDecoder(() => undefined).write(bytes)).toThrow(
        'Invalid live PCM stream',
      );
    }
    const partial = new PcmFrameDecoder(() => undefined);
    partial.write(encodePcmFrame(frame(0)).subarray(0, 100));
    expect(() => partial.end()).toThrow('Truncated');
  });

  it('parses many frames in one write without requiring a matching accumulation buffer', () => {
    let count = 0;
    const decoder = new PcmFrameDecoder(() => count++);
    decoder.write(Buffer.concat(Array.from({ length: 1000 }, (_, i) => encodePcmFrame(frame(i)))));
    decoder.end();
    expect(count).toBe(1000);
  });
});

describe('live model word timing', () => {
  it('bounds a model HTTP response before parsing it', async () => {
    vi.stubGlobal('fetch', async () => new Response('x'.repeat(128 * 1024 + 1)));
    try {
      await expect(requestLiveWords(12345, new Int16Array(1600))).rejects.toThrow(
        'output limit exceeded',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('joins subword pieces and punctuation while preserving individual word times', () => {
    expect(
      parseLiveWords({
        text: 'Hello, world!',
        segments: [
          {
            words: [
              { word: ' Hel', start: 0.01, end: 0.06, probability: 0.9 },
              { word: 'lo', start: 0.06, end: 0.1, probability: 0.8 },
              { word: ',', start: 0.1, end: 0.11, probability: 0.7 },
              { word: ' world', start: 0.12, end: 0.2, probability: 0.95 },
              { word: '!', start: 0.2, end: 0.21, probability: 0.9 },
            ],
          },
        ],
      }),
    ).toEqual([
      { text: 'Hello,', startMs: 10, endMs: 110, confidence: 0.7 },
      { text: 'world!', startMs: 120, endMs: 210, confidence: 0.9 },
    ]);
  });

  it('does not turn an untimed utterance or invalid word into a fabricated timed word', () => {
    expect(() => parseLiveWords({ text: 'hello world' })).toThrow('no word timestamps');
    expect(() =>
      parseLiveWords({
        segments: [{ words: [{ word: 'hello world', start: 0, end: 1, probability: 1 }] }],
      }),
    ).toThrow();
    expect(() =>
      parseLiveWords({
        segments: [{ words: [{ word: 'hello', start: -1, end: 1, probability: 1 }] }],
      }),
    ).toThrow();
    expect(
      parseLiveWords({
        text: '[BLANK_AUDIO]',
        segments: [{ words: [{ word: '[BLANK_AUDIO]', start: 0, end: 1, probability: 1 }] }],
      }),
    ).toEqual([]);
  });
});

describe('incremental PCM engine', () => {
  it('keeps dual-track PCM separate, flushes at pause boundaries and offsets each word on its track', async () => {
    const r = rig();
    for (let i = 0; i < 5; i++) {
      await r.engine.push(frame(i, 1000 + i * 100, 'mic', 100));
      await r.engine.push(frame(i, 2000 + i * 100, 'meeting', 200));
    }
    expect(r.segments).toHaveLength(0);
    await r.boundary(5, 1500, 'mic');
    await r.boundary(5, 2500, 'meeting');
    expect(r.values).toEqual([100, 200]);
    expect(r.segments.map((s) => [s.track, s.speakerLabel, s.sequence])).toEqual([
      ['mic', 'You', 5],
      ['meeting', 'Meeting', 5],
    ]);
    expect(r.segments[0]!.words.map((w) => [w.startMs, w.endMs])).toEqual([
      [1010, 1100],
      [1120, 1200],
    ]);
    expect(r.segments[1]!.words.map((w) => [w.startMs, w.endMs])).toEqual([
      [2010, 2100],
      [2120, 2200],
    ]);
    expect(r.engine.pendingStartNs('mic')).toBe(1500e6);
  });

  it('drops context across skipped sequences, timestamp gaps and generation changes', async () => {
    const r = rig();
    for (let i = 0; i < 4; i++) await r.engine.push(frame(i));
    for (let i = 5; i < 10; i++) await r.engine.push(frame(i));
    await r.boundary(10, 1000);
    for (let i = 11; i < 16; i++)
      await r.engine.push({ ...frame(i, 3000 + (i - 11) * 100), generation: 1 });
    await r.engine.push({
      ...frame(16, 3500),
      generation: 1,
      boundary: true,
      samples: new Int16Array(),
    });
    expect(r.skipped[0]).toEqual({ track: 'mic', startMs: 0, endMs: 500, reason: 'gap' });
    expect(r.segments.map((s) => s.startMs)).toEqual([510, 3010]);
    expect(r.segments.every((s) => s.endMs - s.startMs < 500)).toBe(true);
    await expect(r.engine.push(frame(16, 3500))).rejects.toThrow('Out-of-order');
  });

  it('bounds continuous-speech windows and emits before waiting for a durable five-second chunk', async () => {
    const r = rig();
    for (let i = 0; i < 60; i++) await r.engine.push(frame(i));
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0]!.sequence).toBe(39);
    await r.boundary(60, 6000);
    expect(r.segments).toHaveLength(2);
    expect(r.segments[1]!.startMs).toBe(4010);
  });

  it('flushes speech ending just before a pause and rejects further PCM until a new generation', async () => {
    const r = rig();
    for (let i = 0; i < 5; i++) await r.engine.push(frame(i));
    await r.boundary(5, 510);
    expect(r.segments).toHaveLength(1);
    await expect(r.engine.push(frame(6, 510))).rejects.toThrow('Out-of-order');
    await r.engine.push({ ...frame(6, 1000), generation: 1 });
    expect(r.engine.pendingStartNs('mic')).toBe(1000e6);
  });

  it('flushes the short remainder of a long utterance at a pause instead of silently losing it', async () => {
    const lengths: number[] = [];
    let firstWindow = true;
    const engine = new LivePcmEngine(
      {
        detect: async (_track, pcm) => {
          const startMs = firstWindow ? 100 : 0;
          firstWindow = false;
          return [{ startMs, endMs: pcm.length / 16 }];
        },
        transcribe: async (pcm) => {
          lengths.push(pcm.length / 16);
          return [];
        },
      },
      () => undefined,
      () => undefined,
    );
    for (let i = 0; i < 44; i++) await engine.push(frame(i));
    await engine.push({ ...frame(44, 4400), boundary: true, samples: new Int16Array() });
    expect(lengths).toEqual([4000, 300]);
  });

  it('ignores a late model completion after close and never emits across invalid timing', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const seen: TimedLiveSegment[] = [];
    const engine = new LivePcmEngine(
      {
        detect: async () => {
          await gate;
          return [{ startMs: 0, endMs: 100 }];
        },
        transcribe: async () => [{ text: 'late', startMs: 0, endMs: 100, confidence: 1 }],
      },
      (s) => seen.push(s),
      () => undefined,
    );
    for (let i = 0; i < 4; i++) await engine.push(frame(i));
    const pending = engine.push(frame(4));
    engine.close();
    release();
    await pending;
    expect(seen).toEqual([]);
    expect(engine.pendingStartNs('mic')).toBe(0);
    const invalid = new LivePcmEngine(
      { detect: async () => [{ startMs: 500, endMs: 1000 }], transcribe: async () => [] },
      () => undefined,
      () => undefined,
    );
    for (let i = 0; i < 4; i++) await invalid.push(frame(i));
    await expect(invalid.push(frame(4))).rejects.toThrow('Invalid live VAD');
  });
});

it('clamps padded VAD endpoints', async () => {
  const lengths: number[] = [];
  const seen: TimedLiveSegment[] = [];
  const engine = new LivePcmEngine(
    {
      detect: async (_track, pcm) => [{ startMs: 0, endMs: pcm.length / 16 + 20 }],
      transcribe: async (pcm) => {
        lengths.push(pcm.length);
        return [{ text: 'hello', startMs: 0, endMs: 100, confidence: 1 }];
      },
    },
    (s) => seen.push(s),
    () => undefined,
  );
  for (let i = 0; i < 5; i++) await engine.push(frame(i));
  await engine.push({ ...frame(5, 500), boundary: true, samples: new Int16Array() });
  expect(lengths).toEqual([8000]);
  expect(seen[0]?.words[0]?.text).toBe('hello');
});

it.each([500, 510])('rejects invalid VAD start %s', async (startMs) => {
  const engine = new LivePcmEngine(
    { detect: async () => [{ startMs, endMs: 520 }], transcribe: async () => [] },
    () => undefined,
    () => undefined,
  );
  for (let i = 0; i < 4; i++) await engine.push(frame(i));
  await expect(engine.push(frame(4))).rejects.toThrow('Invalid live VAD timing');
});
