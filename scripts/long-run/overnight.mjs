// Gate 8 overnight long run: one known invented tone on the meeting track and the default mic,
// recorded through the real capture helper for a chosen time, sampled every minute, stopped cleanly,
// then sealed and checked against the Development Plan targets. Called by overnight-mac.sh and
// overnight-win.ps1, which add the keep-awake and mute steps. Nothing here starts on import of the repo.
//
// Usage: node --experimental-transform-types overnight.mjs --helper <exe> --work <dir>
//          [--seconds N | --smoke] [--sample-seconds N] [--tone-file <m4a>] [--tone-player <exe>]
//        node --experimental-transform-types overnight.mjs --report <work dir>   (re-run the checks)
// Stop early and safely: create a file named STOP in the work dir, or press Ctrl+C once.
import { Buffer } from 'node:buffer';
import { execFile, spawn } from 'node:child_process';
import { clearTimeout } from 'node:timers';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statfsSync,
  statSync,
  writeFileSync,
  openSync,
  writeSync,
  closeSync,
} from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join, resolve } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const here = dirname(fileURLToPath(import.meta.url));
const TRACKS = ['microphone', 'meeting'];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const run = (file, args) =>
  new Promise((done) =>
    execFile(file, args, { encoding: 'utf8' }, (error, stdout) => done({ error, stdout })),
  );
const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : fallback;
};
const flag = (name) => process.argv.includes(name);

// Limits. Drift, lost audio, CPU and the 6 GB app budget come from the Development Plan quality
// targets; the helper-only memory limits are this test's reading of "bounded memory" (see the runbook).
const LIMITS = {
  driftMs: 50,
  driftWindowHours: 4,
  cpuAveragePercentOfCore: 10,
  appBudgetMb: 6144,
  helperPeakMb: 1024,
  helperGrowthMb: 50,
  helperGrowthPercent: 10,
  timelineSlackMs: 1500,
};

if (flag('--report')) {
  const work = resolve(arg('--report'));
  const lines = await verify(work);
  console.log(lines.join('\n'));
  process.exit(lines.at(-1) === 'RESULT: PASS' ? 0 : 1);
} else {
  await main();
}

