// BUG-1: the silence warning and the followed output device, with output muted.  CommTone plays a
// call-type or normal stream; the helper targets it per-app or follows its output device.
// This PC has one output device, so a test hook reports the moves.  Moving to a device that cannot
// open stands for one that left; the track must fall back and mark the gap.
// Usage: node follow_case.mjs <work dir> <CommTone.exe>
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const scripts = dirname(fileURLToPath(import.meta.url));
const root = resolve(scripts, '..');
const helper = join(root, 'build', 'bin', 'scrb-capture.exe');
const mute = join(root, '..', '..', 'phase0', 'probes', 'windows-mute', 'Mute.exe');
const [work, tone] = process.argv.slice(2);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const SECONDS = 40;

async function run(name, category, follow, script = async () => sleep(SECONDS * 1000)) {
  execFileSync(mute, ['on']);
  const dir = join(work, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const player = spawn(tone, [String(SECONDS + 4), category, 'none', 'console'], { stdio: 'ignore' });
  await sleep(500);
  const worker = spawn(helper, ['--test-hooks'], { stdio: ['pipe', 'pipe', 'ignore'] });
  const started = Date.now();
  const seen = { silentAtS: null, levels: [], moved: 0 };
  createInterface({ input: worker.stdout }).on('line', (line) => {
    const m = JSON.parse(line);
    if (m.event === 'health') seen.levels.push(m.meetingDb);
    if (m.event === 'deviceChanged') seen.moved++;
    if (m.event === 'meetingSilent') seen.silentAtS = (Date.now() - started) / 1000;
  });
  const send = (o) => worker.stdin.write(`${JSON.stringify(o)}\n`);
  send({
    id: 'o', name: 'open', sessionId: name, outputDir: dir, source: [player.pid], mic: 'default',
    ...(follow ? { followApp: basename(tone) } : {}),
  });
  await sleep(300);
  send({ id: 's', name: 'start' });
  await script(send);
  send({ id: 'q', name: 'stop' });
  await sleep(1500);
  worker.kill();
  player.kill();
  const log = readFileSync(join(dir, 'audio', 'session.log'), 'utf8');
  const sound = seen.levels.filter((db) => db > -80).length;
  const gaps = readFileSync(join(dir, 'audio', 'meeting', 'chunks.log'), 'utf8').match(/"openReason":"device"/g);
  return { name, ...seen, levels: undefined, reopened: gaps?.length ?? 0, seconds: seen.levels.length, secondsWithSound: sound, logged: log.includes('meetingSilent') };
}

const results = [
  await run('per-app-call-type', 'comms', false),
  await run('per-app-normal', 'other', false),
  await run('follow-call-type', 'comms', true),
  await run('follow-brief-touch', 'comms', true, async (send) => {
    await sleep(8000);
    send({ id: 'f1', name: 'inject', track: 'meeting', fault: 'followDevice', deviceId: 'missing' });
    await sleep(2500);
    send({ id: 'f2', name: 'inject', track: 'meeting', fault: 'followDevice', deviceId: '' });
    await sleep(10000);
  }),
  await run('follow-device-left', 'comms', true, async (send) => {
    await sleep(8000);
    send({ id: 'f1', name: 'inject', track: 'meeting', fault: 'followDevice', deviceId: 'missing' });
    await sleep(6500);
    send({ id: 'f2', name: 'inject', track: 'meeting', fault: 'followDevice', deviceId: '' });
    await sleep(10000);
  }),
];
const [silent, normal, follow, touch, left] = results;
for (const r of results) console.log(JSON.stringify(r));
const pass =
  silent.silentAtS !== null && silent.silentAtS <= 35 && silent.logged &&
  normal.silentAtS === null && normal.secondsWithSound > 30 &&
  follow.silentAtS === null && follow.secondsWithSound > 30 && follow.moved === 0 &&
  touch.moved === 0 && left.moved === 1 && left.reopened >= 1 && left.secondsWithSound >= 18;
console.log(pass ? 'PASS' : 'FAIL');
execFileSync(mute, ['on']);
process.exit(pass ? 0 : 1);
