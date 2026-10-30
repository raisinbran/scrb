import { open } from 'node:fs/promises';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let b = 0; b < 8; b++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    table[i] = r >>> 0;
  }
  return table;
})();

export function oggCrc(page: Uint8Array): number {
  let crc = 0;
  for (const byte of page) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ byte) & 0xff]!) >>> 0;
  return crc;
}

/** Size of the first Ogg page, read from its segment table. */
function firstPageSize(head: Buffer): number {
  const segments = head[26]!;
  let size = 27 + segments;
  for (let i = 0; i < segments; i++) size += head[27 + i]!;
  return size;
}

/**
 * Sets an Ogg Opus file's pre-skip to zero.  The chunks of one encode are a
 * continuous stream, but the segment muxer stamps every file with the encoder's
 * lookahead, so each lone decode would drop 6.5 ms that nothing else holds.
 * Only the first chunk should skip it.
 */
export async function clearPreSkip(path: string): Promise<void> {
  const file = await open(path, 'r+');
  try {
    const head = Buffer.alloc(4096);
    const { bytesRead } = await file.read(head, 0, head.length, 0);
    const size = firstPageSize(head);
    const payload = 27 + head[26]!;
    if (bytesRead < size || head.toString('ascii', payload, payload + 8) !== 'OpusHead') {
      throw new Error('not an Ogg Opus file');
    }
    const page = head.subarray(0, size);
    page.writeUInt16LE(0, payload + 10);
    page.writeUInt32LE(0, 22);
    page.writeUInt32LE(oggCrc(page), 22);
    await file.write(page, 0, size, 0);
  } finally {
    await file.close();
  }
}