async function main() {
  const helper = resolve(arg('--helper'));
  const work = resolve(arg('--work'));
  const smoke = flag('--smoke');
  const seconds = smoke ? 300 : Number(arg('--seconds', String(8 * 3600)));
  const sampleSeconds = Number(arg('--sample-seconds', smoke ? '15' : '60'));
  if (!(seconds >= 60)) throw new Error('--seconds must be at least 60');
  if (smoke && seconds > 300) throw new Error('smoke mode is 5 minutes at most');
  if (existsSync(join(work, 'audio'))) throw new Error(`${work} already holds a recording`);
  mkdirSync(join(work, 'logs'), { recursive: true });
  const stopFile = join(work, 'STOP');
  const logPath = join(work, 'run.log');
  const say = (line) => {
    const stamped = `${new Date().toISOString()} ${line}`;
    console.log(stamped);
    appendFileSync(logPath, `${stamped}\n`);
  };

  // The tone must outlast the run: the meeting track follows this one player process.
  const player = await startPlayer(work, seconds, say);
  await sleep(2000);
  const worker = spawn(helper, [], { stdio: ['pipe', 'pipe', 'pipe'] });
  const events = openSync(join(work, 'logs', 'events.jsonl'), 'a');
  const pending = new Map();
  let workerExit = null;
  let startedAt = null;
  const clock = () => (startedAt === null ? 0 : performance.now() - startedAt);
  worker.on('exit', (code, signal) => {
    workerExit = { code, signal, atMs: clock() };
    say(`HELPER EXITED ${JSON.stringify(workerExit)}`);
  });
  worker.stderr.on('data', (data) => say(`helper stderr: ${String(data).trim()}`));
  const counts = {};
  createInterface({ input: worker.stdout }).on('line', (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.type === 'ack') {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
      return;
    }
    counts[message.event] = (counts[message.event] ?? 0) + 1;
    if (
      message.event !== 'health' &&
      message.event !== 'chunkClosed' &&
      message.event !== 'trackHealth'
    ) {
      writeSync(events, `${JSON.stringify({ t: clock(), ...message })}\n`);
      say(`EVENT ${line}`);
    }
  });
  const send = (id, fields, limitMs = 15000) =>
    new Promise((done) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        done(null);
      }, limitMs);
      pending.set(id, (message) => {
        clearTimeout(timer);
        done(message);
      });
      worker.stdin.write(`${JSON.stringify({ id, ...fields })}\n`);
    });

  let stopRequested = false;
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      say(`${signal} received: stopping cleanly`);
      stopRequested = true;
    });
  }

  const opened = await send('o', {
    name: 'open',
    sessionId: 'long-run',
    outputDir: work,
    source: [player.pid],
    mic: 'default',
  });
  if (!opened || opened.ok === false) throw new Error(`open failed: ${JSON.stringify(opened)}`);
  const started = await send('s', { name: 'start' });
  if (!started || started.ok === false) throw new Error(`start failed: ${JSON.stringify(started)}`);
  startedAt = performance.now();
  const startWall = new Date();
  const finish = new Date(startWall.getTime() + seconds * 1000);
  say(`started; planned ${seconds} s; expected finish ${finish.toString()}`);

  const audio = join(work, 'audio');
  const count = (track) => {
    try {
      return readdirSync(join(audio, track)).filter((name) => name.endsWith('.opus')).length;
    } catch {
      return 0;
    }
  };
  const csv = join(work, 'logs', 'samples.csv');
  writeFileSync(
    csv,
    'elapsed_s,helper_rss_mb,helper_cpu_pct_core,helper_handles,driver_rss_mb,mic_chunks,meeting_chunks,disk_free_gb,work_mb,stalled\n',
  );
  const samples = [];
  let last = null;
  let lastChunks = null;
  let nextSample = 0;
  let stopReason = 'planned duration reached';
  while (clock() < seconds * 1000) {
    if (workerExit) {
      stopReason = 'HELPER EXITED EARLY';
      break;
    }
    if (stopRequested || existsSync(stopFile)) {
      stopReason = 'stopped early by the owner';
      break;
    }
    if (clock() >= nextSample) {
      nextSample += sampleSeconds * 1000;
      const atMs = clock();
      const usage = await processUsage(worker.pid);
      const chunks = TRACKS.map(count);
      const stalled = lastChunks ? TRACKS.filter((_, i) => chunks[i] === lastChunks[i]) : [];
      const cpu =
        last && usage
          ? (100 * (usage.cpuSeconds - last.cpuSeconds) * 1000) / (atMs - last.atMs)
          : 0;
      if (usage) last = { atMs, cpuSeconds: usage.cpuSeconds };
      lastChunks = chunks;
      let free = -1;
      try {
        const fs = statfsSync(work);
        free = (fs.bavail * fs.bsize) / 1e9;
      } catch {
        // free space is a convenience figure only
      }
      const sample = {
        atMs,
        rssMb: usage ? usage.rssBytes / 1048576 : NaN,
        cpu,
        handles: usage?.handles ?? NaN,
        cpuSeconds: usage?.cpuSeconds ?? NaN,
        chunks,
        stalled,
      };
      samples.push(sample);
      const driverMb = process.memoryUsage().rss / 1048576;
      appendFileSync(
        csv,
        `${(atMs / 1000).toFixed(0)},${sample.rssMb.toFixed(1)},${cpu.toFixed(2)},${sample.handles},${driverMb.toFixed(1)},${chunks[0]},${chunks[1]},${free.toFixed(1)},${(dirSize(work) / 1e6).toFixed(0)},${stalled.join('+')}\n`,
      );
      say(
        `${Math.round(atMs / 1000)} s chunks mic ${chunks[0]} meeting ${chunks[1]} helper ${sample.rssMb.toFixed(0)} MB ` +
          `${cpu.toFixed(1)}% of a core free ${free.toFixed(0)} GB ${stalled.length ? `STALLED ${stalled.join(' ')}` : 'ok'}`,
      );
    }
    await sleep(500);
  }
  say(`ending: ${stopReason}`);
  const stopped = workerExit ? null : await send('x', { name: 'stop' }, 60000);
  const stopMs = clock();
  if (!workerExit) {
    await Promise.race([new Promise((done) => worker.once('exit', done)), sleep(15000)]);
    if (!workerExit) worker.kill('SIGKILL');
  }
  player.kill();
  await sleep(500);
  const facts = {
    seconds,
    smoke,
    sampleSeconds,
    stopReason,
    stopAck: stopped,
    stopMs,
    startWall: startWall.toISOString(),
    platform: process.platform,
    node: process.version,
    eventCounts: counts,
    workerExit,
    samples,
  };
  writeFileSync(join(work, 'logs', 'run.json'), JSON.stringify(facts, null, 2));
  closeSync(events);
  if (stopFile && existsSync(stopFile)) rmSync(stopFile, { force: true });
  const report = await verify(work);
  writeFileSync(join(work, 'REPORT.txt'), `${report.join('\n')}\n`);
  say(`\n${report.join('\n')}`);
  say(`evidence folder: ${work}`);
  process.exit(report.at(-1) === 'RESULT: PASS' ? 0 : 1);
}

