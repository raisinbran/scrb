// Real worker test of the app's restart limit, through RecordingSession and ProcessAdapter. Play a
// sound throughout, or the whole-computer track has no chunks. Run under run-muted.sh.
// Usage: node --experimental-transform-types three_kill_case.mjs <helper> <work dir> [lock]
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProcessAdapter } from '../../../packages/capture/src/process-adapter.ts';
import { RecordingSession } from '../../../packages/app-core/src/recording.ts';
import { sealAudio } from '../../../packages/app-core/src/recovery.ts';

const [helper, work, only] = process.argv.slice(2);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function session(dir, onLaunch = () => undefined) {
  mkdirSync(dir, { recursive: true });
  let id = 0;
  const log = { launches: 0, states: [], missing: [], ended: null, endedAt: 0 };
  let adapter = null;
  let ended;
  const finished = new Promise((resolve) => (ended = resolve));
  const recording = new RecordingSession({
    launch: () => {
      log.launches += 1;
      onLaunch(log.launches);
      adapter = new ProcessAdapter(helper);
      return adapter;
    },
    onStateChanged: (status) => log.states.push(status),
    onTrackMissing: (track) => log.missing.push(track),
    onEnded: (end) => {
      log.ended = end;
      log.endedAt = Date.now();
      ended(end);
    },
    newCommandId: () => `c${(id += 1)}`,
  });
  const open = {
    name: 'open',
    sessionId: 's',
    outputDir: dir,
    source: 'wholeComputer',
    mic: 'default',
  };
  return { recording, open, log, finished, kill: () => adapter.kill() };
}

async function report(dir, log) {
  const audio = join(dir, 'audio');
  const sealed = await sealAudio(audio, async () => false);
  console.log(
    'launches',
    log.launches,
    'ended',
    log.ended,
    'missing',
    log.missing.join(',') || 'none',
  );
  for (const [track, { chunks }] of Object.entries(sealed.tracks)) {
    const seqs = chunks.map(({ file }) => Number.parseInt(file, 10));
    const reasons = chunks.filter(({ openReason }) => openReason === 'workerRestarted').length;
    const states = {};
    for (const { state } of chunks) states[state] = (states[state] ?? 0) + 1;
    const unique = new Set(seqs).size === seqs.length;
    console.log(
      track,
      'chunks',
      chunks.length,
      'restart chunks',
      reasons,
      'unique',
      unique,
      JSON.stringify(states),
    );
  }
  console.log('outcome', sealed.outcome, 'end ms', Math.round(sealed.endNs / 1e6));
  for (const gap of sealed.gaps) {
    console.log(
      ' gap',
      gap.kind,
      gap.track,
      Math.round(gap.startNs / 1e6),
      Math.round(gap.endNs / 1e6),
    );
  }
  const events = readFileSync(join(audio, 'session.log'), 'utf8').trim().split('\n');
  console.log(
    ' session.log',
    events
      .map((line) => {
        try {
          return JSON.parse(line).event;
        } catch {
          return 'cut';
        }
      })
      .join(' '),
  );
}

console.log('=== four kills: recording, paused, recording, then past the limit');
if (only !== 'lock') {
  const dir = join(work, 'kills');
  const run = session(dir);
  await run.recording.start(run.open);
  await sleep(6000);
  run.kill();
  await sleep(6000);
  console.log('after kill 1', run.recording.state.status, 'launches', run.log.launches);
  await run.recording.pause();
  await sleep(1000);
  run.kill();
  await sleep(3000);
  console.log('after kill 2', run.recording.state.status, 'launches', run.log.launches);
  await run.recording.resume();
  await sleep(6000);
  console.log('after resume', run.recording.state.status);
  run.kill();
  await sleep(6000);
  console.log('after kill 3', run.recording.state.status, 'launches', run.log.launches);
  const killedAt = Date.now();
  run.kill();
  await Promise.race([run.finished, sleep(10_000)]);
  console.log('kill 4 ended in', run.log.endedAt - killedAt, 'ms');
  await sleep(300);
  await report(dir, run.log);
}

console.log('=== brief fault: writer lock held 3 s after a kill');
{
  const dir = join(work, 'lock');
  // The child keeps the flock after the parent exits, so the lock is held before launch returns.
  const hold = `
import fcntl, os, sys, time
fd = os.open(sys.argv[1], os.O_CREAT | os.O_RDWR, 0o600)
fcntl.flock(fd, fcntl.LOCK_EX)
if os.fork() == 0:
    time.sleep(3)
`;
  const run = session(dir, (launch) => {
    if (launch === 2)
      spawnSync('python3', ['-c', hold, join(dir, 'audio', 'writer.lock')], { stdio: 'ignore' });
  });
  await run.recording.start(run.open);
  await sleep(6000);
  const killedAt = Date.now();
  run.kill();
  await Promise.race([run.finished, sleep(10_000)]);
  console.log(run.log.ended ? `ended ${run.log.endedAt - killedAt} ms after the kill` : 'survived');
  if (!run.log.ended) await run.recording.stop();
  await sleep(3500);
  await report(dir, run.log);
}
process.exit(0);
