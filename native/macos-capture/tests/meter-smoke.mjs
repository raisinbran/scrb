// Usage: node meter-smoke.mjs <helper> <evidence-directory>
// Plays an invented 880 Hz tone through the normal output path and measures both tracks.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { clearTimeout, setTimeout } from 'node:timers';
import { setTimeout as delay } from 'node:timers/promises';

const [helper, evidence] = process.argv.slice(2).map((path) => resolve(path));
assert.ok(helper && evidence, 'helper and evidence directory are required');
await mkdir(evidence, { recursive: true });

const sampleRate = 48_000;
const seconds = 6;
const data = Buffer.alloc(sampleRate * seconds * 2);
for (let i = 0; i < sampleRate * seconds; i++) {
  data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 880 * i) / sampleRate) * 12_000), i * 2);
}
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);
const tonePath = join(evidence, 'meter-880hz.wav');
await writeFile(tonePath, Buffer.concat([header, data]));

const child = spawn(helper, [], { stdio: ['pipe', 'pipe', 'pipe'] });
const exited = new Promise((resolveExit) =>
  child.once('exit', (code, signal) => resolveExit({ code, signal })),
);
const events = [];
const pending = new Map();
let nextId = 0;
const lines = createInterface({ input: child.stdout });
lines.on('line', (line) => {
  const message = JSON.parse(line);
  if (message.type === 'ack') pending.get(message.id)?.(message);
  else events.push({ at: performance.now(), ...message });
});
const stderr = [];
child.stderr.on('data', (chunk) => stderr.push(chunk.toString()));

async function send(name, fields = {}) {
  const id = String(++nextId);
  const ack = new Promise((resolveAck, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${name} acknowledgement`)), 5_000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      pending.delete(id);
      resolveAck(message);
    });
  });
  child.stdin.write(`${JSON.stringify({ id, name, ...fields })}\n`);
  const message = await ack;
  assert.equal(message.ok, true, `${name} must succeed`);
  return message;
}

let player;
let stopRequestedAt;
try {
  await send('open', { sessionId: 'meter-smoke', outputDir: evidence, source: [], mic: 'default' });
  await send('start');
  await delay(700);
  const baseline = {};
  for (const track of ['micDb', 'meetingDb']) {
    const values = events
      .filter((e) => e.event === 'meter')
      .slice(-4)
      .map((e) => e[track]);
    baseline[track] = values.sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? -100;
  }
  const toneStartedAt = performance.now();
  player = spawn('afplay', [tonePath], { stdio: 'ignore' });
  await delay(1_300);
  const toneStoppedAt = performance.now();
  player.kill();
  await delay(1_000);

  for (const track of ['micDb', 'meetingDb']) {
    const levels = events.filter((e) => e.event === 'meter');
    const rise = levels.find((e) => e.at >= toneStartedAt && e[track] >= baseline[track] + 10);
    const fall = levels.find((e) => e.at >= toneStoppedAt && e[track] <= baseline[track] + 6);
    assert.ok(rise, `${track} did not rise at least 10 dB above baseline`);
    assert.ok(fall, `${track} did not return near baseline after tone stop`);
    assert.ok(rise.at - toneStartedAt <= 300, `${track} rise took ${rise.at - toneStartedAt} ms`);
    assert.ok(fall.at - toneStoppedAt <= 300, `${track} fall took ${fall.at - toneStoppedAt} ms`);
  }

  const meters = events.filter((e) => e.event === 'meter');
  const health = events.filter((e) => e.event === 'health');
  const meterIntervals = meters.slice(1).map((e, i) => e.at - meters[i].at);
  const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const cadenceMs = median(meterIntervals);
  assert.ok(cadenceMs >= 100 && cadenceMs <= 175, `median meter cadence was ${cadenceMs} ms`);
  assert.ok(health.length >= 2, 'health event cadence must remain active');

  stopRequestedAt = performance.now();
  await send('stop');
  const exit = await exited;
  assert.deepEqual(exit, { code: 0, signal: null });
  const finalMeter = events.filter((e) => e.event === 'meter').at(-1);
  assert.ok(
    finalMeter && finalMeter.at >= stopRequestedAt,
    'stop should emit a final inactive meter',
  );
  assert.equal(finalMeter.micDb, -100);
  assert.equal(finalMeter.meetingDb, -100);
  await delay(150);
  assert.equal(events.filter((e) => e.event === 'meter' && e.at > finalMeter.at).length, 0);

  for (const track of ['microphone', 'meeting']) {
    const chunks = JSON.parse(
      `[${(await readFile(join(evidence, 'audio', track, 'chunks.log'), 'utf8'))
        .trim()
        .split('\n')
        .join(',')}]`,
    );
    assert.ok(
      chunks.some((chunk) => chunk.frames > 0),
      `${track} audio chunk must be saved`,
    );
  }
  const result = {
    cadenceMs,
    updatesPerSecond: 1000 / cadenceMs,
    riseMs: Object.fromEntries(
      ['micDb', 'meetingDb'].map((key) => [
        key,
        events.find(
          (e) => e.event === 'meter' && e.at >= toneStartedAt && e[key] >= baseline[key] + 10,
        ).at - toneStartedAt,
      ]),
    ),
    fallMs: Object.fromEntries(
      ['micDb', 'meetingDb'].map((key) => [
        key,
        events.find(
          (e) => e.event === 'meter' && e.at >= toneStoppedAt && e[key] <= baseline[key] + 6,
        ).at - toneStoppedAt,
      ]),
    ),
    baseline,
    exit,
  };
  await writeFile(join(evidence, 'meter-smoke.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
} catch (error) {
  player?.kill();
  child.kill();
  await writeFile(
    join(evidence, 'meter-smoke-failure.json'),
    JSON.stringify(
      {
        error: String(error),
        events,
        stderr: stderr.join(''),
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  player?.kill();
  lines.close();
}