async function startPlayer(work, seconds, say) {
  const volume = process.env.SCRB_TEST_TONE_VOLUME;
  if (process.platform === 'darwin') {
    let file = arg('--tone-file', process.env.SCRB_TEST_TONE_FILE);
    if (!file) {
      // An 880 Hz tone, 8 kHz mono, longer than the run; afplay cannot loop, so make it long enough.
      file = join(work, 'tone.m4a');
      const wav = join(work, 'tone.wav');
      const rate = 8000;
      const second = Buffer.alloc(rate * 2);
      for (let i = 0; i < rate; i += 1)
        second.writeInt16LE(Math.round(9000 * Math.sin((2 * Math.PI * 880 * i) / rate)), i * 2);
      const total = seconds + 600;
      const header = Buffer.alloc(44);
      header.write('RIFF', 0);
      header.writeUInt32LE(36 + total * rate * 2, 4);
      header.write('WAVEfmt ', 8);
      header.writeUInt32LE(16, 16);
      header.writeUInt16LE(1, 20);
      header.writeUInt16LE(1, 22);
      header.writeUInt32LE(rate, 24);
      header.writeUInt32LE(rate * 2, 28);
      header.writeUInt16LE(2, 32);
      header.writeUInt16LE(16, 34);
      header.write('data', 36);
      header.writeUInt32LE(total * rate * 2, 40);
      const fd = openSync(wav, 'w');
      writeSync(fd, header);
      for (let s = 0; s < total; s += 1) writeSync(fd, second);
      closeSync(fd);
      const converted = await run('afconvert', ['-f', 'm4af', '-d', 'aac', wav, file]);
      rmSync(wav, { force: true });
      if (converted.error) throw new Error(`afconvert failed: ${converted.error.message}`);
    }
    say(`tone file ${file}`);
    return spawn('afplay', [...(volume ? ['-v', volume] : []), file], { stdio: 'ignore' });
  }
  const exe = resolve(arg('--tone-player'));
  say(`tone player ${exe}`);
  return spawn(exe, ['880', String(seconds + 600), '0'], { stdio: 'ignore' });
}

async function processUsage(pid) {
  if (process.platform === 'win32') {
    const { stdout } = await run('powershell.exe', [
      '-NoProfile',
      '-Command',
      `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p) { "$($p.TotalProcessorTime.TotalSeconds) $($p.WorkingSet64) $($p.HandleCount)" }`,
    ]);
    const [cpuSeconds, rssBytes, handles] = stdout.trim().split(' ').map(Number);
    return Number.isFinite(rssBytes) ? { cpuSeconds, rssBytes, handles } : null;
  }
  const { stdout } = await run('ps', ['-o', 'rss=,cputime=', '-p', String(pid)]);
  const [rss, cputime] = stdout.trim().split(/\s+/);
  if (!cputime) return null;
  const parts = cputime.split(':').map(Number);
  const cpuSeconds = parts.reduce((sum, part) => sum * 60 + part, 0);
  return { cpuSeconds, rssBytes: Number(rss) * 1024, handles: NaN };
}

function dirSize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    try {
      total += entry.isDirectory() ? dirSize(path) : statSync(path).size;
    } catch {
      // a chunk file may rename while it is measured
    }
  }
  return total;
}

