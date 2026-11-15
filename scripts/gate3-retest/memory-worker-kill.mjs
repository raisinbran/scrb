// Gate 3 Windows check: whole-app memory and one kill of the live transcription worker.
//
//   node memory-worker-kill.mjs watch  --app-pid N --library DIR --out DIR [--seconds 600] [--interval 3]
//   node memory-worker-kill.mjs verify --out DIR --meeting DIR
//
// watch: every few seconds sums the memory of the app process and all its descendants (main, renderer,
// helper, whisper-server) and writes samples.csv. Create a file named KILL in the out folder, while audible
// audio is playing on both tracks, to kill the live worker once; create STOP (or wait out --seconds) to end.
// Before the kill it hashes every finished chunk so verify can prove they did not change.
// verify: after the app's Stop, checks the pre-kill hashes, chunk numbering, sealed list, status and gaps.
// Output holds numbers, process names and fixed codes only: no meeting text. The out folder must be new and outside Git.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIB = 1048576;
const TRACKS = ['microphone', 'meeting'];

// ---------------------------------------------------------------- pure helpers (unit-tested)

/** The app process and everything below it. rows: { pid, ppid, name, cmd, ws, priv } (bytes). */
export function descendants(rows, rootPid) {
  const byParent = new Map();
  for (const r of rows) {
    if (!byParent.has(r.ppid)) byParent.set(r.ppid, []);
    byParent.get(r.ppid).push(r);
  }
  const out = [];
  const root = rows.find((r) => r.pid === rootPid);
  if (!root) return out;
  const seen = new Set([rootPid]);
  const todo = [root];
  while (todo.length) {
    const r = todo.pop();
    out.push(r);
    for (const c of byParent.get(r.pid) ?? []) {
      if (!seen.has(c.pid)) {
        seen.add(c.pid);
        todo.push(c);
      }
    }
  }
  return out;
}

export function roleOf(row, rootPid) {
  const name = row.name.toLowerCase();
  if (name.startsWith('whisper-server')) return 'live-worker';
  if (name.startsWith('scrb-capture')) return 'capture-helper';
  const type = /--type=([a-z-]+)/.exec(row.cmd ?? '')?.[1];
  if (row.pid === rootPid) return 'main';
  if (type === 'renderer') return 'renderer';
  if (type === 'gpu-process') return 'gpu';
  if (type) return type;
  return 'other';
}

/** Sums over the processes. Working sets count pages shared between processes once per process. */
export function totals(procs) {
  let ws = 0;
  let priv = 0;
  for (const p of procs) {
    ws += p.ws;
    priv += p.priv;
  }
  return { ws, priv, count: procs.length };
}

export function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/** Finished chunks of one track: NNNNNN.opus, never .part. Sorted by number. */
export function finishedChunks(trackDir) {
  if (!existsSync(trackDir)) return [];
  return readdirSync(trackDir)
    .filter((n) => /^\d{6}\.opus$/.test(n))
    .sort();
}

export function hashChunks(audioDir) {
  const out = {};
  for (const t of TRACKS) {
    out[t] = {};
    for (const n of finishedChunks(join(audioDir, t))) out[t][n] = sha256File(join(audioDir, t, n));
  }
  return out;
}

/** Numbers 0..n-1 with none missing; `gaps` lists the numbers that are absent. */
export function contiguity(names) {
  const nums = names.map((n) => Number(n.slice(0, 6)));
  const max = nums.length ? Math.max(...nums) : -1;
  const have = new Set(nums);
  const gaps = [];
  for (let i = 0; i <= max; i += 1) if (!have.has(i)) gaps.push(i);
  return { count: nums.length, max, gaps };
}

/** Compares the pre-kill hashes with the current ones. */
export function compareHashes(pre, now) {
  let unchanged = 0;
  const changed = [];
  const missing = [];
  for (const t of TRACKS) {
    for (const [n, h] of Object.entries(pre[t] ?? {})) {
      if (now[t]?.[n] === undefined) missing.push(`${t}/${n}`);
      else if (now[t][n] !== h) changed.push(`${t}/${n}`);
      else unchanged += 1;
    }
  }
  return { unchanged, changed, missing };
}

/** Newest meeting folder whose meeting.json says it is recording. */
export function findRecording(library) {
  const dir = join(library, 'meetings');
  if (!existsSync(dir)) return null;
  let best = null;
  for (const n of readdirSync(dir)) {
    const meta = join(dir, n, 'meeting.json');
    if (!existsSync(meta)) continue;
    try {
      const j = JSON.parse(readFileSync(meta, 'utf8'));
      const t = statSync(meta).mtimeMs;
      if (j.status === 'recording' && (!best || t > best.t)) best = { folder: join(dir, n), t };
    } catch {
      // unreadable while being written; ignore this round
    }
  }
  return best?.folder ?? null;
}

