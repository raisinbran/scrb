// T6 on the real helper: stops one stream with no error, using a build with SWIFT_FLAGS=-DFAULT_HOOKS,
// then reports time to detect, time to recover and the marked gap against the logged stop. Then ends
// the only sound and watches for a false stream death. Plays its own tone, so run under run-muted.sh.
// Usage: node --experimental-transform-types stream_stop_case.mjs <fault helper> <work dir> <tone file>
import { spawn } from 'node:child_process';
import { playTone } from './tone.mjs';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline';
import { sealAudio } from '../../../packages/app-core/src/recovery.ts';

const [helper, base, tone] = process.argv.slice(2);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ms = (ns) => Math.round(ns / 1e6);

async function run(name, source, act) {
  const work = join(base, name);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const player = playTone(tone);
  await sleep(1000);
  const worker = spawn(helper, [], { stdio: ['pipe', 'pipe', 'inherit'] });
  const events = [];
  const acks = new Map();
  let startedAt = 0;
  createInterface({ input: worker.stdout }).on('line', (line) => {
    const message = JSON.parse(line);
    if (message.type === 'ack') acks.get(message.id)?.(message);
    else if (message.event !== 'health') events.push({ at: performance.now() - startedAt, ...message });
  });
  let id = 0;
  const send = (fields) =>
    new Promise((resolve) => {
      id += 1;
      acks.set(`c${id}`, resolve);
      worker.stdin.write(`${JSON.stringify({ id: `c${id}`, ...fields })}\n`);
    });
  const open = { name: 'open', sessionId: 's', outputDir: work, source: source(player), mic: 'default' };
  console.log(name, 'open', JSON.stringify(await send(open)));
  await send({ name: 'start' });
  startedAt = performance.now();
  const stoppedAt = await act(send, player);
  await send({ name: 'stop' });
  player.kill();
  await sleep(300);
  const sealed = await sealAudio(join(work, 'audio'), async () => false);
  console.log(name, 'outcome', sealed.outcome, 'timeline ms', ms(sealed.endNs));
  for (const event of events) console.log(' event', Math.round(event.at), event.event, event.track ?? '', event.message ?? '');
  if (stoppedAt !== undefined) console.log(' stopped at', Math.round(stoppedAt));
  for (const gap of sealed.gaps)
    if (gap.endNs - gap.startNs > 1e6) console.log(' gap', gap.kind, gap.track, ms(gap.startNs), ms(gap.endNs - gap.startNs));
  for (const [track, value] of Object.entries(sealed.tracks)) {
    const audio = value.chunks.reduce((sum, chunk) => sum + chunk.endNs - chunk.startNs, 0);
    console.log(' ', track, 'chunks', value.chunks.length, 'audio ms', ms(audio));
  }
  rmSync(work, { recursive: true, force: true });
}

const stopStream = (track) => async (send) => {
  await sleep(12_000);
  const at = performance.now();
  await send({ name: 'faultStopStream', track });
  await sleep(14_000);
  return at;
};
const relative = (act) => async (send, player) => {
  const before = performance.now();
  const at = await act(send, player);
  return at - before;
};

await run('mic-followed', (player) => [player.pid], relative(stopStream('microphone')));
await run('meeting-followed', (player) => [player.pid], relative(stopStream('meeting')));
await run('meeting-whole', () => [], relative(stopStream('meeting')));
const quiet = async (send, player) => {
  await sleep(8000);
  player.kill();
  await sleep(25_000);
};
await run('reopen-fails', (player) => [player.pid], async (send) => {
  await sleep(3000);
  await send({ name: 'selectMic', mic: 'no-such-device' });
  await sleep(11_000);
});
await run('sound-ends-followed', (player) => [player.pid], quiet);
await run('sound-ends-whole', () => [], quiet);
process.exit(0);
