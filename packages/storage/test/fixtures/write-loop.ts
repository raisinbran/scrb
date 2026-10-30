import { atomicWriteFile } from '../../src/atomic.ts';

// Rewrites one file forever until killed, with a length field a reader can check.
const file = process.argv[2] as string;
let round = 0;
for (;;) {
  const payload = 'x'.repeat(2_000_000 + (round % 7) * 100_000);
  await atomicWriteFile(file, JSON.stringify({ payload, check: payload.length }));
  if (round === 0) process.stdout.write('ready\n');
  round += 1;
}
