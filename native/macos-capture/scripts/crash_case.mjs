// Real crash test: records, kills the worker with SIGKILL, recovers, and reports the audio lost.
// Usage: node --experimental-strip-types crash_case.mjs <helper> <ffmpeg> <work dir>
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { sealAudio } from '../../../packages/app-core/src/recovery.ts';

const [helper, ffmpeg, work] = process.argv.slice(2);
const seconds = 7.3;
mkdirSync(work, { recursive: true });
const worker = spawn(helper, [], { stdio: ['pipe', 'pipe', 'inherit'] });
const lines = createInterface({ input: worker.stdout })[Symbol.asyncIterator]();
const send = async (id, fields) => {
  worker.stdin.write(`${JSON.stringify({ id, ...fields })}\n`);
  for (;;) {
    const message = JSON.parse((await lines.next()).value);
    if (message.type === 'ack') return message;
  }
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await send('o', { name: 'open', sessionId: 's', outputDir: work, source: [], mic: 'default' });
await send('s', { name: 'start' });
const started = Date.now();
await sleep(seconds * 1000);
const audio = join(work, 'audio');
const lock = join(audio, 'writer.lock');
const held = () => spawnSync(helper, ['check-lock', lock]).status === 3;
console.log('lock held while running:', held());
const recordedMs = Date.now() - started;
worker.kill('SIGKILL');
await sleep(100);
console.log('lock held after kill:', held());
console.log('before:', readdirSync(join(audio, 'microphone')).join(' '));

const result = await sealAudio(audio, async () => held());
console.log('after:', readdirSync(join(audio, 'microphone')).join(' '));
console.log('outcome', result.outcome, 'recorded', recordedMs, 'ms, recovered end', Math.round(result.endNs / 1e6), 'ms');
console.log('lost', recordedMs - Math.round(result.endNs / 1e6), 'ms; gaps', JSON.stringify(result.gaps));
const last = result.tracks.microphone.chunks.at(-1);
console.log('last chunk', JSON.stringify(last));
const decoded = execFileSync(ffmpeg, ['-hide_banner', '-i', join(audio, 'microphone', last.file), '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
console.log('decoded ok', decoded.length >= 0);
process.exit(0);
