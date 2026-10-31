// Gate 2 long run, based on native/macos-capture/scripts/long_run.py: a tone target with output
// muted and the default mic through the real helper, with timed pauses, one hand-made device change
// and CPU load. Ends by force-killing the worker, then runs the real sealAudio and reports against
// the limits. Prints a line a minute, so a silent failure shows at once.
//
// The worker is never restarted in the same recording: a restarted worker's clock starts at 0.
// Output goes outside the repo, because the mic may capture the room.
//
// Usage: node long_run.mjs [--rehearse] [--input <part of the second mic's name>]
//        node long_run.mjs --analyse <work dir>
import { execFile, spawn, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { cpus, constants, setPriority } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread } from 'node:worker_threads';

const script = fileURLToPath(import.meta.url);
const root = resolve(dirname(script), '..');
const repo = resolve(root, '..', '..');
const helper = join(root, 'build', 'bin', 'scrb-capture.exe');
const verify = join(root, 'build', 'bin', 'ChunkVerify.exe');
const mute = join(repo, 'phase0', 'probes', 'windows-mute', 'Mute.exe');
const tone = join(repo, 'phase0', 'probes', 'windows-tone-player', 'TonePlayer.exe');
const TRACKS = ['microphone', 'meeting'];
const PACKET_MS = 10; // owner decision: a chunk may end one packet past the cutoff

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const run = (file, args) =>
  new Promise((done) => {
    execFile(file, args, { encoding: 'utf8' }, (error, stdout) => done({ error, stdout }));
  });

// One process of spinning threads, so the priority class covers them all and it can be stopped.
if (process.argv[2] === '--burn') {
  if (isMainThread) {
    const count = Number(process.argv[3]);
    for (let i = 0; i < count; i += 1) new Worker(script, { argv: ['--burn', '0'] });
    process.stdin.on('end', () => process.exit(0));
    process.stdin.resume();
  } else {
    for (let x = 0; ; x += 1) Math.sqrt(x);
  }
} else if (process.argv[2] === '--analyse') {
  console.log(analyse(resolve(process.argv[3])).join('\n'));
} else {
  await main();
}