/** Checks the out folder is new and not inside the repository (evidence stays outside Git). */
export function assertFreshOutside(out, repoRoot) {
  if (existsSync(out)) throw new Error('E_OUT_EXISTS');
  const parent = dirname(resolve(out));
  mkdirSync(parent, { recursive: true });
  const rel = relative(realpathSync(repoRoot), realpathSync(parent));
  if (rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep) && !/^[a-z]:/i.test(rel)))
    throw new Error('E_OUT_IN_REPO');
}

// ---------------------------------------------------------------- process listing (Windows)

const PS = [
  '-NoProfile',
  '-NonInteractive',
  '-Command',
  'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine,WorkingSetSize,PrivatePageCount | ConvertTo-Json -Compress',
];

function listProcesses() {
  return new Promise((done, fail) => {
    execFile('powershell.exe', PS, { encoding: 'utf8', maxBuffer: 1 << 26 }, (e, out) => {
      if (e) return fail(new Error('E_PROCESS_LIST'));
      const j = JSON.parse(out);
      const arr = Array.isArray(j) ? j : [j];
      done(
        arr.map((p) => ({
          pid: p.ProcessId,
          ppid: p.ParentProcessId,
          name: p.Name ?? '',
          cmd: p.CommandLine ?? '',
          ws: Number(p.WorkingSetSize ?? 0),
          priv: Number(p.PrivatePageCount ?? 0),
        })),
      );
    });
  });
}

// ---------------------------------------------------------------- watch

const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : fallback;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function watch() {
  const appPid = Number(arg('--app-pid'));
  const library = arg('--library');
  const out = arg('--out');
  const seconds = Number(arg('--seconds', '600'));
  const interval = Number(arg('--interval', '3'));
  if (!appPid || !library || !out || !(seconds > 0) || !(interval > 0)) throw new Error('E_USAGE');
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  assertFreshOutside(out, repo);
  mkdirSync(out, { recursive: true });
  const log = (line) =>
    appendFileSync(join(out, 'events.log'), `${new Date().toISOString()} ${line}\n`);
  writeFileSync(join(out, 'samples.csv'), 'tSec,processes,wsMiB,privateMiB,liveWorkerPid\n');
  writeFileSync(join(out, 'procs.csv'), 'tSec,pid,role,name,wsMiB,privateMiB\n');
  log(`watch start appPid=${appPid} seconds=${seconds} interval=${interval}`);

  const t0 = Date.now();
  let peakWs = 0;
  let peakPriv = 0;
  let peakAt = 0;
  let samples = 0;
  let kill = null;
  let restart = null;
  let lastWorker = null;
  const stopFile = join(out, 'STOP');
  const killFile = join(out, 'KILL');

  while (true) {
    const t = (Date.now() - t0) / 1000;
    const rows = await listProcesses();
    const tree = descendants(rows, appPid);
    if (tree.length === 0) {
      log('app process not found: ending');
      break;
    }
    const tot = totals(tree);
    const worker = tree.find((r) => roleOf(r, appPid) === 'live-worker') ?? null;
    samples += 1;
    if (tot.ws > peakWs) {
      peakWs = tot.ws;
      peakAt = t;
    }
    peakPriv = Math.max(peakPriv, tot.priv);
    appendFileSync(
      join(out, 'samples.csv'),
      `${t.toFixed(1)},${tot.count},${(tot.ws / MIB).toFixed(1)},${(tot.priv / MIB).toFixed(1)},${worker?.pid ?? ''}\n`,
    );
    for (const p of tree)
      appendFileSync(
        join(out, 'procs.csv'),
        `${t.toFixed(1)},${p.pid},${roleOf(p, appPid)},${p.name},${(p.ws / MIB).toFixed(1)},${(p.priv / MIB).toFixed(1)}\n`,
      );

    if (kill && !restart && worker && worker.pid !== kill.pid) {
      restart = { tSec: Number(t.toFixed(1)), newPid: worker.pid };
      log(`live worker running again pid=${worker.pid} at ${restart.tSec}s`);
    }
    if (!kill && existsSync(killFile)) {
      const folder = findRecording(library);
      const audio = folder && join(folder, 'audio');
      const pre = audio ? hashChunks(audio) : null;
      const chunkCounts = pre ? TRACKS.map((k) => Object.keys(pre[k]).length) : [0, 0];
      if (!worker) log('KILL refused: no live worker process found');
      else if (!folder) log('KILL refused: no meeting with status recording found');
      else if (chunkCounts.some((n) => n < 1))
        log(
          `KILL refused: finished chunks per track ${chunkCounts.join('/')}; wait for audio on both tracks`,
        );
      else {
        writeFileSync(
          join(out, 'pre-kill-hashes.json'),
          JSON.stringify({ meeting: folder, hashes: pre }, null, 2),
        );
        const killedAt = new Date().toISOString();
        process.kill(worker.pid, 'SIGKILL');
        kill = {
          tSec: Number(t.toFixed(1)),
          pid: worker.pid,
          utc: killedAt,
          chunksPerTrack: chunkCounts,
        };
        lastWorker = worker.pid;
        log(
          `KILLED live worker pid=${worker.pid} chunks microphone/meeting=${chunkCounts.join('/')}`,
        );
      }
      // One attempt per KILL file: a refused attempt is retried by creating KILL again.
      rmSync(killFile, { force: true });
    }
    if (existsSync(stopFile) || t >= seconds) {
      log(existsSync(stopFile) ? 'STOP file found' : 'time reached');
      break;
    }
    await sleep(interval * 1000);
  }
  const summary = {
    samples,
    intervalSeconds: interval,
    peakWorkingSetMiB: Number((peakWs / MIB).toFixed(1)),
    peakAtSeconds: Number(peakAt.toFixed(1)),
    peakPrivateMiB: Number((peakPriv / MIB).toFixed(1)),
    targetMiB: 6144,
    withinTarget: peakWs / MIB <= 6144,
    note: 'Working sets are summed per process, so pages shared between processes count more than once; private bytes are the lower figure.',
    kill,
    workerRestarted: restart,
    lastKilledPid: lastWorker,
  };
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
  log('watch end');
  console.log(JSON.stringify(summary));
}

