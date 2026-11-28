import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_ECHO_TAIL_MS,
  FILTERED_MIC_NAME,
  OriginalModifiedError,
  filterMicCopy,
  helperArgs,
  type NoiseFilterOptions,
  type NoiseFilterSettings,
} from '../src/noiseFilter.js';

const RATE = 16_000;
const ON: NoiseFilterSettings = {
  noiseSuppression: 'moderate',
  echoCancellation: true,
  autoGain: false,
};

function wav(samples: Int16Array): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(36 + samples.length * 2, 4);
  b.write('WAVEfmt ', 8, 'latin1');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'latin1');
  b.writeUInt32LE(samples.length * 2, 40);
  Buffer.from(samples.buffer).copy(b, 44);
  return b;
}

/** Deterministic noise bursts standing in for speech. */
function burstSignal(seconds: number, seed: number): Int16Array {
  const out = new Int16Array(seconds * RATE);
  let s = seed;
  for (let i = 0; i < out.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const on = Math.floor(i / (RATE / 2)) % 3 !== 2;
    out[i] = on ? Math.round((s / 2 ** 32 - 0.5) * 12_000) : 0;
  }
  return out;
}

const hash = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex');

describe('filterMicCopy', () => {
  let dir: string;
  let mic: string;
  let meeting: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'scrb-nf-'));
    mic = join(dir, 'track-0.wav');
    meeting = join(dir, 'track-1.wav');
    writeFileSync(mic, wav(burstSignal(3, 1)));
    writeFileSync(meeting, wav(burstSignal(3, 2)));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const opts = (over: Partial<NoiseFilterOptions> = {}): NoiseFilterOptions => ({
    helperPath: process.execPath,
    micWav: mic,
    meetingWav: meeting,
    workDir: dir,
    settings: ON,
    run: async (_f, args) => {
      writeFileSync(args[args.indexOf('--out') + 1]!, wav(burstSignal(3, 1).map((v) => v >> 1)));
    },
    ...over,
  });

  it('writes a separate copy and leaves both originals byte-identical', async () => {
    const before = [hash(mic), hash(meeting)];
    const r = await filterMicCopy(opts());
    expect(r).toEqual({ kind: 'filtered', wavPath: expect.stringContaining(FILTERED_MIC_NAME) });
    if (r.kind === 'filtered') {
      expect(r.wavPath).not.toBe(mic);
      expect(dirname(r.wavPath)).toBe(dirname(resolve(mic)));
    }
    expect([hash(mic), hash(meeting)]).toEqual(before);
  });

  it('bypasses without touching anything when disabled, helper missing or no reference', async () => {
    const off = { noiseSuppression: 'off', echoCancellation: false, autoGain: false } as const;
    expect(await filterMicCopy(opts({ settings: off }))).toEqual({
      kind: 'bypassed',
      reason: 'disabled',
    });
    expect(await filterMicCopy(opts({ helperPath: undefined }))).toEqual({
      kind: 'bypassed',
      reason: 'helper-missing',
    });
    expect(await filterMicCopy(opts({ helperPath: join(dir, 'nope.exe') }))).toEqual({
      kind: 'bypassed',
      reason: 'helper-missing',
    });
    expect(await filterMicCopy(opts({ meetingWav: undefined }))).toEqual({
      kind: 'bypassed',
      reason: 'no-reference',
    });
    expect(existsSync(join(dir, FILTERED_MIC_NAME))).toBe(false);
  });

  it('a failing helper bypasses and leaves no partial output', async () => {
    const r = await filterMicCopy(
      opts({
        run: async (_f, args) => {
          writeFileSync(args[args.indexOf('--out') + 1]!, 'partial');
          throw new Error('exit 70');
        },
      }),
    );
    expect(r).toEqual({ kind: 'bypassed', reason: 'helper-failed' });
    expect(existsSync(join(dir, FILTERED_MIC_NAME))).toBe(false);
  });

  it('throws when an original changes while its copy is filtered', async () => {
    await expect(
      filterMicCopy(
        opts({
          run: async (_f, args) => {
            writeFileSync(mic, wav(burstSignal(3, 9)));
            writeFileSync(args[args.indexOf('--out') + 1]!, wav(burstSignal(3, 1)));
          },
        }),
      ),
    ).rejects.toBeInstanceOf(OriginalModifiedError);
  });

  it('muting audible input is not suppression and a wrong length is invalid', async () => {
    const silent = await filterMicCopy(
      opts({
        run: async (_f, a) =>
          writeFileSync(a[a.indexOf('--out') + 1]!, wav(new Int16Array(3 * RATE))),
      }),
    );
    expect(silent).toEqual({ kind: 'bypassed', reason: 'silent-output' });
    const short = await filterMicCopy(
      opts({
        run: async (_f, a) => writeFileSync(a[a.indexOf('--out') + 1]!, wav(burstSignal(2, 1))),
      }),
    );
    expect(short).toEqual({ kind: 'bypassed', reason: 'invalid-output' });
    expect(existsSync(join(dir, FILTERED_MIC_NAME))).toBe(false);
  });

  it('refuses to write over an original that has the output name', async () => {
    const clash = join(dir, FILTERED_MIC_NAME);
    writeFileSync(clash, wav(burstSignal(3, 5)));
    const before = hash(clash);
    const r = await filterMicCopy(opts({ micWav: clash }));
    expect(r).toEqual({ kind: 'bypassed', reason: 'invalid-output' });
    expect(hash(clash)).toBe(before);
  });
});

