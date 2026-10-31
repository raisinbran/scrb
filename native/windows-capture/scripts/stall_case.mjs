// T23: does meeting audio survive a stall? A player sends a pulse every 600 ms with output muted while
// the whole helper process is frozen, then only its reader stops. Counts the pulses saved in each
// stall; any pulse missing from audio the chunks claim to hold is unmarked loss and fails the case.
// Usage: node stall_case.mjs <work dir> [--load]
import { Buffer } from 'node:buffer';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { constants, cpus, setPriority, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { chunksOf, detect, sweep } from './shared_sound.mjs';

const RATE = 48000;
const SPACING_MS = 600;
const PLAY_SECONDS = 90;
const LEAD_MS = 8000;
const STALLS = [
  { kind: 'process', ms: 4000 },
  { kind: 'process', ms: 14000 }, // F4's longest was 13.8 s
  { kind: 'reader', ms: 4000 },
];
const SETTLE_MS = 8000;

const scripts = dirname(fileURLToPath(import.meta.url));
const root = resolve(scripts, '..');
const repo = resolve(root, '..', '..');
const helper = join(root, 'build', 'bin', 'scrb-capture.exe');
const verify = join(root, 'build', 'bin', 'ChunkVerify.exe');
const mute = join(repo, 'phase0', 'probes', 'windows-mute', 'Mute.exe');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const SUSPENDER = `
Add-Type -Namespace Scrb -Name Nt -MemberDefinition '
[DllImport("ntdll.dll")] public static extern int NtSuspendProcess(IntPtr h);
[DllImport("ntdll.dll")] public static extern int NtResumeProcess(IntPtr h);'
$h = [Diagnostics.Process]::GetProcessById($args[0]).Handle
[Console]::Out.WriteLine('ready')
while ($ms = [Console]::In.ReadLine()) {
  [void][Scrb.Nt]::NtSuspendProcess($h)
  Start-Sleep -Milliseconds $ms
  [void][Scrb.Nt]::NtResumeProcess($h)
  [Console]::Out.WriteLine('done')
}`;

function writePulses(path) {
  const pulse = sweep();
  const pcm = new Int16Array(PLAY_SECONDS * RATE);
  const step = (SPACING_MS * RATE) / 1000;
  for (let at = RATE; at + pulse.length < pcm.length; at += step) {
    pulse.forEach((value, i) => {
      pcm[at + i] = Math.round(value * 0.8 * 32767);
    });
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.byteLength, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.byteLength, 40);
  writeFileSync(path, Buffer.concat([header, Buffer.from(pcm.buffer)]));
}

/** Saved meeting audio laid out on the timeline, so a pulse across a chunk join still counts. */
function timeline(audioDir) {
  const chunks = chunksOf(audioDir, 'meeting');
  const raw = join(tmpdir(), `scrb-stall-${process.pid}.raw`);
  const seconds = Math.max(...chunks.map(({ endNs }) => endNs)) / 1e9;
  const samples = new Float64Array(Math.ceil(seconds * RATE));
  for (const chunk of chunks) {
    execFileSync(verify, ['--pcm', join(audioDir, 'meeting', chunk.file), raw]);
    const bytes = readFileSync(raw);
    const pcm = new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
    samples.set(pcm.subarray(0, samples.length - Math.round((chunk.startNs / 1e9) * RATE)), Math.round((chunk.startNs / 1e9) * RATE));
  }
  rmSync(raw, { force: true });
  return { samples, chunks };
}

function analyse(audioDir, stalls) {
  const { samples, chunks } = timeline(audioDir);
  const found = detect(samples).map((at) => (at / RATE) * 1000);
  const first = found[0];
  const seen = new Map();
  let worstMs = 0;
  for (const atMs of found) {
    const index = Math.round((atMs - first) / SPACING_MS);
    seen.set(index, atMs);
    worstMs = Math.max(worstMs, Math.abs(atMs - first - index * SPACING_MS));
  }
  const lastIndex = Math.max(...seen.keys());
  const saved = (atMs) => chunks.some(({ startNs, endNs }) => startNs / 1e6 <= atMs && atMs + 60 <= endNs / 1e6);
  let unmarked = 0;
  const missing = [];
  for (let index = 0; index <= lastIndex; index += 1) {
    if (seen.has(index)) continue;
    const atMs = first + index * SPACING_MS;
    missing.push(atMs);
    if (saved(atMs)) unmarked += 1;
  }
  console.log(`pulses found ${found.length}, expected ${lastIndex + 1}, worst distance from the 600 ms grid ${worstMs.toFixed(2)} ms`);
  for (const { kind, ms, startMs, endMs } of stalls) {
    const inside = (atMs) => atMs >= startMs && atMs < endMs;
    const lost = missing.filter(inside).length;
    let expected = 0;
    for (let index = 0; index <= lastIndex; index += 1) if (inside(first + index * SPACING_MS)) expected += 1;
    console.log(`${kind} stall ${ms} ms at ${(startMs / 1000).toFixed(2)}-${(endMs / 1000).toFixed(2)} s: kept ${expected - lost} of ${expected} pulses`);
  }
  const outside = missing.filter((atMs) => !stalls.some(({ startMs, endMs }) => atMs >= startMs - 1000 && atMs < endMs + 1000));
  console.log(`missing inside saved audio (unmarked): ${unmarked}; missing away from any stall: ${outside.length}`);
  return unmarked === 0 && outside.length === 0;
}

const work = resolve(process.argv[2]);
const load = process.argv[3] === '--load';
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const wav = join(work, 'pulses.wav');
writePulses(wav);

const wasMuted = /muted=1/.test(execFileSync(mute, ['status'], { encoding: 'utf8' }));
execFileSync(mute, ['on']);
const burners = Math.floor(cpus().length / 2);
const burn = load ? spawn(process.execPath, [join(scripts, 'long_run.mjs'), '--burn', String(burners)], { stdio: ['pipe', 'ignore', 'ignore'] }) : null;
if (burn) setPriority(burn.pid, constants.priority.PRIORITY_BELOW_NORMAL);
console.log(load ? `load: ${burners} spinning threads of ${cpus().length} at below-normal priority` : 'load: none');

const player = spawn('powershell.exe', ['-NoProfile', '-Command', `(New-Object Media.SoundPlayer '${wav}').PlaySync()`], { stdio: 'ignore', windowsHide: true });
const worker = spawn(helper, ['--test-hooks'], { stdio: ['pipe', 'pipe', 'inherit'] });
const suspender = spawn('powershell.exe', ['-NoProfile', '-Command', `& {${SUSPENDER}} ${worker.pid}`], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
const suspenderLines = createInterface({ input: suspender.stdout })[Symbol.asyncIterator]();

const events = [];
let onAck = () => undefined;
createInterface({ input: worker.stdout }).on('line', (line) => {
  const message = JSON.parse(line);
  if (message.type === 'ack') onAck(message);
  else if (!['health', 'trackHealth', 'chunkClosed'].includes(message.event)) events.push(line);
});
const send = (id, fields) =>
  new Promise((done) => {
    onAck = done;
    worker.stdin.write(`${JSON.stringify({ id, ...fields })}\n`);
  });

const stalls = [];
let ok;
try {
  await suspenderLines.next();
  await sleep(1000);
  const opened = await send('o', { name: 'open', sessionId: 's', outputDir: work, source: [player.pid], mic: 'default' });
  if (!opened.ok) throw new Error(`open refused: ${JSON.stringify(opened)}`);
  const started = await send('s', { name: 'start' });
  const startedAt = performance.now() - started.atNs / 1e6;
  for (const { kind, ms } of STALLS) {
    await sleep(LEAD_MS);
    const startMs = performance.now() - startedAt;
    if (kind === 'process') {
      suspender.stdin.write(`${ms}\n`);
      await suspenderLines.next();
    } else {
      for (const track of ['meeting', 'microphone']) await send(`i${track}`, { name: 'inject', track, fault: 'stall', ms });
      await sleep(ms);
    }
    stalls.push({ kind, ms, startMs, endMs: performance.now() - startedAt });
  }
  await sleep(SETTLE_MS);
  await send('x', { name: 'stop' });
  await new Promise((done) => worker.once('exit', done));
  for (const line of events) console.log(line);
  ok = analyse(join(work, 'audio'), stalls);
  console.log(execFileSync(verify, [work], { encoding: 'utf8' }).trim());
} finally {
  suspender.stdin.end();
  worker.kill();
  burn?.stdin.end();
  spawnSync('taskkill', ['/PID', String(player.pid), '/T', '/F'], { stdio: 'ignore' });
  if (!wasMuted) execFileSync(mute, ['off']);
}
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