async function main() {
  const rehearse = process.argv.includes('--rehearse');
  const inputAt = process.argv.indexOf('--input');
  const inputName = inputAt > 0 ? process.argv[inputAt + 1] : '';
  const plan = rehearse
    ? { seconds: 180, every: 50, length: 5, pauses: 2, window: 90 }
    : { seconds: 4 * 3600, every: 40 * 60, length: 30, pauses: 5, window: 8 * 60 };
  const work = join(process.env.LOCALAPPDATA, 'scrb-long-run', rehearse ? 'rehearsal' : 'full');
  if (existsSync(join(work, 'audio'))) throw new Error(`${work} already holds a recording`);
  mkdirSync(join(work, 'logs'), { recursive: true });
  const logPath = join(work, 'run.log');
  const say = (line) => {
    console.log(line);
    appendFileSync(logPath, `${line}\n`);
  };

  const burners = Math.floor(cpus().length / 2);
  const facts = {
    plan,
    logicalCores: cpus().length,
    load: `CPU fallback: ${burners} spinning threads of ${cpus().length} logical cores at below-normal priority`,
    acks: { pause: [], resume: [] },
    samples: [],
    eventCounts: {},
    deviceNames: [],
  };
  say(`work ${work}`);
  say(`load ${facts.load}`);

  const wasMuted = /muted=1/.test((await run(mute, ['status'])).stdout);
  await run(mute, ['on']);
  // Longer than the run, so the tone never ends first.
  const player = spawn(tone, ['880', String(plan.seconds + 600), '0'], { stdio: 'ignore' });
  const load = spawn(process.execPath, [script, '--burn', String(burners)], {
    stdio: ['pipe', 'ignore', 'ignore'],
  });
  setPriority(load.pid, constants.priority.PRIORITY_BELOW_NORMAL);
  await sleep(1000);

  const worker = spawn(helper, [], { stdio: ['pipe', 'pipe', 'pipe'] });
  const events = createWriteStream(join(work, 'logs', 'events.jsonl'));
  const pending = new Map();
  const latest = {};
  let startedAt = null;
  let workerExit = null;
  const clock = () => (startedAt === null ? null : performance.now() - startedAt);
  worker.on('exit', (code) => {
    workerExit = { code, atMs: clock() };
  });
  worker.stderr.on('data', (data) => say(`helper stderr: ${String(data).trim()}`));
  createInterface({ input: worker.stdout }).on('line', (line) => {
    const message = JSON.parse(line);
    events.write(`${JSON.stringify({ t: clock(), ...message })}\n`);
    if (message.type === 'ack') {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
      return;
    }
    const name = message.event;
    facts.eventCounts[name] = (facts.eventCounts[name] ?? 0) + 1;
    if (name === 'trackHealth') {
      latest[message.track] = message;
      if (!facts.deviceNames.includes(message.device)) facts.deviceNames.push(message.device);
    } else if (name !== 'health' && name !== 'chunkClosed') {
      say(`EVENT ${line}`);
    }
  });
  const send = (id, fields, limitMs = 5000) =>
    new Promise((done) => {
      const before = performance.now();
      const timer = setTimeout(() => {
        pending.delete(id);
        done(null);
      }, limitMs);
      pending.set(id, (message) => {
        clearTimeout(timer);
        done({ message, ms: performance.now() - before });
      });
      worker.stdin.write(`${JSON.stringify({ id, ...fields })}\n`);
    });

  const stopHelpers = async () => {
    load.stdin.end();
    spawnSync('taskkill', ['/PID', String(player.pid), '/T', '/F'], { stdio: 'ignore' });
    if (!wasMuted) await run(mute, ['off']);
  };

  await sleep(500);
  const mics = (await send('m', { name: 'listMics' }))?.message.mics ?? [];
  const first = mics.find((mic) => mic.isSystemDefault);
  const second = mics.find(
    (mic) => mic !== first && mic.name.toLowerCase().includes(inputName.toLowerCase()),
  );
  say(`inputs: ${mics.map((mic) => mic.name + (mic === first ? ' (default)' : '')).join('; ')}`);
  if (!rehearse && !second) {
    say('STOPPED: there is no second input for the device change');
    worker.stdin.end();
    await stopHelpers();
    process.exit(2);
  }
  facts.inputs = { first: first?.name, second: second?.name ?? null };

  const opened = await send('o', {
    name: 'open',
    sessionId: 'long-run',
    outputDir: work,
    source: [player.pid],
    mic: 'default',
  });
  if (!opened?.message.ok) throw new Error(`open failed: ${JSON.stringify(opened?.message)}`);

  const startFile = join(work, 'started.txt');
  const steps = rehearse
    ? ['60=Rehearsal only: change nothing']
    : [
        `300=Settings, System, Sound, Input: choose ${second.name}`,
        `420=Settings, System, Sound, Input: choose ${first.name}`,
      ];
  const quoted = steps.map((step) => `'${step.replace(/'/g, "''")}'`).join(',');
  const call =
    `& '${join(root, 'scripts', 'countdown.ps1')}' -Case 'long run' -StartFile '${startFile}' ` +
    `-Seconds ${plan.window} -Actions @(${quoted})`;
  const countdown = spawn(
    'powershell.exe',
    ['-NoProfile', '-Sta', '-EncodedCommand', Buffer.from(call, 'utf16le').toString('base64')],
    { stdio: 'ignore' },
  );
  let windowClosed = false;
  countdown.on('exit', () => {
    windowClosed = true;
  });
  if (!rehearse) spawn('cmd.exe', ['/c', 'start', '', 'ms-settings:sound'], { stdio: 'ignore' });
  say('waiting for the Start button');
  while (!existsSync(startFile)) {
    if (windowClosed) {
      say('STOPPED: the countdown window closed before Start');
      worker.stdin.end();
      await stopHelpers();
      process.exit(2);
    }
    await sleep(50);
  }

  const started = await send('s', { name: 'start' });
  startedAt = performance.now();
  if (started?.message.gate !== 'open') throw new Error('start left the gate closed');
  facts.startWallUtc = started.message.origin?.wallUtc;
  say(`started ${new Date().toLocaleTimeString()}, ends in ${plan.seconds} s`);

  const count = (track) =>
    readdirSync(join(work, 'audio', track)).filter((name) => name.endsWith('.opus')).length;
  let paused = false;
  let pausing = async () => {
    for (let n = 1; n <= plan.pauses; n += 1) {
      while (clock() < n * plan.every * 1000) {
        if (workerExit) return;
        await sleep(20);
      }
      const pause = await send(`p${n}`, { name: 'pause' });
      paused = true;
      facts.acks.pause.push(pause?.ms ?? null);
      say(`pause ${n}: ack ${pause?.ms.toFixed(2) ?? 'NONE'} ms, gate ${pause?.message.gate}, at ${pause?.message.atNs} ns`);
      await sleep(plan.length * 1000);
      const again = await send(`r${n}`, { name: 'resume' });
      paused = false;
      facts.acks.resume.push(again?.ms ?? null);
      say(`resume ${n}: ack ${again?.ms.toFixed(2) ?? 'NONE'} ms, gate ${again?.message.gate}, at ${again?.message.atNs} ns`);
    }
  };
  pausing = pausing();

  let lastCounts = null;
  let lastCpu = null;
  let lastTimes = cpus().map((cpu) => cpu.times);
  let nextLine = 0;
  while (clock() < plan.seconds * 1000 && !workerExit) {
    if (clock() >= nextLine) {
      const atMs = clock();
      nextLine += 60_000;
      const counts = TRACKS.map(count);
      const stalled = lastCounts && !paused ? TRACKS.filter((_, i) => counts[i] === lastCounts[i]) : [];
      const { stdout } = await run('powershell.exe', [
        '-NoProfile',
        '-Command',
        `$p = Get-Process -Id ${worker.pid}; "$($p.TotalProcessorTime.TotalSeconds) $($p.WorkingSet64) $($p.PrivateMemorySize64) $($p.HandleCount)"`,
      ]);
      const [cpuSeconds, workingSet, privateBytes, handles] = stdout.trim().split(' ').map(Number);
      const times = cpus().map((cpu) => cpu.times);
      let busy = 0;
      let all = 0;
      times.forEach((now, i) => {
        const before = lastTimes[i];
        const idle = now.idle - before.idle;
        const total = Object.keys(now).reduce((sum, key) => sum + now[key] - before[key], 0);
        busy += total - idle;
        all += total;
      });
      lastTimes = times;
      const helperPercent = lastCpu ? (100 * (cpuSeconds - lastCpu.cpuSeconds) * 1000) / (atMs - lastCpu.atMs) : 0;
      lastCpu = { cpuSeconds, atMs };
      const systemPercent = all ? (100 * busy) / all : 0;
      facts.samples.push({ atMs, cpuSeconds, helperPercent, systemPercent, workingSet, privateBytes, handles });
      const missing = TRACKS.map((track) => latest[track]?.missingMs ?? 0);
      say(
        `${new Date().toLocaleTimeString()} ${Math.round(atMs / 1000)} s ` +
          `chunks mic ${counts[0]} meeting ${counts[1]}, missing ${missing[0]}/${missing[1]} ms, ` +
          `helper ${helperPercent.toFixed(1)}% of a core, ${(workingSet / 1048576).toFixed(0)} MB, ` +
          `system ${systemPercent.toFixed(0)}%, mic ${latest.microphone?.device ?? '?'} ` +
          (paused ? 'PAUSED' : stalled.length ? `STALLED ${stalled.join(' ')}` : 'ok'),
      );
      lastCounts = counts;
    }
    await sleep(100);
  }

  const audio = join(work, 'audio');
  const lock = join(audio, 'writer.lock');
  const held = () => spawnSync(helper, ['check-lock', lock]).status === 3;
  facts.lockHeldBeforeKill = held();
  await pausing;
  facts.killMs = clock();
  facts.workerExit = workerExit;
  worker.kill('SIGKILL');
  while (!workerExit && worker.exitCode === null && worker.signalCode === null) await sleep(10);
  await sleep(100);
  facts.lockHeldAfterKill = held();
  say(`force-killed at ${(facts.killMs / 1000).toFixed(3)} s`);
  await stopHelpers();
  await new Promise((done) => events.end(done));

  // sealAudio removes chunks.log, and the audio is deleted later, so the numbers need these copies.
  for (const track of TRACKS) {
    copyFileSync(join(audio, track, 'chunks.log'), join(work, 'logs', `${track}.chunks.log`));
    facts[`${track}PartsBefore`] = readdirSync(join(audio, track)).filter((name) => name.endsWith('.part'));
  }
  copyFileSync(join(audio, 'session.log'), join(work, 'logs', 'session.log'));
  const verified = await run(verify, [work]);
  facts.verify = verified.stdout.trim().split(/\r?\n/);
  say(facts.verify.join('\n'));

  const { sealAudio } = await import('../../../packages/app-core/src/recovery.ts');
  const sealed = await sealAudio(audio, async () => held());
  const repeat = await sealAudio(audio, async () => held());
  facts.outcome = sealed.outcome;
  facts.repeatMatches = JSON.stringify(repeat.gaps) === JSON.stringify(sealed.gaps);
  facts.lastChunks = {};
  for (const track of TRACKS) {
    const folder = join(audio, track);
    copyFileSync(join(folder, 'chunks.json'), join(work, 'logs', `${track}.chunks.json`));
    facts[`${track}Left`] = readdirSync(folder).filter((name) => /\.(part|tmp)$/.test(name));
    facts[`${track}Damaged`] = existsSync(join(folder, 'damaged')) ? readdirSync(join(folder, 'damaged')) : [];
    const last = sealed.tracks[track]?.chunks.at(-1);
    const levels = await run(verify, ['--levels', join(folder, last.file), '880']);
    facts.lastChunks[track] = { file: last.file, state: last.state, levels: levels.stdout.trim() };
  }
  writeFileSync(join(work, 'logs', 'run.json'), JSON.stringify(facts, null, 2));
  const report = analyse(work);
  writeFileSync(join(work, 'logs', 'report.txt'), `${report.join('\n')}\n`);
  say(report.join('\n'));
  say('RUN FINISHED');
  process.exit(0);
}