describe('helperArgs', () => {
  it('maps settings and clamps the echo tail', () => {
    const a = helperArgs('m', 'r', 'o', { ...ON, noiseSuppression: 'high', autoGain: true });
    expect(a).toEqual([
      '--mic',
      'm',
      '--ref',
      'r',
      '--out',
      'o',
      '--ns',
      'high',
      '--aec',
      'on',
      '--agc',
      'on',
      '--aec-tail-ms',
      String(DEFAULT_ECHO_TAIL_MS),
    ]);
    expect(helperArgs('m', 'r', 'o', { ...ON, echoTailMs: 5 }).at(-1)).toBe('53');
    expect(helperArgs('m', 'r', 'o', { ...ON, echoTailMs: 99_999 }).at(-1)).toBe('1000');
  });
});

// Runs only where the pinned WebRTC helper has been built (native/apm-filter/build.*).
const here = dirname(fileURLToPath(import.meta.url));
const exe =
  process.env['SCRB_APM_FILTER'] ??
  resolve(
    here,
    '../../../native/apm-filter/build/scrb-apm-filter' +
      (process.platform === 'win32' ? '.exe' : ''),
  );
describe.skipIf(!existsSync(exe))('real WebRTC helper (synthetic echo)', () => {
  it('cuts a 120 ms invented echo of the meeting track by at least 8 dB and never edits the inputs', async () => {
    const d = mkdtempSync(join(tmpdir(), 'scrb-nf-real-'));
    try {
      const far = burstSignal(20, 3);
      const echo = new Int16Array(far.length);
      const lag = Math.round(0.12 * RATE);
      for (let i = lag; i < echo.length; i++) echo[i] = Math.round(far[i - lag]! * 0.5);
      const micP = join(d, 'mic.wav');
      const refP = join(d, 'meeting.wav');
      writeFileSync(micP, wav(echo));
      writeFileSync(refP, wav(far));
      const before = [hash(micP), hash(refP)];
      const r = await filterMicCopy({
        helperPath: exe,
        micWav: micP,
        meetingWav: refP,
        workDir: d,
        settings: { noiseSuppression: 'off', echoCancellation: true, autoGain: false },
      });
      expect(r.kind).toBe('filtered');
      if (r.kind !== 'filtered') return;
      const out = new Int16Array(readFileSync(r.wavPath).buffer.slice(44));
      // Last 10 s, after convergence.
      const from = 10 * RATE;
      const e = (x: Int16Array): number => {
        let s = 0;
        for (let i = from; i < x.length; i++) s += x[i]! * x[i]!;
        return s;
      };
      const db = 10 * Math.log10(e(echo) / Math.max(e(out), 1));
      expect(db).toBeGreaterThanOrEqual(8);
      expect([hash(micP), hash(refP)]).toEqual(before);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
