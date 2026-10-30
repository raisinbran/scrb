import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { readPages, sealAudio, type TrackName } from './recovery.ts';

const dead = async () => false;
const SECOND = 1_000_000_000;

function crc(bytes: Buffer): number {
  let value = 0;
  for (const byte of bytes) {
    value = (value ^ (byte << 24)) >>> 0;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 0x80000000 ? ((value << 1) ^ 0x04c11db7) >>> 0 : (value << 1) >>> 0;
    }
  }
  return value;
}

function page(body: Buffer, sequence: number, granule: bigint, flags = 0): Buffer {
  const lacing = [...Array(Math.floor(body.length / 255)).fill(255), body.length % 255] as number[];
  const header = Buffer.alloc(27);
  header.write('OggS', 0, 'latin1');
  header[5] = flags;
  header.writeBigUInt64LE(granule, 6);
  header.writeUInt32LE(7, 14);
  header.writeUInt32LE(sequence, 18);
  header[26] = lacing.length;
  const full = Buffer.concat([header, Buffer.from(lacing), body]);
  full.writeUInt32LE(crc(full), 22);
  return full;
}

function chunk(seq: number, startNs: number, seconds: number, reason: string): Buffer {
  const head = Buffer.alloc(19);
  head.write('OpusHead', 0, 'latin1');
  head[8] = 1;
  head[9] = 1;
  head.writeUInt16LE(312, 10);
  const tags = [`SEQUENCE=${seq}`, `START_NS=${startNs}`, 'RATE=48000', `OPEN_REASON=${reason}`];
  const parts = [Buffer.from('OpusTags', 'latin1'), u32(4), Buffer.from('test'), u32(tags.length)];
  for (const tag of tags) parts.push(u32(tag.length), Buffer.from(tag));
  const pages = [page(head, 0, 0n, 2), page(Buffer.concat(parts), 1, 0n)];
  for (let s = 1; s <= seconds; s += 1) {
    pages.push(page(Buffer.alloc(300, s), s + 1, BigInt(s * 48000 + 312)));
  }
  return Buffer.concat(pages);
}

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

