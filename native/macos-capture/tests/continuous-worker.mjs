// Usage: node continuous-worker.mjs <compiled transcription> <native test binary> <raw fixtures> <dev assets> [source rate ...]
// Fixtures are 60 seconds of invented/public mono s16le at each source rate.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const [compiled, native, fixtures, assets] = process.argv.slice(2).map((value) => resolve(value));
const load = (file) => import(pathToFileURL(join(compiled, file)).href);
const { LiveAudioWorker } = await load('liveAudioWorker.js');
const { PcmFrameDecoder } = await load('livePcmProtocol.js');
const { toolsIn } = await load('config.js');
const models = {
  speechLive: join(assets, 'models/whisper/ggml-small.en-q5_1.bin'),
  speechFinal: 'unused',
  vad: join(assets, 'models/whisper/ggml-silero-v6.2.0.bin'),
  segmentation: 'unused',
  embedding: 'unused',
};
const rates = process.argv.length > 6 ? process.argv.slice(6).map(Number) : [48000, 44100];
for (const rate of rates) {
  const wire = join(fixtures, `wire-${rate}.pcm`);
  execFileSync(native, [String(rate), join(fixtures, `continuous-${rate}.raw`), wire]);
  const frames = [];
  const decoder = new PcmFrameDecoder((frame) => frames.push(frame));
  const bytes = await readFile(wire);
  for (let at = 0; at < bytes.length; at += 137) decoder.write(bytes.subarray(at, at + 137));
  decoder.end();
  let endNs = 0;
  for (const frame of frames) {
    assert.equal(frame.startNs, endNs);
    endNs += frame.samples.length * 62500;
  }
  assert.equal(endNs, 60e9);
  const events = [];
  let lastLag;
  const worker = await LiveAudioWorker.start({
    tools: toolsIn(join(assets, 'upstream/whisper.cpp/build/bin')),
    models,
    onEvent: (event) => {
      events.push(event);
      if (event.type === 'lag') lastLag = event;
    },
  });
  let refused = 0;
  let boundaryDrained;
  try {
    await delay(3000);
    const started = performance.now();
    for (const frame of frames) {
      await delay(Math.max(0, started + frame.startNs / 1e6 - performance.now()));
      if (frame.boundary) lastLag = undefined;
      if (!worker.offer(frame)) refused++;
    }
    const deadline = performance.now() + 30000;
    while (
      (!lastLag || lastLag.queuedFrames !== 0 || lastLag.lagMs !== 0) &&
      performance.now() < deadline
    ) {
      if (events.some((event) => event.type === 'failed' || event.type === 'restarting')) break;
      await delay(50);
    }
    boundaryDrained = lastLag?.queuedFrames === 0 && lastLag?.lagMs === 0;
  } finally {
    await worker.close();
  }
  const words = events.filter((e) => e.type === 'segment').flatMap((e) => e.segment.words);
  const gaps = events.filter((e) => e.type === 'skipped' && e.gap.reason === 'gap');
  const failures = events.filter((e) => e.type === 'failed');
  const skips = events.filter((e) => e.type === 'skipped');
  console.log(
    JSON.stringify({
      rate,
      frames: frames.length,
      durationNs: endNs,
      words: words.length,
      boundaryDrained,
      restarts: events.filter((event) => event.type === 'restarting').length,
      refused,
      gaps: gaps.length,
      skips,
      failures,
    }),
  );
  assert.ok(words.length > 0, 'real worker emits timed words');
  assert.equal(refused, 0);
  assert.equal(gaps.length, 0);
  assert.equal(skips.length, 0);
  assert.equal(failures.length, 0);
  assert.equal(boundaryDrained, true, 'boundary acknowledged without worker failure');
}
