// T24: a stream dies during a pause, forced with the blackhole hook, output muted. First the watchdog
// finds it while paused; then the pause ends before it can, so resume lands on a dead stream. Passes
// if both tracks come back and the tone is saved after each resume.
// Usage: node pause_fault_case.mjs <work dir>
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { chunksOf } from './shared_sound.mjs';

const DEATH_LIMIT_MS = 5000;
const MARK_SLACK_MS = 500;
const TRACKS = ['meeting', 'microphone'];

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(root, '..', '..');
const helper = join(root, 'build', 'bin', 'scrb-capture.exe');
const verify = join(root, 'build', 'bin', 'ChunkVerify.exe');
const mute = join(repo, 'native', 'windows-capture', 'tools', 'windows-mute', 'Mute.exe');
const tone = process.env.SCRB_TONE ?? join(repo, 'native', 'windows-capture', 'tools', 'windows-tone-player', 'TonePlayer.exe');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const work = resolve(process.argv[2]);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const wasMuted = /muted=1/.test(execFileSync(mute, ['status'], { encoding: 'utf8' }));
execFileSync(mute, ['on']);
const player = spawn(tone, ['880', '90', '0'], { stdio: 'ignore', windowsHide: true });
const worker = spawn(helper, ['--test-hooks', '--death-limit-ms', String(DEATH_LIMIT_MS)], { stdio: ['pipe', 'pipe', 'inherit'] });

const events = [];
let meetingDb = -120;
let onAck = () => undefined;
const waiters = new Set();
createInterface({ input: worker.stdout }).on('line', (line) => {
  const message = JSON.parse(line);
  if (message.type === 'ack') onAck(message);
  else if (message.event === 'health') meetingDb = message.meetingDb;
  else if (!['trackHealth', 'chunkClosed'].includes(message.event)) {
    console.log(line);
    events.push(message);
    for (const wake of waiters) wake();
  }
});
const send = (id, fields) =>
  new Promise((done) => {
    onAck = done;
    worker.stdin.write(`${JSON.stringify({ id, ...fields })}\n`);
  });
const hole = async (ms) => {
  for (const track of TRACKS) await send(`h${track}${ms}${events.length}`, { name: 'inject', track, fault: 'blackhole', ms });
};
/** Waits for `name` on both tracks after event number `from`. */
const both = async (name, from, limitMs) => {
  const seen = () => TRACKS.every((track) => events.slice(from).some((e) => e.event === name && e.track === track));
  const until = Date.now() + limitMs;
  while (!seen() && Date.now() < until) await sleep(50);
  check(seen(), `${name} did not reach both tracks within ${limitMs} ms`);
};

try {
  await sleep(500);
  check((await send('o', { name: 'open', sessionId: 's', outputDir: work, source: [player.pid], mic: 'default' })).ok, 'open refused');
  check((await send('s', { name: 'start' })).gate === 'open', 'start left the gate closed');
  await sleep(6000);

  check((await send('p1', { name: 'pause' })).gate === 'closed', 'first pause left the gate open');
  await sleep(1000);
  let mark = events.length;
  await hole(1);
  await both('streamDead', mark, DEATH_LIMIT_MS + 4000);
  await hole(0);
  await both('streamReopened', mark, 6000);
  await sleep(3000);
  console.log('meeting level after reopening while paused', meetingDb, 'dB');
  check(meetingDb > -40, 'the reopened meeting stream hears nothing while paused');
  check((await send('r1', { name: 'resume' })).gate === 'open', 'first resume left the gate closed');
  await sleep(6000);

  check((await send('p2', { name: 'pause' })).gate === 'closed', 'second pause left the gate open');
  await sleep(1000);
  mark = events.length;
  await hole(1);
  await sleep(1500);
  check(!events.slice(mark).some((e) => e.event === 'streamDead'), 'the death was found before the resume');
  check((await send('r2', { name: 'resume' })).gate === 'open', 'resume on a dead stream left the gate closed');
  await both('streamDead', mark, DEATH_LIMIT_MS + 4000);
  await hole(0);
  await both('streamReopened', mark, 6000);
  await sleep(6000);
  await send('x', { name: 'stop' });
  await new Promise((done) => worker.once('exit', done));
} finally {
  worker.kill();
  spawnSync('taskkill', ['/PID', String(player.pid), '/T', '/F'], { stdio: 'ignore' });
  if (!wasMuted) execFileSync(mute, ['off']);
}

const audioDir = join(work, 'audio');
const records = readFileSync(join(audioDir, 'session.log'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
const pausedSpans = records.flatMap((record, i) => (record.event === 'resume' ? [(record.atNs - records[i - 1].atNs) / 1e6] : []));
for (const track of TRACKS) {
  const chunks = chunksOf(audioDir, track);
  console.log(track, chunks.map((c) => `${(c.startNs / 1e9).toFixed(2)}-${(c.endNs / 1e9).toFixed(2)} ${c.openReason}/${c.closeReason}`).join('; '));
  check(chunks.filter((c) => c.closeReason === 'pause').length === 2, `${track} lacks two pause boundaries`);
  check(chunks.filter((c) => c.openReason === 'resume').length >= 1, `${track} has no resume boundary`);
  check(chunks.at(-1).closeReason === 'stop', `${track} did not record to the end`);
  const resumed = chunks.filter((c) => c.openReason === 'resume');
  resumed.forEach((chunk, i) => {
    const pausedMs = pausedSpans[i];
    console.log(`${track} resume ${i + 1}: paused ${pausedMs.toFixed(0)} ms, gap ${chunk.missingBeforeMs.toFixed(0)} ms marked ${chunk.missingCause}`);
    const wantedCause = chunk.missingBeforeMs < pausedMs + MARK_SLACK_MS ? 'pause' : 'device';
    check(chunk.missingCause === wantedCause, `${track} resume ${i + 1}: ${(chunk.missingBeforeMs - pausedMs).toFixed(0)} ms past the pause, marked ${chunk.missingCause}`);
  });
  if (track !== 'meeting') continue;
  const resumes = chunks.filter((c) => ['resume', 'device'].includes(c.openReason));
  const levels = resumes.map((c) => Number(execFileSync(verify, ['--levels', join(audioDir, track, c.file), '880'], { encoding: 'utf8' }).trim().split(' ')[1]));
  console.log('880 level in chunks after each resume or reopen', levels.join(' '));
  check(levels.length >= 2 && levels.every((level) => level > 500), 'tone missing after a resume or reopen');
}
console.log(execFileSync(verify, [work], { encoding: 'utf8' }).trim());
for (const failure of failures) console.log('FAILED:', failure);
console.log(failures.length ? 'FAIL' : 'PASS');
process.exit(failures.length ? 1 : 0);