describe('sealAudio', () => {
  let audio: string;

  const put = (track: TrackName, name: string, data: Buffer) => {
    mkdirSync(join(audio, track), { recursive: true });
    writeFileSync(join(audio, track, name), data);
  };
  const logLine = (track: TrackName, lines: object[]) =>
    put(
      track,
      'chunks.log',
      Buffer.from(lines.map((line) => JSON.stringify(line)).join('\n') + '\n'),
    );
  const events = (lines: object[]) =>
    writeFileSync(
      join(audio, 'session.log'),
      lines.map((line) => JSON.stringify(line)).join('\n') + '\n',
    );

  beforeEach(() => {
    audio = mkdtempSync(join(tmpdir(), 'scrb-recovery-'));
  });

  it('leaves a live worker alone', async () => {
    put('meeting', '000000.opus.part', chunk(0, 0, 3, 'start'));
    const result = await sealAudio(audio, async () => true);
    expect(result.outcome).toBe('writerAlive');
    expect(existsSync(join(audio, 'meeting', '000000.opus.part'))).toBe(true);
  });

  it('repairs a part cut mid-page, keeping the good pages', async () => {
    put('meeting', '000000.opus', chunk(0, 0, 5, 'start'));
    logLine('meeting', [{ file: '000000.opus', closeReason: 'rollover' }]);
    const part = chunk(1, 5 * SECOND, 3, 'rollover');
    put('meeting', '000001.opus.part', part.subarray(0, part.length - 40));

    const { outcome, tracks } = await sealAudio(audio, dead);

    expect(outcome).toBe('recovered');
    const chunks = tracks.meeting?.chunks ?? [];
    expect(chunks.map(({ state }) => state)).toEqual(['complete', 'recovered']);
    expect(chunks[1]?.endNs).toBe(7 * SECOND);
    const repaired = readFileSync(join(audio, 'meeting', '000001.opus'));
    const pages = readPages(repaired);
    expect(pages).toHaveLength(4);
    expect((pages.at(-1)?.flags ?? 0) & 4).toBe(4);
    expect(existsSync(join(audio, 'meeting', '000001.opus.part'))).toBe(false);
  });

  it('gives the same result when run twice', async () => {
    put('meeting', '000000.opus.part', chunk(0, 0, 3, 'start'));
    const first = await sealAudio(audio, dead);
    const second = await sealAudio(audio, dead);
    expect(second.tracks).toEqual(first.tracks);
    expect(second.endNs).toBe(first.endNs);
  });

  it('moves an unreadable file to damaged and keeps it', async () => {
    put('meeting', '000000.opus.part', Buffer.from('not audio'));
    put('meeting', '000001.opus', chunk(1, SECOND, 2, 'start'));
    const { tracks } = await sealAudio(audio, dead);
    expect(readdirSync(join(audio, 'meeting', 'damaged'))).toEqual(['000000.opus.part']);
    expect(tracks.meeting?.chunks.map(({ file }) => file)).toEqual(['000001.opus']);
  });

  it('marks a span with no pause record as missing, never paused', async () => {
    put('meeting', '000000.opus', chunk(0, 0, 2, 'start'));
    put('meeting', '000001.opus', chunk(1, 5 * SECOND, 2, 'discontinuity'));
    const { gaps } = await sealAudio(audio, dead);
    expect(gaps).toEqual([
      { kind: 'audioMissing', track: 'meeting', startNs: 2 * SECOND, endNs: 5 * SECOND },
    ]);
  });

  it('shows a confirmed pause as paused and nothing as missing', async () => {
    put('meeting', '000000.opus', chunk(0, 0, 2, 'start'));
    put('meeting', '000001.opus', chunk(1, 5 * SECOND, 2, 'resume'));
    events([
      { event: 'pause', atNs: 2 * SECOND, seq: 1 },
      { event: 'resume', atNs: 5 * SECOND, seq: 2 },
    ]);
    const { gaps } = await sealAudio(audio, dead);
    expect(gaps).toEqual([
      { kind: 'paused', track: 'both', startNs: 2 * SECOND, endNs: 5 * SECOND },
    ]);
  });

  it('ends a meeting that crashed while paused at the pause', async () => {
    put('meeting', '000000.opus', chunk(0, 0, 2, 'start'));
    events([{ event: 'pause', atNs: 2 * SECOND, seq: 1 }]);
    const { gaps, endNs, outcome } = await sealAudio(audio, dead);
    expect(outcome).toBe('recovered');
    expect(endNs).toBe(2 * SECOND);
    expect(gaps).toEqual([
      { kind: 'paused', track: 'both', startNs: 2 * SECOND, endNs: 2 * SECOND },
    ]);
  });

  it('marks the shorter track missing up to the end of the longer one', async () => {
    put('meeting', '000000.opus', chunk(0, 0, 4, 'start'));
    put('microphone', '000000.opus', chunk(0, 0, 2, 'start'));
    const { gaps } = await sealAudio(audio, dead);
    expect(gaps).toEqual([
      { kind: 'audioMissing', track: 'microphone', startNs: 2 * SECOND, endNs: 4 * SECOND },
    ]);
  });

  it('rebuilds from chunks when the log is lost, with close details unknown', async () => {
    put('meeting', '000000.opus', chunk(0, 0, 2, 'start'));
    const { tracks } = await sealAudio(audio, dead);
    expect(tracks.meeting?.chunks[0]?.closeReason).toBe('unknown');
  });

  it('calls a clean stop ready, and removes the working files', async () => {
    for (const track of ['meeting', 'microphone'] as const) {
      put(track, '000000.opus', chunk(0, 0, 2, 'start'));
      logLine(track, [{ file: '000000.opus', closeReason: 'stop' }]);
    }
    writeFileSync(join(audio, 'writer.lock'), '');
    const { outcome, tracks } = await sealAudio(audio, dead);
    expect(outcome).toBe('ready');
    expect(tracks.meeting?.endedBy).toBe('stop');
    expect(existsSync(join(audio, 'meeting', 'chunks.log'))).toBe(false);
    expect(existsSync(join(audio, 'writer.lock'))).toBe(false);
    rmSync(audio, { recursive: true });
  });
});