function percentile(values, share) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(Math.ceil(sorted.length * share) - 1, sorted.length - 1)];
}

/** Everything here reads the copies in logs/, so it still works after the audio is deleted. */
function analyse(work) {
  const logs = join(work, 'logs');
  const facts = JSON.parse(readFileSync(join(logs, 'run.json'), 'utf8'));
  const lines = (file) =>
    readFileSync(join(logs, file), 'utf8')
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
  const out = [];
  const results = [];
  const limit = (name, passed, detail) => {
    results.push(passed);
    out.push(`${passed ? 'PASS' : 'FAIL'}  ${name}: ${detail}`);
  };
  const s = (ns) => (ns / 1e9).toFixed(3);

  const session = lines('session.log');
  const spans = [];
  for (const event of session) {
    if (event.event === 'pause') spans.push({ startNs: event.atNs, endNs: null });
    if (event.event === 'resume') spans.at(-1).endNs = event.atNs;
  }
  const pausedNs = spans.reduce((sum, span) => sum + span.endNs - span.startNs, 0);
  const tracks = Object.fromEntries(
    TRACKS.map((track) => {
      const sealed = JSON.parse(readFileSync(join(logs, `${track}.chunks.json`), 'utf8'));
      const logged = new Map(lines(`${track}.chunks.log`).map((chunk) => [chunk.file, chunk]));
      return [track, { sealed, logged, chunks: sealed.chunks }];
    }),
  );
  const endNs = Math.max(...TRACKS.map((track) => tracks[track].sealed.endNs));

  out.push(`inputs ${JSON.stringify(facts.inputs)}; devices seen ${facts.deviceNames.join('; ')}`);
  out.push(`load ${facts.load}`);
  out.push(`events ${JSON.stringify(facts.eventCounts)}`);
  out.push(`recovery outcome ${facts.outcome}, repeat gives the same spans: ${facts.repeatMatches}`);
  out.push(`lock held before kill ${facts.lockHeldBeforeKill}, after kill ${facts.lockHeldAfterKill}`);
  out.push(`last chunks ${JSON.stringify(facts.lastChunks)}`);
  for (const line of facts.verify) out.push(`verify ${line}`);
  if (facts.workerExit) limit('worker alive until the kill', false, JSON.stringify(facts.workerExit));

  for (const track of TRACKS) {
    const { chunks } = tracks[track];
    const broken = chunks.filter((chunk, i) => chunk.seq !== i).length;
    const left = facts[`${track}Left`].length;
    const damaged = facts[`${track}Damaged`].length;
    limit(
      `${track} chunks`,
      broken === 0 && left === 0 && damaged === 0,
      `${chunks.length} chunks, ${broken} numbering breaks, ${left} .part or .tmp left, ` +
        `${damaged} damaged, ${facts[`${track}PartsBefore`].length} .part repaired`,
    );
  }

  for (const track of TRACKS) {
    const { chunks, sealed, logged } = tracks[track];
    const marked = sealed.gaps.filter((gap) => gap.kind !== 'paused');
    let unmarked = 0;
    let overlaps = 0;
    let worstOverlapNs = 0;
    let lossNs = 0;
    let longestNs = 0;
    let subMarkNs = 0;
    const byCause = {};
    const byTransport = {};
    for (let i = 1; i < chunks.length; i += 1) {
      const startNs = chunks[i - 1].endNs;
      const gapNs = chunks[i].startNs - startNs;
      if (gapNs < 0) overlaps += 1;
      worstOverlapNs = Math.max(worstOverlapNs, -gapNs);
      if (gapNs <= 0) continue;
      const inPause = spans.some(
        (span) => Math.abs(span.startNs - startNs) <= 100e6 && Math.abs(span.endNs - chunks[i].startNs) <= 100e6,
      );
      if (inPause) continue;
      lossNs += gapNs;
      longestNs = Math.max(longestNs, gapNs);
      const info = logged.get(chunks[i].file);
      const cause = info?.missingCause || 'none given';
      byCause[cause] = (byCause[cause] ?? 0) + gapNs;
      const transport = info?.transport ?? 'unknown';
      byTransport[transport] = (byTransport[transport] ?? 0) + gapNs;
      if (gapNs < 2e6) subMarkNs += gapNs;
      else if (!marked.some((gap) => gap.startNs === startNs)) unmarked += 1;
    }
    const audioNs = chunks.reduce((sum, chunk) => sum + chunk.endNs - chunk.startNs, 0);
    const show = (map) => Object.entries(map).map(([key, ns]) => `${key} ${s(ns)} s`).join(', ') || 'none';
    limit(`${track} every gap marked`, unmarked === 0, `${marked.length} marked, ${unmarked} unmarked, ${overlaps} overlaps, largest ${(worstOverlapNs / 1e6).toFixed(3)} ms`);
    out.push(
      `      ${track} audio ${s(audioNs)} s of timeline minus pauses ${s(endNs - pausedNs)} s ` +
        `(difference ${s(endNs - pausedNs - audioNs)} s); gaps ${s(lossNs)} s, longest ${s(longestNs)} s, ` +
        `under the 2 ms mark ${s(subMarkNs)} s; by cause: ${show(byCause)}; by device type: ${show(byTransport)}`,
    );
    if (track === 'microphone') limit('mic loss at most 15 s, paused time not counted', lossNs <= 15e9, `${s(lossNs)} s`);
    else out.push(`      meeting loss ${s(lossNs)} s (no limit of its own)`);
  }

  // Any gap ends a chunk early and moves that track's start grid, so the size of the difference
  // between starts says nothing. Only its change across plain rollovers on both tracks is drift.
  // The stretch between the first and last device change has too few such steps to follow.
  const plain = (chunk) =>
    chunk.openReason === 'rollover' && !(chunk.missingBeforeMs > 0) && !(chunk.overlapMs > 0);
  const moves = tracks.microphone.chunks.filter((chunk) => chunk.openReason === 'device');
  const stretches = moves.length
    ? [[0, moves[0].startNs], [moves.at(-1).startNs, Infinity]]
    : [[0, Infinity]];
  let worst = 0;
  let steps = 0;
  for (const [from, to] of stretches) {
    const within = (chunk) => chunk.startNs >= from && chunk.startNs < to;
    const mic = tracks.microphone.chunks.filter(within).map((c) => ({ ...c, ...tracks.microphone.logged.get(c.file) }));
    const meeting = tracks.meeting.chunks.filter(within).map((c) => ({ ...c, ...tracks.meeting.logged.get(c.file) }));
    let j = 0;
    let previous = null;
    let drift = 0;
    for (let i = 0; i < mic.length && meeting.length; i += 1) {
      while (j + 1 < meeting.length && Math.abs(meeting[j + 1].startNs - mic[i].startNs) < Math.abs(meeting[j].startNs - mic[i].startNs)) j += 1;
      const difference = (mic[i].startNs - meeting[j].startNs) / 1e6;
      if (previous?.i === i - 1 && previous.j === j - 1 && plain(mic[i]) && plain(meeting[j])) {
        drift += difference - previous.difference;
        worst = Math.max(worst, Math.abs(drift));
        steps += 1;
      }
      previous = { i, j, difference };
    }
  }
  limit(
    'worst offset between tracks under 50 ms',
    worst < 50,
    `${worst.toFixed(2)} ms drift over ${steps} plain rollover steps ` +
      '(track timelines, not a shared sound: output was muted; not measured on the headset)',
  );

  const acks = facts.acks.pause.filter((ms) => ms !== null);
  limit(
    'pause ack 99th percentile under 200 ms',
    acks.length === facts.plan.pauses && percentile(acks, 0.99) < 200,
    `${percentile(acks, 0.99).toFixed(2)} ms from ${acks.length} pauses (with 5 samples this is the slowest); ` +
      `all ${acks.map((ms) => ms.toFixed(2)).join(', ')}; resume ${facts.acks.resume.map((ms) => ms?.toFixed(2)).join(', ')}`,
  );

  let crossing = 0;
  let furthestMs = 0;
  for (const track of TRACKS) {
    for (const chunk of tracks[track].chunks) {
      for (const span of spans) {
        if (chunk.startNs >= span.endNs) continue;
        if (chunk.startNs >= span.startNs) crossing += 1;
        const pastMs = (chunk.endNs - span.startNs) / 1e6;
        if (chunk.startNs < span.startNs && pastMs > 0) {
          furthestMs = Math.max(furthestMs, pastMs);
          if (pastMs > PACKET_MS) crossing += 1;
        }
      }
    }
  }
  limit(
    'privacy: no chunk crosses a pause',
    crossing === 0 && spans.length === facts.plan.pauses,
    `${crossing} crossing, furthest ${furthestMs.toFixed(3)} ms past a cutoff (one ${PACKET_MS} ms packet allowed), ` +
      `${spans.length} pauses, ${(pausedNs / 1e9).toFixed(3)} s paused`,
  );

  const lost = TRACKS.map((track) => `${track} ${(facts.killMs - tracks[track].sealed.endNs / 1e6).toFixed(0)} ms`);
  const worstLost = Math.max(...TRACKS.map((track) => facts.killMs - tracks[track].sealed.endNs / 1e6));
  limit('audio lost at the kill, about 1 s or less', worstLost <= 1100, lost.join(', '));

  const samples = facts.samples.slice(1);
  const lastSample = facts.samples.at(-1);
  const average = (lastSample.cpuSeconds * 100000) / lastSample.atMs;
  const hour = samples.filter((sample) => sample.atMs >= 3600e3)[0] ?? samples[0];
  out.push(
    `helper CPU average ${average.toFixed(2)}% of one core (${(average / facts.logicalCores).toFixed(2)}% of the machine), ` +
      `highest minute ${Math.max(...samples.map((sample) => sample.helperPercent)).toFixed(2)}%; ` +
      `system average ${(samples.reduce((sum, sample) => sum + sample.systemPercent, 0) / samples.length).toFixed(1)}%`,
  );
  const mb = (bytes) => (bytes / 1048576).toFixed(1);
  out.push(
    `helper memory peak working set ${mb(Math.max(...samples.map((sample) => sample.workingSet)))} MB, ` +
      `private ${mb(hour.privateBytes)} MB at hour 1, ${mb(lastSample.privateBytes)} MB at the end; ` +
      `handles ${hour.handles} then ${lastSample.handles}`,
  );
  out.push(results.every(Boolean) ? 'ALL LIMITS MET' : 'LIMITS FAILED');
  return out;
}
