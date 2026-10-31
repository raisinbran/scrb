/** Builds invented Ogg Opus chunks for tests. */

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

export function chunk(seq: number, startNs: number, seconds: number, reason: string): Buffer {
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
