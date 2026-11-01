import type { TrackKind } from './types.js';

export const LIVE_PCM_RATE = 16_000;
export const LIVE_PCM_HEADER = 32;
export const LIVE_PCM_MAX_SAMPLES = 1600;

/** Version 1: mono signed 16-bit LE, at most 100 ms per frame, session clock. */
export interface LivePcmFrame {
  track: TrackKind;
  sequence: number;
  generation: number;
  startNs: number;
  /** A boundary ends pending speech; it contains no PCM. */
  boundary: boolean;
  samples: Int16Array;
}

export function pcmEndNs(frame: LivePcmFrame): number {
  return frame.startNs + frame.samples.length * 62_500;
}

export function validPcmFrame(frame: LivePcmFrame): boolean {
  return (
    (frame.track === 'mic' || frame.track === 'meeting') &&
    [frame.sequence, frame.generation].every(
      (n) => Number.isInteger(n) && n >= 0 && n <= 0xffff_ffff,
    ) &&
    Number.isSafeInteger(frame.startNs) &&
    frame.startNs >= 0 &&
    typeof frame.boundary === 'boolean' &&
    frame.samples instanceof Int16Array &&
    frame.samples.length <= LIVE_PCM_MAX_SAMPLES &&
    (frame.boundary ? frame.samples.length === 0 : frame.samples.length > 0) &&
    Number.isSafeInteger(pcmEndNs(frame))
  );
}

export function encodePcmFrame(frame: LivePcmFrame): Buffer {
  if (!validPcmFrame(frame)) throw new Error('Invalid live PCM frame');
  const out = Buffer.alloc(LIVE_PCM_HEADER + frame.samples.byteLength);
  out.write('SLP1', 0, 'ascii');
  out[4] = 1;
  out[5] = frame.track === 'mic' ? 0 : 1;
  out[6] = frame.boundary ? 1 : 0;
  out.writeUInt32LE(frame.sequence, 8);
  out.writeUInt32LE(frame.generation, 12);
  out.writeBigUInt64LE(BigInt(frame.startNs), 16);
  out.writeUInt32LE(LIVE_PCM_RATE, 24);
  out.writeUInt32LE(frame.samples.length, 28);
  for (let i = 0; i < frame.samples.length; i++)
    out.writeInt16LE(frame.samples[i]!, LIVE_PCM_HEADER + i * 2);
  return out;
}

/** Incremental parsing never retains more than one bounded frame, even on a huge write. */
export class PcmFrameDecoder {
  private buffer = Buffer.alloc(LIVE_PCM_HEADER + LIVE_PCM_MAX_SAMPLES * 2);
  private used = 0;
  private needed = LIVE_PCM_HEADER;
  private broken = false;

  constructor(private readonly onFrame: (frame: LivePcmFrame) => void) {}

  write(bytes: Uint8Array): void {
    if (this.broken) throw new Error('Live PCM decoder is closed');
    try {
      let offset = 0;
      while (offset < bytes.length) {
        const count = Math.min(this.needed - this.used, bytes.length - offset);
        this.buffer.set(bytes.subarray(offset, offset + count), this.used);
        this.used += count;
        offset += count;
        if (this.used < this.needed) continue;
        if (this.needed === LIVE_PCM_HEADER) {
          const b = this.buffer;
          const samples = b.readUInt32LE(28);
          if (
            b.toString('ascii', 0, 4) !== 'SLP1' ||
            b[4] !== 1 ||
            b[5]! > 1 ||
            b[6]! > 1 ||
            b[7] !== 0 ||
            b.readUInt32LE(24) !== LIVE_PCM_RATE ||
            samples > LIVE_PCM_MAX_SAMPLES ||
            (b[6] === 1 ? samples !== 0 : samples === 0) ||
            b.readBigUInt64LE(16) > BigInt(Number.MAX_SAFE_INTEGER)
          ) {
            throw new Error('Invalid live PCM header');
          }
          this.needed += samples * 2;
          if (this.used < this.needed) continue;
        }
        const samples = new Int16Array((this.needed - LIVE_PCM_HEADER) / 2);
        for (let i = 0; i < samples.length; i++)
          samples[i] = this.buffer.readInt16LE(LIVE_PCM_HEADER + i * 2);
        const frame: LivePcmFrame = {
          track: this.buffer[5] === 0 ? 'mic' : 'meeting',
          boundary: this.buffer[6] === 1,
          sequence: this.buffer.readUInt32LE(8),
          generation: this.buffer.readUInt32LE(12),
          startNs: Number(this.buffer.readBigUInt64LE(16)),
          samples,
        };
        if (!validPcmFrame(frame)) throw new Error('Invalid live PCM timing');
        this.used = 0;
        this.needed = LIVE_PCM_HEADER;
        this.onFrame(frame);
      }
    } catch {
      this.broken = true;
      throw new Error('Invalid live PCM stream');
    }
  }

  end(): void {
    if (this.used) throw new Error('Truncated live PCM frame');
  }
}
