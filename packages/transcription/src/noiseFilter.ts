import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, realpath, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Recognition-copy settings; the saved audio settings map onto these in a later slice. */
export interface NoiseFilterSettings {
  noiseSuppression: 'off' | 'low' | 'moderate' | 'high' | 'veryhigh';
  echoCancellation: boolean;
  autoGain: boolean;
  /** Echo-canceller filter length. Default 600: the 52 ms built-in cannot follow echoes that spread over 60-200 ms. */
  echoTailMs?: number;
}

export type BypassReason =
  | 'disabled'
  | 'helper-missing'
  | 'no-reference'
  | 'helper-failed'
  | 'invalid-output'
  | 'silent-output';

export type NoiseFilterResult =
  { kind: 'filtered'; wavPath: string } | { kind: 'bypassed'; reason: BypassReason };

export interface NoiseFilterOptions {
  /** scrb-apm-filter executable (native/apm-filter). Missing means bypass, never failure. */
  helperPath: string | undefined;
  /** Saved mic track. Read only: the filter works on a new file beside it. */
  micWav: string;
  /** Saved meeting track: far-end reference. Read only. */
  meetingWav: string | undefined;
  /** Scratch directory the new file is created in. */
  workDir: string;
  settings: NoiseFilterSettings;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Test seam: runs the helper. Defaults to execFile. */
  run?: (
    file: string,
    args: string[],
    o: { timeoutMs: number; signal?: AbortSignal },
  ) => Promise<void>;
}

/** Raised when a saved original changed while filtering. Never expected; never swallowed. */
export class OriginalModifiedError extends Error {
  constructor(public readonly file: string) {
    super('a saved audio original changed while its disposable copy was filtered');
  }
}

const DEFAULT_TIMEOUT_MS = 30 * 60_000;
export const DEFAULT_ECHO_TAIL_MS = 600;
export const FILTERED_MIC_NAME = 'mic-filtered.wav';

function sha256(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(path)
      .on('data', (d) => h.update(d))
      .on('error', reject)
      .on('end', () => resolve(h.digest('hex')));
  });
}

function runHelper(
  file: string,
  args: string[],
  o: { timeoutMs: number; signal?: AbortSignal },
): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { timeout: o.timeoutMs, windowsHide: true, ...(o.signal ? { signal: o.signal } : {}) },
      (err) => (err ? reject(err) : resolve()),
    );
  });
}

export function helperArgs(
  mic: string,
  ref: string,
  out: string,
  s: NoiseFilterSettings,
): string[] {
  return [
    '--mic',
    mic,
    '--ref',
    ref,
    '--out',
    out,
    '--ns',
    s.noiseSuppression,
    '--aec',
    s.echoCancellation ? 'on' : 'off',
    '--agc',
    s.autoGain ? 'on' : 'off',
    '--aec-tail-ms',
    String(Math.max(53, Math.min(1000, Math.round(s.echoTailMs ?? DEFAULT_ECHO_TAIL_MS)))),
  ];
}

/** Sample count and peak of a plain 16-bit mono PCM WAV; undefined for anything else. */
export async function pcm16Stats(
  path: string,
): Promise<{ samples: number; peak: number } | undefined> {
  const fh = await open(path, 'r');
  try {
    const size = (await fh.stat()).size;
    const head = Buffer.alloc(Math.min(size, 4096));
    await fh.read(head, 0, head.length, 0);
    if (head.length < 44 || head.toString('latin1', 0, 4) !== 'RIFF') return undefined;
    let pos = 12;
    let mono16 = false;
    while (pos + 8 <= head.length) {
      const id = head.toString('latin1', pos, pos + 4);
      const len = head.readUInt32LE(pos + 4);
      if (id === 'fmt ') {
        mono16 =
          head.readUInt16LE(pos + 8) === 1 &&
          head.readUInt16LE(pos + 10) === 1 &&
          head.readUInt16LE(pos + 22) === 16;
      } else if (id === 'data') {
        if (!mono16) return undefined;
        const bytes = Math.min(len, size - (pos + 8));
        let peak = 0;
        const buf = Buffer.alloc(1 << 20);
        for (let off = 0; off < bytes;) {
          const n = Math.min(buf.length, bytes - off);
          await fh.read(buf, 0, n, pos + 8 + off);
          for (let i = 0; i + 1 < n; i += 2) peak = Math.max(peak, Math.abs(buf.readInt16LE(i)));
          off += n;
        }
        return { samples: Math.floor(bytes / 2), peak };
      }
      pos += 8 + len + (len & 1);
    }
    return undefined;
  } finally {
    await fh.close();
  }
}

/**
 * Filters a COPY of the mic track for recognition. The two inputs are only read; the output is a
 * new file in workDir; both inputs are hashed before and after and a change throws. Anything
 * that cannot be done safely returns `bypassed`, and the caller keeps using the unfiltered copy.
 */
export async function filterMicCopy(o: NoiseFilterOptions): Promise<NoiseFilterResult> {
  const s = o.settings;
  if (s.noiseSuppression === 'off' && !s.echoCancellation && !s.autoGain) {
    return { kind: 'bypassed', reason: 'disabled' };
  }
  if (!o.helperPath) return { kind: 'bypassed', reason: 'helper-missing' };
  try {
    await stat(o.helperPath);
  } catch {
    return { kind: 'bypassed', reason: 'helper-missing' };
  }
  if (!o.meetingWav) return { kind: 'bypassed', reason: 'no-reference' };

  const out = join(await realpath(o.workDir), FILTERED_MIC_NAME);
  const [mic, meeting] = await Promise.all([realpath(o.micWav), realpath(o.meetingWav)]);
  if (out === mic || out === meeting || dirname(out) === out) {
    return { kind: 'bypassed', reason: 'invalid-output' };
  }
  await rm(out, { force: true });

  const before = await Promise.all([sha256(mic), sha256(meeting)]);
  const failed = async (reason: BypassReason): Promise<NoiseFilterResult> => {
    await rm(out, { force: true });
    return { kind: 'bypassed', reason };
  };
  try {
    await (o.run ?? runHelper)(o.helperPath as string, helperArgs(mic, meeting, out, s), {
      timeoutMs: o.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      ...(o.signal ? { signal: o.signal } : {}),
    });
  } catch (err) {
    if (o.signal?.aborted) throw err;
    const after = await Promise.all([sha256(mic), sha256(meeting)]);
    if (after[0] !== before[0]) throw new OriginalModifiedError(mic);
    if (after[1] !== before[1]) throw new OriginalModifiedError(meeting);
    return failed('helper-failed');
  }

  const after = await Promise.all([sha256(mic), sha256(meeting)]);
  if (after[0] !== before[0]) throw new OriginalModifiedError(mic);
  if (after[1] !== before[1]) throw new OriginalModifiedError(meeting);

  const [inStats, outStats] = await Promise.all([pcm16Stats(mic), pcm16Stats(out)]);
  if (!inStats || !outStats || inStats.samples !== outStats.samples) {
    return failed('invalid-output');
  }
  // Silence out of audible input is muting, not suppression: keep the unfiltered copy.
  if (inStats.peak > 0 && outStats.peak === 0) return failed('silent-output');
  return { kind: 'filtered', wavPath: out };
}
