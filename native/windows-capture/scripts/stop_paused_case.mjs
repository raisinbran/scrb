// Stop during a pause must not move the cutoff: nothing recorded after Pause may reach a chunk.
// Adapted from native/macos-capture/scripts/stop_paused_case.py, with output muted. It also needs
// one chunk of real tone on the meeting track, so a round with no audio cannot pass, and Stop's
// ack must keep its own time.
// Usage: node stop_paused_case.mjs <work dir> <rounds>
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(root, '..', '..');
const helper = join(root, 'build', 'bin', 'scrb-capture.exe');
const verify = join(root, 'build', 'bin', 'ChunkVerify.exe');
const mute = join(repo, 'phase0', 'probes', 'windows-mute', 'Mute.exe');
const tone = join(repo, 'phase0', 'probes', 'windows-tone-player', 'TonePlayer.exe');

const work = resolve(process.argv[2]);
const rounds = Number(process.argv[3]);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function round(n, player) {
  const worker = spawn(helper, [], { stdio: ['pipe', 'pipe', 'inherit'] });
  const exited = new Promise((done) => worker.once('exit', done));
  const lines = createInterface({ input: worker.stdout })[Symbol.asyncIterator]();
  const send = async (id, fields) => {
    worker.stdin.write(`${JSON.stringify({ id, ...fields })}\n`);
    for (;;) {
      const message = JSON.parse((await lines.next()).value);
      if (message.type === 'ack') return message;
    }
  };
  const out = join(work, `round${n}`);
  await send('o', { name: 'open', sessionId: 's', outputDir: out, source: [player.pid], mic: 'default' });
  await send('s', { name: 'start' });
  await sleep(1500);
  const cutoff = (await send('p', { name: 'pause' })).atNs;
  await sleep(1000);
  const stopped = (await send('x', { name: 'stop' })).atNs;
  await exited;

  let leaks = 0;
  if (stopped - cutoff < 900e6) {
    console.log(n, 'stop ack took the pause time', stopped - cutoff);
    leaks += 1;
  }
  for (const track of ['meeting', 'microphone']) {
    const folder = join(out, 'audio', track);
    const chunks = readFileSync(join(folder, 'chunks.log'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const past = chunks
      .filter((chunk) => chunk.endNs > cutoff)
      .map((chunk) => `${chunk.file} +${((chunk.endNs - cutoff) / 1e6).toFixed(3)} ms`);
    console.log(n, track, 'chunks', chunks.length, 'past cutoff', JSON.stringify(past));
    leaks += past.length + Math.abs(chunks.length - 1);
    if (track === 'meeting' && chunks[0]) {
      const level = execFileSync(verify, ['--levels', join(folder, chunks[0].file), '880'], { encoding: 'utf8' });
      if (!(Number(level.trim().split(' ')[1]) > 500)) {
        console.log(n, 'no tone in the meeting chunk:', level.trim());
        leaks += 1;
      }
    }
  }
  rmSync(out, { recursive: true, force: true });
  return leaks;
}

const wasMuted = /muted=1/.test(execFileSync(mute, ['status'], { encoding: 'utf8' }));
execFileSync(mute, ['on']);
const player = spawn(tone, ['880', String(rounds * 5 + 10), '0'], { stdio: 'ignore' });
let leaks = 0;
try {
  await sleep(500);
  for (let n = 0; n < rounds; n += 1) leaks += await round(n, player);
} finally {
  spawnSync('taskkill', ['/PID', String(player.pid), '/T', '/F'], { stdio: 'ignore' });
  if (!wasMuted) execFileSync(mute, ['off']);
}
console.log(leaks ? `FAIL: ${leaks} leaks` : `PASS: ${rounds} rounds`);
process.exit(leaks ? 1 : 0);
