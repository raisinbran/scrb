// Measures switching the microphone (and the meeting app) mid-recording, including a failed switch.
// Usage: node switch-case.mjs <helper> <scratch dir> <second mic id> [switches] [appBundleIdA appBundleIdB]
// Without the apps, switches the mic and plays no sound (the mic track only needs the device's packets).
// With two running apps that are playing sound, switches the meeting app A, B, A, ... instead.
// Prints one JSON report; `verdict` holds the pass/fail booleans.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';

const [helper, scratch, otherMic, count = '6', appA, appB] = [...process.argv.slice(2)].map(
  (p, i) => (i < 2 ? resolve(p) : p),
);
const work = join(scratch, 'switch-case');
await mkdir(work, { recursive: true });
const child = spawn(helper, [], { stdio: ['pipe', 'pipe', 'inherit'] });
const pending = new Map();
const events = [];
createInterface({ input: child.stdout }).on('line', (line) => {
  const m = JSON.parse(line);
  if (m.type === 'ack') pending.get(m.id)?.(m);
  else events.push({ at: Math.round(performance.now()), ...m });
});
let id = 0;
async function send(name, extra = {}) {
  const commandId = String(++id);
  const ack = new Promise((ok, no) => {
    const t = setTimeout(() => no(new Error(`no ${name} ack`)), 10000);
    pending.set(commandId, (m) => {
      clearTimeout(t);
      ok(m);
    });
  });
  const began = performance.now();
  child.stdin.write(JSON.stringify({ id: commandId, name, ...extra }) + '\n');
  const result = await ack;
  return { ...result, ackMs: Math.round(performance.now() - began) };
}
const switches = [];
async function pidsOf(bundleId) {
  const listed = await send('listApps', { include: [] });
  const pids = listed.apps?.find((a) => a.bundleId === bundleId)?.pids ?? [];
  if (pids.length === 0) throw new Error(`${bundleId} is not running or has no audio process`);
  return pids;
}
const appMode = Boolean(appA && appB);
const sourceA = appMode ? await pidsOf(appA) : [];
const sourceB = appMode ? await pidsOf(appB) : [];
const opened = await send('open', {
  sessionId: 'switch-case',
  outputDir: work,
  source: sourceA,
  mic: 'default',
});
await send('start');
await delay(1500);
for (let i = 0; appMode && i < Number(count); i += 1) {
  const source = i % 2 === 0 ? sourceB : sourceA;
  const r = await send('selectSource', { source });
  switches.push({
    command: `selectSource ${i % 2 === 0 ? 'B' : 'A'}`,
    ok: r.ok,
    ackMs: r.ackMs,
    error: r.error,
    tracks: r.activeTracks,
  });
  await delay(2000);
}
for (let i = 0; !appMode && i < Number(count); i += 1) {
  const mic = i % 2 === 0 ? otherMic : 'default';
  const r = await send('selectMic', { mic });
  switches.push({
    command: `selectMic ${mic === 'default' ? 'default' : 'other'}`,
    ok: r.ok,
    ackMs: r.ackMs,
    error: r.error,
    tracks: r.activeTracks,
  });
  await delay(1500);
}
// Failed switch: a mic that does not exist. The previous mic must keep recording.
const bad = appMode
  ? await send('selectSource', { source: [-1] })
  : await send('selectMic', { mic: 'no-such-mic' });
switches.push({
  command: appMode ? 'selectSource [-1] (no process)' : 'selectMic nonexistent',
  ok: bad.ok,
  ackMs: bad.ackMs,
  error: bad.error,
  tracks: bad.activeTracks,
});
await delay(1500);
const same = appMode
  ? await send('selectSource', { source: sourceA })
  : await send('selectMic', { mic: 'default' });
await delay(1500);
const stopped = await send('stop');
const report = {
  opened: opened.activeTracks,
  sameValueAck: same.ok,
  switches,
  stoppedAtNs: stopped.atNs,
  tracks: {},
};

for (const track of ['microphone', 'meeting']) {
  const dir = join(work, 'audio', track);
  const chunks = (await readFile(join(dir, 'chunks.log'), 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const rows = [];
  for (const [n, c] of chunks.entries()) {
    const buf = await readFile(join(dir, c.file));
    // Last Ogg page's granule position = decoded samples at 48 kHz.
    const at = buf.lastIndexOf('OggS');
    const granule = Number(buf.readBigUInt64LE(at + 6));
    const decodedMs = Math.round((granule / 48000) * 1000);
    const loggedMs = Math.round((c.frames / c.rate) * 1000);
    rows.push({
      seq: c.seq,
      startMs: +(c.startNs / 1e6).toFixed(1),
      endMs: +(c.endNs / 1e6).toFixed(1),
      gapBeforeMs: n === 0 ? null : +((c.startNs - chunks[n - 1].endNs) / 1e6).toFixed(1),
      open: c.openReason,
      close: c.closeReason,
      loggedMs,
      oggMs: decodedMs,
      oggOk: buf.subarray(0, 4).toString() === 'OggS' && Math.abs(decodedMs - loggedMs) < 30,
    });
  }
  const leftovers = (await readdir(dir)).filter((f) => f.endsWith('.part'));
  report.tracks[track] = { chunks: rows, partFiles: leftovers.length };
}
const track = report.tracks[appMode ? 'meeting' : 'microphone'].chunks;
const okSwitches = switches.slice(0, -1);
report.verdict = {
  everySwitchAckedOk: okSwitches.every((x) => x.ok),
  failedSwitchRolledBack: switches.at(-1).ok === false && switches.at(-1).tracks.length === 2,
  sameValueIsNoop: report.sameValueAck === true,
  noHoleInSequence: track.every((c, i) => c.seq === i),
  noOverlap: track.every((c) => c.gapBeforeMs === null || c.gapBeforeMs >= -2),
  everyChunkReadable: track.every((c) => c.oggOk),
  hasChunks: track.length > 0,
  recordsAfterFailedSwitch: track.length > 0 && track.at(-1).endMs - track.at(-1).startMs > 1000,
  maxGapMs: Math.max(...track.map((c) => c.gapBeforeMs ?? 0)),
};
report.events = events.filter((e) => e.event !== 'health' && e.event !== 'framesDropped');
console.log(JSON.stringify(report, null, 1));
child.kill();
