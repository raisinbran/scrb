// Gate 2 long run through the app's RecordingSession: pauses, device changes and a forced worker
// crash, with a tone on the meeting track. Unattended, so run it under run-muted.sh and caffeinate.
// Usage: node --experimental-transform-types long_run_app.mjs <helper> <set_input> <work dir>
//        <tone file> <seconds> <other input> <usual input>
import { execFile, spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProcessAdapter } from '../../../packages/capture/src/process-adapter.ts';
import { RecordingSession } from '../../../packages/app-core/src/recording.ts';
import { sealAudio } from '../../../packages/app-core/src/recovery.ts';

const [helper, setInput, work, tone, secondsText, other, usual] = process.argv.slice(2);
const total = Number(secondsText) * 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const select = (name) =>
  new Promise((resolve) =>
    execFile(setInput, [name], (error) => resolve(error ? `failed ${error.code}` : 'ok')),
  );
mkdirSync(work, { recursive: true });
const eventLog = join(work, 'events.jsonl');
const note = (fields) => {
  const line = JSON.stringify({ at: new Date().toISOString(), ...fields });
  appendFileSync(eventLog, `${line}\n`);
  console.log(line);
};

const player = spawn('afplay', [tone], { stdio: 'ignore' });
await sleep(2000);
let id = 0;
let adapter = null;
let ended = null;
const recording = new RecordingSession({
  launch: () => {
    adapter = new ProcessAdapter(helper);
    adapter.onEvent((event) => {
      if (event.type !== 'health') note({ event });
    });
    note({ launched: true });
    return adapter;
  },
  onStateChanged: (status) => note({ status }),
  onTrackMissing: (track) => note({ missing: track }),
  onEnded: (end) => {
    ended = end;
    note({ ended: end });
  },
  newCommandId: () => `c${(id += 1)}`,
});
await recording.start({
  name: 'open',
  sessionId: 'long',
  outputDir: work,
  source: [player.pid],
  mic: 'default',
});
const started = Date.now();

const pause = async (seconds, during = async () => undefined) => {
  await recording.pause();
  await during();
  await sleep(seconds * 1000);
  await recording.resume();
};

const steps = [
  [1 / 6, 'pause', () => pause(30)],
  [2 / 6 - 0.02, 'input to other', () => select(other)],
  [2 / 6, 'input back', () => select(usual)],
  [0.45, 'pause', () => pause(30)],
  [0.5, 'kill worker', () => adapter.kill()],
  [0.6, 'pause', () => pause(30)],
  [0.7, 'pause with a device change', () => pause(30, () => select(other))],
  [0.72, 'input back', () => select(usual)],
  [0.85, 'pause', () => pause(30)],
];

const counts = () =>
  Object.fromEntries(
    ['microphone', 'meeting'].map((track) => [
      track,
      readdirSync(join(work, 'audio', track)).filter((file) => file.endsWith('.opus')).length,
    ]),
  );

let nextStep = 0;
let nextReport = 0;
while (Date.now() - started < total && ended === null) {
  const elapsed = Date.now() - started;
  if (nextStep < steps.length && elapsed >= steps[nextStep][0] * total) {
    const [, name, run] = steps[nextStep];
    nextStep += 1;
    note({ step: name, result: await run() });
  }
  if (elapsed >= nextReport) {
    nextReport += 60_000;
    console.log(
      new Date().toTimeString().slice(0, 8),
      Math.round(elapsed / 1000),
      's',
      JSON.stringify(counts()),
    );
  }
  await sleep(250);
}
await recording.stop();
player.kill();
await select(usual);
await sleep(500);

const sealed = await sealAudio(join(work, 'audio'), async () => false);
writeFileSync(join(work, 'sealed.json'), JSON.stringify(sealed));
const ms = (ns) => Math.round(ns / 1e6);
console.log('ended', ended, 'outcome', sealed.outcome, 'timeline ms', ms(sealed.endNs));
for (const [track, value] of Object.entries(sealed.tracks)) {
  const audio = value.chunks.reduce((sum, chunk) => sum + chunk.endNs - chunk.startNs, 0);
  const gaps = sealed.gaps.filter((gap) => gap.track === track || gap.track === 'both');
  const covered = gaps.reduce((sum, gap) => sum + gap.endNs - gap.startNs, 0);
  const seqs = value.chunks.map((chunk) => chunk.seq);
  console.log(
    track,
    'chunks',
    value.chunks.length,
    'unique',
    new Set(seqs).size === seqs.length,
    'audio ms',
    ms(audio),
    'gaps ms',
    ms(covered),
    'unaccounted ms',
    ms(sealed.endNs - audio - covered),
    'rates',
    [...new Set(value.chunks.map((chunk) => chunk.rate))].join(','),
    'long chunks',
    value.chunks.filter((chunk) => chunk.endNs - chunk.startNs > 5.2e9).length,
  );
}
for (const gap of sealed.gaps) {
  if (gap.endNs - gap.startNs > 1e6)
    console.log(' gap', gap.kind, gap.track, ms(gap.startNs), ms(gap.endNs - gap.startNs));
}
const offsets = (sealed.tracks.microphone?.chunks ?? []).flatMap((chunk) => {
  const match = sealed.tracks.meeting?.chunks.find(
    (other) => Math.abs(other.startNs - chunk.startNs) < 2.5e9,
  );
  return match ? [(chunk.startNs - match.startNs) / 1e6] : [];
});
console.log(
  'chunk start offset ms',
  Math.min(...offsets).toFixed(1),
  Math.max(...offsets).toFixed(1),
);
process.exit(ended === 'stopped' ? 0 : 1);
