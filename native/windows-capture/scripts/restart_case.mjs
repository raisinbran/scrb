// Windows restart check on an invented 880 Hz tone. Use a NEW work directory.
// Usage: node --experimental-strip-types scripts/restart_case.mjs <new work dir>
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { sealAudio } from '../../../packages/app-core/src/recovery.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(root, '..', '..');
const helper = join(root, 'build', 'bin', 'scrb-capture.exe');
const mute = join(repo, 'phase0', 'probes', 'windows-mute', 'Mute.exe');
const tone = join(repo, 'phase0', 'probes', 'windows-tone-player', 'TonePlayer.exe');
const work = process.argv[2] && resolve(process.argv[2]);
if (!work || existsSync(work)) throw new Error('Give a new, unused work directory.');
mkdirSync(work, { recursive: true });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function launch() {
  const worker = spawn(helper, [], { stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = createInterface({ input: worker.stdout })[Symbol.asyncIterator]();
  const send = async (id, fields) => {
    worker.stdin.write(`${JSON.stringify({ id, ...fields })}\n`);
    for (;;) {
      const next = await lines.next();
      if (next.done) throw new Error('Capture helper exited before acknowledging ' + fields.name);
      const message = JSON.parse(next.value);
      if (message.type === 'ack' && message.id === id) return message;
    }
  };
  return { worker, send };
}

function completeFiles(track) {
  const folder = join(work, 'audio', track);
  const files = readdirSync(folder).filter((name) => /^\d{6}\.opus$/.test(name));
  return new Map(files.map((file) => [file, readFileSync(join(folder, file))]));
}

const audio = join(work, 'audio');
const writerLock = join(audio, 'writer.lock');
const lockHeld = () => spawnSync(helper, ['check-lock', writerLock]).status === 3;
const wasMuted = /muted=1/.test(execFileSync(mute, ['status'], { encoding: 'utf8' }));
let player;
let first;
let second;
try {
  execFileSync(mute, ['on']);
  player = spawn(tone, ['880', '35', '0'], { stdio: 'ignore' });
  await sleep(500);
  const open = { name: 'open', sessionId: 'restart-fixture', outputDir: work,
    source: [player.pid], mic: 'default' };
  first = launch();
  const firstExit = new Promise((done) => first.worker.once('exit', done));
  if (!(await first.send('open-1', open)).ok) throw new Error('Initial open refused');
  const initial = await first.send('start-1', { name: 'start' });
  if (!initial.ok || !(initial.clockOriginNs > 0)) throw new Error('Missing initial clockOriginNs');
  if (!lockHeld()) throw new Error('First worker does not hold its writer lock');
  await sleep(6500);
  first.worker.kill('SIGKILL');
  await firstExit;
  if (lockHeld()) throw new Error('Writer lock was not released by a worker kill');
  const prior = Object.fromEntries(['microphone', 'meeting'].map((track) => [track, completeFiles(track)]));
  await sleep(2000);

  second = launch();
  const secondExit = new Promise((done) => second.worker.once('exit', done));
  const reopened = await second.send('open-2', { ...open, clockOriginNs: initial.clockOriginNs });
  if (!reopened.ok || reopened.gate !== 'closed') throw new Error('Restarted open was not safely closed');
  const resumed = await second.send('start-2', { name: 'start' });
  if (!resumed.ok || !(resumed.atNs > 6500e6) || resumed.clockOriginNs !== initial.clockOriginNs)
    throw new Error('Restarted Start did not keep the old timeline');
  await sleep(6500);
  const stopped = await second.send('stop-2', { name: 'stop' });
  if (!stopped.ok) throw new Error('Stop was refused');
  await secondExit;
  const result = await sealAudio(audio, async () => lockHeld());
  if (result.outcome !== 'ready') throw new Error(`Sealing failed: ${result.outcome}`);
  const events = readFileSync(join(audio, 'session.log'), 'utf8').split('\n')
    .flatMap((line) => {
      try { return line ? [JSON.parse(line)] : []; }
      catch { return []; } // The killed worker may have left a cut-off final line.
    });
  if (!events.some((event) => event.event === 'restart' && event.atNs > 0))
    throw new Error('The restart marker was not saved');
  for (const track of ['microphone', 'meeting']) {
    const chunks = result.tracks[track]?.chunks ?? [];
    if (!chunks.some((chunk) => chunk.openReason === 'workerRestarted'))
      throw new Error(`No restarted chunk on ${track}`);
    if (!result.gaps.some((gap) => gap.track === track && gap.kind === 'audioMissing'))
      throw new Error(`Missing restart gap on ${track}`);
    const before = prior[track];
    for (const [name, bytes] of before) {
      const after = readFileSync(join(audio, track, name));
      if (!bytes.equals(after)) throw new Error(`Pre-crash chunk changed: ${track}/${name}`);
    }
    const seq = chunks.map((chunk) => chunk.seq);
    if (new Set(seq).size !== seq.length) throw new Error(`Chunk names repeat on ${track}`);
  }
  console.log('PASS: original clock, writer lock, restart marker, chunk integrity and gaps');
} finally {
  first?.worker.kill('SIGKILL');
  second?.worker.kill('SIGKILL');
  if (player?.pid) spawnSync('taskkill', ['/PID', String(player.pid), '/T', '/F'], { stdio: 'ignore' });
  if (!wasMuted) execFileSync(mute, ['off']);
}
