// Windows restart check on an invented 880 Hz tone, with output muted. Use a NEW work directory.
// One worker is killed while recording and the next rejoins with Start; that worker is paused and
// killed, and the third waits with the gate closed before rejoining with Resume, as the app does.
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
const verify = join(root, 'build', 'bin', 'ChunkVerify.exe');
const mute = join(repo, 'phase0', 'probes', 'windows-mute', 'Mute.exe');
const tone = process.env.SCRB_TONE ?? join(repo, 'phase0', 'probes', 'windows-tone-player', 'TonePlayer.exe');
const work = process.argv[2] && resolve(process.argv[2]);
if (!work || existsSync(work)) throw new Error('Give a new, unused work directory.');
mkdirSync(work, { recursive: true });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const seconds = (ns) => (ns / 1e9).toFixed(3);

function launch() {
  const worker = spawn(helper, [], { stdio: ['pipe', 'pipe', 'inherit'] });
  const exit = new Promise((done) => worker.once('exit', done));
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
  return { worker, send, exit };
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
const workers = [];
const start = () => {
  workers.push(launch());
  return workers.at(-1);
};
let player;
try {
  execFileSync(mute, ['on']);
  player = spawn(tone, ['880', '45', '0'], { stdio: 'ignore' });
  await sleep(500);
  const open = { name: 'open', sessionId: 'restart-fixture', outputDir: work,
    source: [player.pid], mic: 'default' };

  const first = start();
  if (!(await first.send('open-1', open)).ok) throw new Error('Initial open refused');
  const initial = await first.send('start-1', { name: 'start' });
  if (!initial.ok || !(initial.clockOriginNs > 0)) throw new Error('Missing initial clockOriginNs');
  if (!lockHeld()) throw new Error('First worker does not hold its writer lock');
  await sleep(6500);
  const prior = Object.fromEntries(['microphone', 'meeting'].map((track) => [track, completeFiles(track)]));
  first.worker.kill('SIGKILL');
  await first.exit;
  if (lockHeld()) throw new Error('Writer lock was not released by a worker kill');
  await sleep(2000);

  const rejoin = { ...open, clockOriginNs: initial.clockOriginNs };
  const second = start();
  const reopened = await second.send('open-2', rejoin);
  if (!reopened.ok || reopened.gate !== 'closed') throw new Error('Restarted open was not safely closed');
  const resumed = await second.send('start-2', { name: 'start' });
  if (!resumed.ok || !(resumed.atNs > 6500e6) || resumed.clockOriginNs !== initial.clockOriginNs)
    throw new Error('Restarted Start did not keep the old timeline');
  await sleep(5000);
  const paused = await second.send('pause-2', { name: 'pause' });
  if (!paused.ok || paused.gate !== 'closed') throw new Error('Pause refused');
  if ((await second.send('start-2b', { name: 'start' })).error !== 'conflict')
    throw new Error('Start during a pause must conflict');
  await sleep(500); // lets the writer close the paused chunk, so only the worker is lost
  second.worker.kill('SIGKILL');
  await second.exit;

  const third = start();
  const pausedOpen = await third.send('open-3', rejoin);
  if (!pausedOpen.ok || pausedOpen.gate !== 'closed') throw new Error('Paused restart was not closed');
  await sleep(1500);
  const after = await third.send('resume-3', { name: 'resume' });
  if (!after.ok || after.gate !== 'open') throw new Error('Resume after a paused restart refused');
  await sleep(5000);
  const stopped = await third.send('stop-3', { name: 'stop' });
  if (!stopped.ok) throw new Error('Stop was refused');
  await third.exit;

  const result = await sealAudio(audio, async () => lockHeld());
  if (result.outcome !== 'ready') throw new Error(`Sealing failed: ${result.outcome}`);
  const events = readFileSync(join(audio, 'session.log'), 'utf8').split('\n')
    .flatMap((line) => {
      try { return line ? [JSON.parse(line)] : []; }
      catch { return []; } // The killed worker may have left a cut-off final line.
    });
  console.log('session.log', events.map((event) => event.event).join(' '));
  const restarts = events.filter((event) => event.event === 'restart');
  if (restarts.length !== 2 || !restarts.every((event) => event.atNs > 6500e6))
    throw new Error('The restart markers were not saved');

  for (const track of ['microphone', 'meeting']) {
    const chunks = result.tracks[track]?.chunks ?? [];
    console.log(track, chunks.map((chunk) =>
      `${chunk.file} ${seconds(chunk.startNs)}-${seconds(chunk.endNs)} ${chunk.openReason}/${chunk.closeReason}`).join('; '));
    const restartedAt = chunks.filter((chunk) => chunk.openReason === 'workerRestarted');
    if (restartedAt.length !== 2) throw new Error(`${track}: ${restartedAt.length} restarted chunks, not 2`);
    const seq = chunks.map((chunk) => chunk.seq);
    if (!seq.every((value, index) => value === index)) throw new Error(`Chunk numbers break on ${track}`);
    if (chunks.some((chunk, index) => index && chunk.startNs < chunks[index - 1].endNs - 50e6))
      throw new Error(`Chunk times go backward on ${track}`);

    const gaps = result.tracks[track].gaps;
    console.log(track, 'gaps', gaps.map((gap) => `${gap.kind} ${seconds(gap.startNs)}-${seconds(gap.endNs)}`).join('; '));
    if (gaps.length !== 1 || gaps[0].kind !== 'audioMissing') throw new Error(`${track}: expected one gap`);
    const missing = (gaps[0].endNs - gaps[0].startNs) / 1e9;
    if (missing < 2 || missing > 5) throw new Error(`${track}: ${missing} s missing, down for about 2 s`);

    for (const [name, bytes] of prior[track]) {
      if (!bytes.equals(readFileSync(join(audio, track, name)))) throw new Error(`Pre-crash chunk changed: ${track}/${name}`);
    }
    if (track !== 'meeting') continue;
    // Every worker's own audio, not only that a file exists.
    const levels = (chunk) => Number(execFileSync(verify,
      ['--levels', join(audio, track, chunk.file), '880', '2000'], { encoding: 'utf8' }).trim().split(' ')[1]);
    const spans = [chunks.slice(0, chunks.indexOf(restartedAt[0])),
      chunks.slice(chunks.indexOf(restartedAt[0]), chunks.indexOf(restartedAt[1])),
      chunks.slice(chunks.indexOf(restartedAt[1]))];
    spans.forEach((span, index) => {
      const level = Math.max(0, ...span.map(levels));
      console.log(`worker ${index + 1} 880 Hz level`, level);
      if (level <= 500) throw new Error(`No tone from worker ${index + 1}`);
    });
  }
  console.log('PASS: original clock, numbering, restart markers, tone from all 3 workers, one gap per track');
} finally {
  for (const { worker } of workers) worker.kill('SIGKILL');
  if (player?.pid) spawnSync('taskkill', ['/PID', String(player.pid), '/T', '/F'], { stdio: 'ignore' });
  if (!wasMuted) execFileSync(mute, ['off']);
}
