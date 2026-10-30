// Real crash test, adapted from native/macos-capture/scripts/crash_case.mjs: records a tone target,
// force-kills the worker, recovers, and reports the audio lost.
// Usage: node crash_case.mjs <work dir>
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { sealAudio } from '../../../packages/app-core/src/recovery.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(root, '..', '..');
const helper = join(root, 'build', 'bin', 'scrb-capture.exe');
const verify = join(root, 'build', 'bin', 'ChunkVerify.exe');
const mute = join(repo, 'phase0', 'probes', 'windows-mute', 'Mute.exe');
const tone = join(repo, 'phase0', 'probes', 'windows-tone-player', 'TonePlayer.exe');

const work = resolve(process.argv[2]);
const seconds = 7.3;
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const wasMuted = /muted=1/.test(execFileSync(mute, ['status'], { encoding: 'utf8' }));
execFileSync(mute, ['on']);
const player = spawn(tone, ['880', '20', '0'], { stdio: 'ignore' });
const worker = spawn(helper, [], { stdio: ['pipe', 'pipe', 'inherit'] });
const lines = createInterface({ input: worker.stdout })[Symbol.asyncIterator]();
const send = async (id, fields) => {
  worker.stdin.write(`${JSON.stringify({ id, ...fields })}\n`);
  for (;;) {
    const message = JSON.parse((await lines.next()).value);
    if (message.type === 'ack') return message;
  }
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

await sleep(500);
await send('o', { name: 'open', sessionId: 's', outputDir: work, source: [player.pid], mic: 'default' });
await send('s', { name: 'start' });
const started = Date.now();
await sleep(seconds * 1000);
const audio = join(work, 'audio');
const lock = join(audio, 'writer.lock');
const held = () => spawnSync(helper, ['check-lock', lock]).status === 3;
const heldWhileRunning = held();
console.log('lock held while running:', heldWhileRunning);
const recordedMs = Date.now() - started;
worker.kill('SIGKILL');
await sleep(100);
const heldAfterKill = held();
console.log('lock held after kill:', heldAfterKill);
const list = () => readdirSync(join(audio, 'meeting')).join(' ');
console.log('before:', list());

const result = await sealAudio(audio, async () => held());
console.log('after:', list());
const lost = recordedMs - Math.round(result.endNs / 1e6);
console.log('outcome', result.outcome, 'recorded', recordedMs, 'ms, recovered end', Math.round(result.endNs / 1e6), 'ms');
console.log('lost', lost, 'ms; gaps', JSON.stringify(result.gaps));
const last = result.tracks.meeting.chunks.at(-1);
console.log('last chunk', JSON.stringify(last));
const decoded = execFileSync(verify, ['--levels', join(audio, 'meeting', last.file), '880'], { encoding: 'utf8' }).trim();
console.log('repaired chunk frames and 880 level:', decoded);
spawnSync('taskkill', ['/PID', String(player.pid), '/T', '/F'], { stdio: 'ignore' });
if (!wasMuted) execFileSync(mute, ['off']);

const [frames, level] = decoded.split(' ').map(Number);
const passed =
  heldWhileRunning && !heldAfterKill && result.outcome === 'recovered' && last.state === 'recovered' &&
  frames > 0 && level > 500 && lost >= 0 && lost <= 1100;
console.log(passed ? 'PASS' : 'FAIL');
process.exit(passed ? 0 : 1);
