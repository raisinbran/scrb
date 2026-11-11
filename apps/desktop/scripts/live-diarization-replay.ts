// Silent integration replay: no audio output API, native capture or ASR model is used.
// Usage: npx tsx apps/desktop/scripts/live-diarization-replay.ts <repo> <evidence>
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { build } from 'esbuild';
import type { BackendEvents } from '@scrb/contracts';
import { Library } from '@scrb/storage';
import { LiveTranscriptSink } from '../src/main/live-transcript.ts';
import { LiveAudioWorker } from '../../../packages/transcription/src/liveAudioWorker.js';
import { toolsIn, type ModelPaths } from '../../../packages/transcription/src/config.js';

const [repo, evidence] = process.argv.slice(2);
if (!repo || !evidence) throw new Error('Expected repository and evidence directories');
await mkdir(evidence, { recursive: true });
const started = performance.now();
const entry = join(evidence, 'live-worker.mjs');
await build({
  entryPoints: [join(repo, 'packages/transcription/src/liveWorkerEntry.ts')],
  outfile: entry,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
});
const wav = await readFile(join(repo, 'phase0/downloads/ami/ES2004a.Mix-Headset.wav'));
// The AMI fixture is 16 kHz mono PCM; parse chunks rather than assume a 44-byte header.
let offset = 12;
let data = Buffer.alloc(0);
let rate = 0;
while (offset + 8 <= wav.length) {
  const size = wav.readUInt32LE(offset + 4);
  const tag = wav.toString('ascii', offset, offset + 4);
  if (tag === 'fmt ') {
    assert.equal(wav.readUInt16LE(offset + 8), 1);
    assert.equal(wav.readUInt16LE(offset + 10), 1);
    rate = wav.readUInt32LE(offset + 12);
    assert.equal(wav.readUInt16LE(offset + 22), 16);
  }
  if (tag === 'data') data = wav.subarray(offset + 8, offset + 8 + size);
  offset += 8 + size + (size % 2);
}
assert.equal(rate, 16000);
assert(data.length >= 600 * rate * 2);
const server = createServer(async (request, response) => {
  for await (const chunk of request) void chunk;
  response.setHeader('Content-Type', 'application/json');
  response.end(
    JSON.stringify({
      text: 'stub',
      segments: [
        {
          words: Array.from({ length: 8 }, (_, i) => ({
            word: ` w${i}`,
            start: i * 0.5,
            end: i * 0.5 + 0.4,
            probability: 1,
          })),
        },
      ],
    }),
  );
});
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
assert(address && typeof address !== 'string');
let libraryClosed = false;
const library = await Library.open({ root: join(evidence, 'library') });
const meeting = await library.createMeeting({ title: 'ES2004a silent replay', date: '2026-11-11' });
let revisions = 0;
let replacements = 0;
let speakerEvents = 0;
let failures = 0;
let skips = 0;
let maxQueue = 0;
const sink = new LiveTranscriptSink(library, meeting.id, (name, payload) => {
  if (name === 'transcriptChanged') {
    const changed = payload as BackendEvents['transcriptChanged'];
    assert(changed.revision > revisions);
    revisions = changed.revision;
    if (changed.change.kind === 'replace') replacements++;
    if (changed.speakers.some((s) => /^Speaker [1-9]/.test(s.label))) speakerEvents++;
  }
});
const models: ModelPaths = {
  speechLive: '',
  speechFinal: '',
  vad: '',
  segmentation: join(
    repo,
    'phase0/models/sherpa-onnx/sherpa-onnx-pyannote-segmentation-3-0/model.int8.onnx',
  ),
  embedding: join(
    repo,
    'phase0/models/sherpa-onnx/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx',
  ),
};
const worker = await LiveAudioWorker.start({
  tools: toolsIn(join(repo, 'packages/transcription/.bin')),
  models,
  workerArgs: [entry],
  traceDirectory: join(evidence, 'trace'),
  startModels: async (workDir) => ({
    port: address.port,
    detect: async (track) => {
      const bytes = await readFile(join(workDir, `vad-${track}.wav`));
      return [{ startMs: 0, endMs: (bytes.length - 44) / 32 }];
    },
    close: async () => undefined,
  }),
  onEvent: (event) => {
    if (event.type === 'failed' || event.type === 'restarting') failures++;
    if (event.type === 'skipped') skips++;
    sink.handle(event);
  },
});
async function until(predicate: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = performance.now() + 8000;
  while (!(await predicate())) {
    assert(performance.now() < deadline, 'Replay wait exceeded 8 seconds');
    await delay(10);
  }
}
async function traces(): Promise<Record<string, number | string>[]> {
  const dir = join(evidence!, 'trace');
  const files = await readdir(dir);
  const rows: Record<string, number | string>[] = [];
  for (const file of files)
    for (const line of (await readFile(join(dir, file), 'utf8')).split('\n')) {
      if (!line) continue;
      try {
        rows.push(JSON.parse(line));
      } catch {
        /* a pending line is retried */
      }
    }
  return rows;
}
try {
  await until(() => worker.getProgress().ready);
  // Feed five-second batches, draining the real isolated speaker hop between batches.
  for (let sequence = 0; sequence < 6000; sequence++) {
    const samples = new Int16Array(1600);
    for (let i = 0; i < samples.length; i++) samples[i] = data.readInt16LE(sequence * 3200 + i * 2);
    assert(
      worker.offer({
        track: 'meeting',
        sequence,
        generation: 0,
        startNs: sequence * 100_000_000,
        boundary: false,
        samples,
      }),
    );
    maxQueue = Math.max(maxQueue, worker.getProgress().queuedFrames);
    if ((sequence + 1) % 50 === 0) {
      const endNs = (sequence + 1) * 100_000_000;
      await until(async () =>
        (await traces()).some((r) => r.stage === 'speaker_end' && r.endNs === endNs),
      );
      assert.equal(failures, 0);
      assert.equal(skips, 0);
    }
  }
  await delay(100);
  await worker.close();
  await sink.stop();
  const saved = await library.readTranscript(meeting.id);
  const promoted = saved.speakers.filter((s) => /^Speaker [1-9][0-9]*$/.test(s.label));
  assert(promoted.length >= 3, `Expected three promoted meeting speakers; got ${promoted.length}`);
  assert(saved.segments.every((s) => s.track === 'meeting'));
  assert(saved.segments.flatMap((s) => s.words).length >= 1100);
  assert(speakerEvents > 0);
  assert(replacements > 0);
  const before = JSON.stringify(saved);
  await library.close();
  libraryClosed = true;
  const reopened = await Library.open({ root: join(evidence, 'library') });
  assert.equal(JSON.stringify(await reopened.readTranscript(meeting.id)), before);
  await reopened.close();
  const rows = await traces();
  const hops = rows.filter((r) => r.stage === 'speaker_end');
  const durations = hops.map(
    (end) =>
      Number(end.monoMs) -
      Number(
        rows.find((start) => start.stage === 'speaker_start' && start.endNs === end.endNs)?.monoMs,
      ),
  );
  const hypothesis = saved.segments
    .filter((s) => s.speakerId !== 'meeting')
    .flatMap((s) =>
      s.words.map(
        (w) => `${(w.startMs / 1000).toFixed(3)} ${(w.endMs / 1000).toFixed(3)} ${s.speakerId}`,
      ),
    )
    .join('\n');
  await writeFile(join(evidence, 'hypothesis.txt'), hypothesis + '\n');
  await writeFile(
    join(evidence, 'result.json'),
    JSON.stringify(
      {
        seconds: 600,
        promoted: promoted.map((s) => s.label),
        revisions,
        replacements,
        speakerEvents,
        maxQueue,
        failures,
        skips,
        hops: hops.length,
        hopMedianMs: durations.sort((a, b) => a - b)[Math.floor(durations.length / 2)],
        hopMaxMs: Math.max(...durations),
        maxSpeakerLagAudioMs: Math.max(...hops.map((r) => Number(r.bufferedMs))),
        elapsedMs: performance.now() - started,
        rssBytes: process.memoryUsage().rss,
        note: 'Accelerated silent replay with timed-word and VAD stubs; does not measure native capture or real ASR latency.',
      },
      null,
      2,
    ),
  );
  console.log(await readFile(join(evidence, 'result.json'), 'utf8'));
} finally {
  await worker.close();
  await sink.stop();
  if (!libraryClosed) await library.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