/** Seals the audio (once), then checks it. Reads the saved copies, so it can be re-run later. */
async function verify(work) {
  const logs = join(work, 'logs');
  const audio = join(work, 'audio');
  const facts = JSON.parse(readFileSync(join(logs, 'run.json'), 'utf8'));
  for (const track of TRACKS) {
    const saved = join(logs, `${track}.chunks.json`);
    if (!existsSync(saved)) {
      const log = join(audio, track, 'chunks.log');
      if (existsSync(log)) writeFileSync(join(logs, `${track}.chunks.log`), readFileSync(log));
    }
  }
  if (!existsSync(join(logs, 'sealed.json'))) {
    const { sealAudio } = await import(
      pathToUrl(resolve(here, '..', '..', 'packages', 'app-core', 'src', 'recovery.ts'))
    );
    const sealed = await sealAudio(audio, async () => false);
    writeFileSync(join(logs, 'sealed.json'), JSON.stringify(sealed));
    for (const track of TRACKS) {
      const left = readdirSync(join(audio, track)).filter((name) => /\.(part|tmp)$/.test(name));
      const damaged = existsSync(join(audio, track, 'damaged'))
        ? readdirSync(join(audio, track, 'damaged'))
        : [];
      facts[`${track}Left`] = left;
      facts[`${track}Damaged`] = damaged;
    }
    writeFileSync(join(logs, 'run.json'), JSON.stringify(facts, null, 2));
  }
  const sealed = JSON.parse(readFileSync(join(logs, 'sealed.json'), 'utf8'));
  const out = [];
  const results = [];
  const check = (name, passed, detail) => {
    results.push(passed);
    out.push(`${passed ? 'PASS' : 'FAIL'}  ${name}: ${detail}`);
  };
  const ms = (ns) => ns / 1e6;
  const s = (ns) => (ns / 1e9).toFixed(3);

  out.push(
    `run: ${facts.platform}, planned ${facts.seconds} s${facts.smoke ? ' (SMOKE, not Gate 8 evidence)' : ''}, ` +
      `ended: ${facts.stopReason}, started ${facts.startWall}`,
  );
  out.push(
    `recovery outcome ${sealed.outcome}, timeline ${s(sealed.endNs)} s, helper events ${JSON.stringify(facts.eventCounts)}`,
  );
  check(
    'helper ran to a clean stop',
    !facts.workerExit?.code &&
      facts.stopReason !== 'HELPER EXITED EARLY' &&
      facts.stopAck?.ok !== false,
    `${facts.stopReason}; exit ${JSON.stringify(facts.workerExit)}`,
  );
  const wanted =
    facts.stopReason === 'stopped early by the owner' ? facts.stopMs / 1000 : facts.seconds;
  check(
    'timeline covers the run',
    Math.abs(ms(sealed.endNs) - wanted * 1000) <= LIMITS.timelineSlackMs + 3000,
    `timeline ${s(sealed.endNs)} s against ${wanted.toFixed(1)} s of wall time`,
  );

  const perTrack = {};
  for (const track of TRACKS) {
    const chunks = sealed.tracks[track]?.chunks ?? [];
    const logged = chunks.length;
    const broken = chunks.filter((chunk, i) => chunk.seq !== i).length;
    const left = (facts[`${track}Left`] ?? []).length;
    const damaged = (facts[`${track}Damaged`] ?? []).length;
    const recovered = chunks.filter((chunk) => chunk.state !== 'complete').length;
    check(
      `${track} chunk continuity`,
      logged > 0 && broken === 0 && left === 0 && damaged === 0 && recovered === 0,
      `${logged} chunks, ${broken} numbering breaks, ${left} .part/.tmp left, ${damaged} damaged, ${recovered} recovered after a crash`,
    );
    const marked = sealed.gaps.filter((gap) => gap.track === track || gap.track === 'both');
    let unmarked = 0;
    let overlaps = 0;
    let lossNs = 0;
    let longest = 0;
    for (let i = 0; i < chunks.length; i += 1) {
      const from = i === 0 ? 0 : chunks[i - 1].endNs;
      if (i === 0 && chunks[0].startNs < 100e6) continue;
      const gap = chunks[i].startNs - from;
      if (gap < 0) overlaps += 1;
      if (gap <= 0) continue;
      lossNs += gap;
      longest = Math.max(longest, gap);
      if (gap >= 2e6 && !marked.some((span) => span.startNs === from)) unmarked += 1;
    }
    const audioNs = chunks.reduce((sum, chunk) => sum + chunk.endNs - chunk.startNs, 0);
    perTrack[track] = { chunks, audioNs, lossNs };
    check(
      `${track} no lost audio`,
      lossNs === 0 &&
        unmarked === 0 &&
        marked.length === 0 &&
        sealed.endNs - audioNs <= LIMITS.timelineSlackMs * 1e6,
      `gaps total ${s(lossNs)} s, longest ${s(longest)} s, ${marked.length} marked, ${unmarked} unmarked, ${overlaps} overlaps; ` +
        `audio ${s(audioNs)} s of ${s(sealed.endNs)} s (difference ${s(sealed.endNs - audioNs)} s)`,
    );
  }

  // Drift: between consecutive chunks with no gap on either track, the change in (mic start - meeting start)
  // is clock drift. Sum those changes along the run and take the worst change within any 4 hours.
  const pairs = [];
  const { microphone, meeting } = {
    microphone: perTrack.microphone.chunks,
    meeting: perTrack.meeting.chunks,
  };
  let j = 0;
  let previous = null;
  let cumulative = 0;
  for (let i = 0; i < microphone.length && meeting.length; i += 1) {
    while (
      j + 1 < meeting.length &&
      Math.abs(meeting[j + 1].startNs - microphone[i].startNs) <
        Math.abs(meeting[j].startNs - microphone[i].startNs)
    )
      j += 1;
    const difference = ms(microphone[i].startNs - meeting[j].startNs);
    const plain = (chunk, before) =>
      chunk.openReason === 'rollover' && before && Math.abs(chunk.startNs - before.endNs) <= 12e6;
    if (
      previous &&
      previous.i === i - 1 &&
      previous.j === j - 1 &&
      plain(microphone[i], microphone[i - 1]) &&
      plain(meeting[j], meeting[j - 1])
    ) {
      cumulative += difference - previous.difference;
      pairs.push({ hours: microphone[i].startNs / 3.6e12, cumulative });
    }
    previous = { i, j, difference };
  }
  let worst = 0;
  let low = 0;
  for (let high = 0; high < pairs.length; high += 1) {
    while (pairs[high].hours - pairs[low].hours > LIMITS.driftWindowHours) low += 1;
    for (let k = low; k < high; k += 1)
      worst = Math.max(worst, Math.abs(pairs[high].cumulative - pairs[k].cumulative));
  }
  const spanHours = pairs.length ? pairs.at(-1).hours - pairs[0].hours : 0;
  const total = pairs.length ? pairs.at(-1).cumulative : 0;
  check(
    `drift between tracks under ${LIMITS.driftMs} ms in any ${LIMITS.driftWindowHours} h`,
    pairs.length > 0 && worst < LIMITS.driftMs,
    `worst ${worst.toFixed(2)} ms in a ${LIMITS.driftWindowHours} h window, ${total.toFixed(2)} ms over the whole run ` +
      `(${spanHours > 0 ? (total / spanHours).toFixed(2) : 'n/a'} ms per hour), ${pairs.length} rollover steps. Track timelines, not a shared sound`,
  );

  const samples = facts.samples.filter((sample) => Number.isFinite(sample.rssMb));
  const stalledSamples = facts.samples.filter((sample) => sample.stalled.length).length;
  check(
    'no stalled minute',
    stalledSamples === 0,
    `${stalledSamples} samples where a track's chunk count did not grow`,
  );
  if (samples.length >= 3) {
    const baseline =
      samples.find((sample) => sample.atMs >= facts.seconds * 1000 * 0.1) ?? samples[0];
    const final = samples.at(-1);
    const peak = Math.max(...samples.map((sample) => sample.rssMb));
    const growth = final.rssMb - baseline.rssMb;
    const limit = Math.max(
      LIMITS.helperGrowthMb,
      (baseline.rssMb * LIMITS.helperGrowthPercent) / 100,
    );
    check(
      'memory bounded (helper)',
      peak < LIMITS.helperPeakMb && growth <= limit,
      `peak ${peak.toFixed(1)} MB (limit ${LIMITS.helperPeakMb}), ${baseline.rssMb.toFixed(1)} MB at ${(baseline.atMs / 3.6e6).toFixed(2)} h, ` +
        `${final.rssMb.toFixed(1)} MB at the end, growth ${growth.toFixed(1)} MB (limit ${limit.toFixed(1)}). ` +
        `The 6 GB whole-app budget is measured by the app run, not here`,
    );
    const average = (final.cpuSeconds * 100000) / final.atMs;
    check(
      `CPU average under ${LIMITS.cpuAveragePercentOfCore}% (helper, recording only)`,
      average < LIMITS.cpuAveragePercentOfCore,
      `${average.toFixed(2)}% of one core, highest sample ${Math.max(...samples.map((sample) => sample.cpu)).toFixed(2)}%`,
    );
  } else {
    check('memory bounded (helper)', false, `only ${samples.length} samples`);
  }
  out.push('final pass: not applicable (recorder only, no transcription)');
  out.push(results.every(Boolean) ? 'RESULT: PASS' : 'RESULT: FAIL');
  return out;
}

function pathToUrl(path) {
  return new URL(`file://${path.startsWith('/') ? '' : '/'}${path.replace(/\\/g, '/')}`).href;
}
