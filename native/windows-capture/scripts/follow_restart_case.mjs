// BUG-1 F10: a followed recording keeps its device through a pause and a killed worker, with output
// muted.  The meeting track must hear the call-type tone in all three stretches, on one timeline.
// Usage: node follow_restart_case.mjs <work dir> <CommTone.exe>
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const helper = join(root, 'build', 'bin', 'scrb-capture.exe');
const mute = join(root, '..', '..', 'native', 'windows-capture', 'tools', 'windows-mute', 'Mute.exe');
const [work, tone] = process.argv.slice(2);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

execFileSync(mute, ['on']);
const dir = join(work, 'follow-restart');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const player = spawn(tone, ['40', 'comms', 'none', 'console'], { stdio: 'ignore' });
await sleep(500);
const open = { name: 'open', sessionId: 's', outputDir: dir, source: [player.pid], mic: 'default', followApp: basename(tone) };

function launch() {
  const worker = spawn(helper, [], { stdio: ['pipe', 'pipe', 'ignore'] });
  const acks = new Map();
  const state = { levels: [], worker };
  createInterface({ input: worker.stdout }).on('line', (line) => {
    const m = JSON.parse(line);
    if (m.event === 'health') state.levels.push(m.meetingDb);
    if (m.type === 'ack') acks.get(m.id)?.(m);
  });
  state.send = (id, o) =>
    new Promise((done) => {
      acks.set(id, done);
      worker.stdin.write(`${JSON.stringify({ id, ...o })}\n`);
    });
  return state;
}
const heard = (s) => s.levels.filter((db) => db > -80).length;

const first = launch();
await first.send('o1', open);
const started = await first.send('s1', { name: 'start' });
await sleep(6000);
await first.send('p', { name: 'pause' });
await sleep(2000);
await first.send('r', { name: 'resume' });
await sleep(5000);
first.worker.kill('SIGKILL');
await sleep(1000);
const second = launch();
const reopened = await second.send('o2', { ...open, clockOriginNs: started.clockOriginNs });
const restarted = await second.send('s2', { name: 'start' });
await sleep(8000);
await second.send('q', { name: 'stop' });
await sleep(800);
second.worker.kill();
player.kill();

const followed = readFileSync(join(dir, 'audio', 'session.log'), 'utf8').match(/"followApp":"CommTone.exe"/g);
const results = {
  firstWorkerSeconds: heard(first),
  secondWorkerSeconds: heard(second),
  reopened: reopened.ok,
  restarted: restarted.ok,
  sameClock: restarted.clockOriginNs === started.clockOriginNs,
  keptFollowedSource: followed?.length === 2,
};
console.log(JSON.stringify(results));
const pass = results.firstWorkerSeconds >= 10 && results.secondWorkerSeconds >= 5 && results.reopened &&
  results.restarted && results.sameClock && results.keptFollowedSource;
console.log(pass ? 'PASS' : 'FAIL');
execFileSync(mute, ['on']);
process.exit(pass ? 0 : 1);
