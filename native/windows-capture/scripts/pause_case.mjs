// Real-audio pause test, adapted from native/macos-capture/scripts/pause_case.py. This PC has no
// Python or ffmpeg, so it runs on Node and decodes with ChunkVerify.
//
// A process tree plays 880 Hz for 6 s, a marker of 2000 Hz for 6 s, then 880 Hz again, with output
// muted, and the pause spans the marker. Passes if no marker reached any chunk, the tone either
// side did, and the paused span is recorded.
// Usage: node pause_case.mjs <work dir>
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(root, '..', '..');
const helper = join(root, 'build', 'bin', 'scrb-capture.exe');
const verify = join(root, 'build', 'bin', 'ChunkVerify.exe');
const mute = join(repo, 'phase0', 'probes', 'windows-mute', 'Mute.exe');
const tone = process.env.SCRB_TONE ?? join(repo, 'phase0', 'probes', 'windows-tone-player', 'TonePlayer.exe');

const work = resolve(process.argv[2]);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const out = join(work, 'meeting');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const wasMuted = /muted=1/.test(execFileSync(mute, ['status'], { encoding: 'utf8' }));
execFileSync(mute, ['on']);
const play = (hz, seconds) => `"${tone}" ${hz} ${seconds} 0`;
const player = spawn(
  'cmd.exe',
  ['/c', `"${play(880, 6)} & ${play(2000, 6)} & ${play(880, 9)}"`],
  { windowsVerbatimArguments: true, stdio: 'ignore', windowsHide: true },
);

const worker = spawn(helper, [], { stdio: ['pipe', 'pipe', 'inherit'] });
let onAck = () => undefined;
let paused = false;
let loudestWhilePaused = -120;
createInterface({ input: worker.stdout }).on('line', (line) => {
  const message = JSON.parse(line);
  if (message.type === 'ack') onAck(message);
  // Meters sit ahead of the gate, so this proves the marker reached the stream.
  if (message.event === 'health' && paused) {
    loudestWhilePaused = Math.max(loudestWhilePaused, message.meetingDb);
  }
});
const send = (id, fields) =>
  new Promise((done) => {
    onAck = (message) => {
      console.log(id, JSON.stringify(message));
      done(message);
    };
    worker.stdin.write(`${JSON.stringify({ id, ...fields })}\n`);
  });

try {
  await sleep(500);
  const opened = await send('o', {
    name: 'open',
    sessionId: 's1',
    outputDir: out,
    source: [player.pid],
    mic: 'default',
  });
  check(opened.ok, 'open refused');
  check((await send('s', { name: 'start' })).gate === 'open', 'start left the gate closed');
  await sleep(4800);
  const before = performance.now();
  const pause = await send('p', { name: 'pause' });
  const pauseMs = performance.now() - before;
  console.log('pause ms', pauseMs.toFixed(1));
  check(pauseMs < 200, `pause took ${pauseMs} ms`);
  check(pause.gate === 'closed', 'pause left the gate open');
  const again = await send('p', { name: 'pause' });
  check(JSON.stringify(again) === JSON.stringify(pause), 'retry must return the first reply');
  check((await send('p2', { name: 'pause' })).error === 'conflict', 'a new pause must conflict');
  paused = true;
  await sleep(7500);
  paused = false;
  check((await send('r', { name: 'resume' })).gate === 'open', 'resume left the gate closed');
  await sleep(5000);
  await send('x', { name: 'stop' });
  await new Promise((done) => worker.once('exit', done));
} finally {
  worker.kill();
  spawnSync('taskkill', ['/PID', String(player.pid), '/T', '/F'], { stdio: 'ignore' });
  if (!wasMuted) execFileSync(mute, ['off']);
}

for (const track of ['meeting', 'microphone']) {
  const folder = join(out, 'audio', track);
  const chunks = readFileSync(join(folder, 'chunks.log'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  console.log(
    track,
    chunks
      .map((c) => `${c.file} ${(c.startNs / 1e9).toFixed(2)}-${(c.endNs / 1e9).toFixed(2)} ${c.openReason}/${c.closeReason}`)
      .join('; '),
  );
  check(!readdirSync(folder).some((name) => name.endsWith('.part')), `${track} left a .part`);
  check(chunks.some((c) => c.closeReason === 'pause'), `${track} has no pause boundary`);
  check(chunks.some((c) => c.openReason === 'resume'), `${track} has no resume boundary`);
  if (track !== 'meeting') continue;
  let toneLevel = 0;
  let markerLevel = 0;
  let afterResume = 0;
  const resumedAt = Math.min(...chunks.filter((c) => c.openReason === 'resume').map((c) => c.startNs));
  for (const chunk of chunks) {
    const [frames, level880, level2000] = execFileSync(
      verify,
      ['--levels', join(folder, chunk.file), '880', '2000'],
      { encoding: 'utf8' },
    )
      .trim()
      .split(' ')
      .map(Number);
    check(frames === chunk.frames, `${chunk.file} decoded ${frames} of ${chunk.frames} frames`);
    toneLevel = Math.max(toneLevel, level880);
    markerLevel = Math.max(markerLevel, level2000);
    if (chunk.startNs >= resumedAt) afterResume = Math.max(afterResume, level880);
  }
  console.log('880 level', toneLevel, '2000 level', markerLevel, 'after resume', afterResume);
  console.log('loudest meeting level while paused', loudestWhilePaused, 'dB');
  check(toneLevel > 500, 'tone too quiet to prove anything');
  check(loudestWhilePaused > -40, 'no sound reached the stream while paused, so the marker proves nothing');
  check(afterResume > 500, 'no tone after resume');
  check(markerLevel <= toneLevel * 0.03, 'marker reached a chunk');
}

const log = readFileSync(join(out, 'audio', 'session.log'), 'utf8');
console.log(log);
const events = log.trim().split('\n').map((line) => JSON.parse(line));
check(events.map((e) => e.event).join() === 'open,pause,resume', 'session.log events');
check(!events[0].wholeComputer, 'open must not say whole computer');
check(events[1].commandId === 'p' && events[1].cause === 'user', 'pause record');
check(events[1].seq === 2 && events[2].seq === 3, 'session.log seq');

for (const failure of failures) console.log('FAILED:', failure);
console.log(failures.length ? 'FAIL' : 'PASS');
process.exit(failures.length ? 1 : 0);
