// Real restart test: records, kills the worker, starts another on the same clock, stops, and reports
// the timeline. Usage: node --experimental-strip-types restart_case.mjs <helper> <work dir>
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { sealAudio } from '../../../packages/app-core/src/recovery.ts';

const [helper, work] = process.argv.slice(2);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
mkdirSync(work, { recursive: true });

function launch() {
  const worker = spawn(helper, [], { stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = createInterface({ input: worker.stdout })[Symbol.asyncIterator]();
  const send = async (id, fields) => {
    worker.stdin.write(`${JSON.stringify({ id, ...fields })}\n`);
    for (;;) {
      const message = JSON.parse((await lines.next()).value);
      if (message.type === 'ack') return message;
    }
  };
  return { worker, send };
}

const open = { name: 'open', sessionId: 's', outputDir: work, source: [], mic: 'default' };
const first = launch();
await first.send('o1', open);
const { clockOriginNs } = await first.send('s1', { name: 'start' });
console.log('clock origin', clockOriginNs);
await sleep(7300);
first.worker.kill('SIGKILL');
const downMs = 2000;
await sleep(downMs);

const second = launch();
await second.send('o2', { ...open, clockOriginNs });
const restarted = await second.send('s2', { name: 'start' });
console.log('second start atNs', restarted.atNs, 'origin', restarted.clockOriginNs);
await sleep(7300);
await second.send('e2', { name: 'stop' });
await sleep(200);

const audio = join(work, 'audio');
const result = await sealAudio(audio, async () => false);
for (const [track, sealed] of Object.entries(result.tracks)) {
  console.log(track);
  for (const { file, startNs, endNs, openReason, state } of sealed.chunks) {
    console.log(' ', file, Math.round(startNs / 1e6), Math.round(endNs / 1e6), openReason, state);
  }
}
console.log('outcome', result.outcome, 'end', Math.round(result.endNs / 1e6), 'ms');
console.log('gaps', JSON.stringify(result.gaps));
console.log(readFileSync(join(audio, 'session.log'), 'utf8'));
console.log(`expected: one audioMissing gap per track, a little over ${downMs} ms, no chunk replaced`);
process.exit(0);