// ---------------------------------------------------------------- verify

function verify() {
  const out = arg('--out');
  const meeting = arg('--meeting');
  if (!out || !meeting) throw new Error('E_USAGE');
  const pre = JSON.parse(readFileSync(join(out, 'pre-kill-hashes.json'), 'utf8'));
  const audio = join(meeting, 'audio');
  const now = hashChunks(audio);
  const cmp = compareHashes(pre.hashes, now);
  const tracks = {};
  for (const t of TRACKS) {
    const c = contiguity(finishedChunks(join(audio, t)));
    tracks[t] = {
      ...c,
      partFilesLeft: existsSync(join(audio, t))
        ? readdirSync(join(audio, t)).filter((n) => n.endsWith('.part')).length
        : 0,
      sealed: existsSync(join(audio, t, 'chunks.json')),
    };
  }
  let status;
  try {
    status = JSON.parse(readFileSync(join(meeting, 'meeting.json'), 'utf8')).status;
  } catch {
    status = null;
  }
  let lostAudioGaps;
  try {
    const tr = JSON.parse(readFileSync(join(meeting, 'transcript.json'), 'utf8'));
    lostAudioGaps = (tr.gaps ?? []).filter((g) => g.kind === 'gap').length;
  } catch {
    lostAudioGaps = null;
  }
  const summary = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
  const checks = {
    preKillChunksUnchanged:
      cmp.changed.length === 0 && cmp.missing.length === 0 && cmp.unchanged > 0,
    chunkNumbersContinuous: TRACKS.every((t) => tracks[t].gaps.length === 0 && tracks[t].count > 0),
    noPartFilesLeft: TRACKS.every((t) => tracks[t].partFilesLeft === 0),
    sealed: TRACKS.every((t) => tracks[t].sealed),
    statusReady: status === 'ready',
    noLostAudioGaps: lostAudioGaps === 0,
    workerKilledOnce: summary.kill !== null,
    workerRunningAgainOrReported: summary.workerRestarted !== null,
  };
  const unknown = lostAudioGaps === null || status === null;
  const hard = [
    'preKillChunksUnchanged',
    'chunkNumbersContinuous',
    'noPartFilesLeft',
    'sealed',
    'statusReady',
    'noLostAudioGaps',
    'workerKilledOnce',
  ];
  const result =
    !checks.workerKilledOnce || unknown
      ? 'INCONCLUSIVE'
      : hard.every((k) => checks[k])
        ? 'PASS'
        : 'FAIL';
  const report = {
    result,
    checks,
    unchangedChunks: cmp.unchanged,
    changed: cmp.changed,
    missing: cmp.missing,
    tracks,
    status,
    lostAudioGaps,
    note: 'workerRunningAgainOrReported is informational: if the worker did not restart, the app must have said so on screen (owner records that by hand).',
  };
  writeFileSync(join(out, 'verify.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  process.exitCode = result === 'PASS' ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  Promise.resolve()
    .then(() =>
      mode === 'watch'
        ? watch()
        : mode === 'verify'
          ? verify()
          : Promise.reject(new Error('E_USAGE')),
    )
    .catch((e) => {
      console.log(
        `FAILED ${e instanceof Error && /^E_[A-Z_]+$/.test(e.message) ? e.message : 'E_UNEXPECTED'}`,
      );
      process.exitCode = 1;
    });
}
