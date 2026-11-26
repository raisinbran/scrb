import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { release } from 'node:os';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { MeetingDiarizer } from '../../packages/transcription/src/meetingDiarizer.js';
import { SherpaWorker } from '../../packages/transcription/src/sherpa.js';
import { LIVE_JOIN_SIMILARITY, NAMED_AFTER_MS } from '../../packages/transcription/src/speakers.js';
import { toolsIn } from '../../packages/transcription/src/config.js';
import type { TimedLiveSegment } from '../../packages/transcription/src/livePcmEngine.js';
import { prepareReferences, scoreSlots } from './v-f-score.mjs';
import {
  assertStrictChild,
  collectResearchRuntimeLibraries,
  createAmiWorkspace,
  readAmiSegmentAnnotations,
} from './ami_remote_workspace.mjs';

const [meeting, startArg, thresholdArg] = process.argv.slice(2);
const start = Number(startArg);
const threshold = Number(thresholdArg);
assert(
  ['IS1009a:240', 'IS1009a:360', 'IS1009b:300', 'TS3003b:180'].includes(meeting + ':' + start) &&
    [1.2, 1, 0.8].includes(threshold),
);
const assets = process.env['SCRB_DEV_ASSETS'];
const bin = process.env['SCRB_BIN'];
const scratch = process.env['SCRB_AMI_SCRATCH'];
assert(assets && bin && scratch);
const started = performance.now();
const workspace = await createAmiWorkspace({ assets, bin, scratch, meeting });
const tools = toolsIn(workspace.toolRoot);
const modelRoot = join(workspace.assetRoot, 'models', 'sherpa-onnx');
const models = {
  speechLive: '',
  speechFinal: '',
  vad: '',
  segmentation: join(modelRoot, 'sherpa-onnx-pyannote-segmentation-3-0', 'model.int8.onnx'),
  embedding: join(modelRoot, '3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx'),
};
const segments = new Map<string, TimedLiveSegment>();
const aliases = new Map<string, string>();
let completed = 0;
let error: unknown;
const diarizer = new MeetingDiarizer(
  async (signal) => {
    const worker = await SherpaWorker.start(tools, models, 4, signal);
    return {
      async diarizeWindow(pcm) {
        try {
          const wav = Buffer.alloc(44 + pcm.length * 2);
          wav.write('RIFF', 0);
          wav.writeUInt32LE(wav.length - 8, 4);
          wav.write('WAVEfmt ', 8);
          wav.writeUInt32LE(16, 16);
          wav.writeUInt16LE(1, 20);
          wav.writeUInt16LE(1, 22);
          wav.writeUInt32LE(16000, 24);
          wav.writeUInt32LE(32000, 28);
          wav.writeUInt16LE(2, 32);
          wav.writeUInt16LE(16, 34);
          wav.write('data', 36);
          wav.writeUInt32LE(pcm.length * 2, 40);
          for (let i = 0; i < pcm.length; i++) wav.writeInt16LE(pcm[i]! * 32768, 44 + i * 2);
          await writeFile(workspace.wav, wav);
          const spans = await worker.diarizeFile(workspace.wav, threshold);
          if (threshold === 1.2) {
            const baseline = await worker.diarizeWindow(pcm);
            assert.deepEqual(spans, baseline, 'File and PCM window spans differ at 1.2');
          }
          return spans;
        } catch (failure) {
          error = failure;
          throw failure;
        }
      },
      embedPcm: (pcm) => worker.embedPcm(pcm),
      kill: () => worker.kill(),
    };
  },
  (segment) => segments.set(segment.id, segment),
  {
    record(stage) {
      if (stage === 'speaker_end') completed++;
      if (stage === 'speaker_error') error ??= new Error('Speaker hop failed');
    },
    now: () => performance.now(),
    close: async () => undefined,
  },
  ({ from, into }) => aliases.set(from, into),
);

async function sha256(path: string) {
  assert((await lstat(path)).isFile(), 'expected regular input file');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

let receipt: object | undefined;
try {
  const annotations = await readAmiSegmentAnnotations(workspace.ami, meeting);
  const reference = prepareReferences(annotations, start);
  const pinFile = process.env['SCRB_VF_INPUT_HASHES'];
  assert(pinFile, 'verified input hash manifest required');
  const expected = JSON.parse(await readFile(pinFile, 'utf8'));
  const libraries = await collectResearchRuntimeLibraries(workspace.toolRoot, process.platform);
  assert(Object.keys(libraries).length > 0, 'verified staged runtime libraries required');
  const paths = {
    [basename(workspace.sourceWav)]: workspace.sourceWav,
    [basename(models.embedding)]: models.embedding,
    'segmentation-model.int8.onnx': models.segmentation,
    [basename(tools.ffmpeg)]: tools.ffmpeg,
    [basename(tools.sherpaSidecar)]: tools.sherpaSidecar,
    ...libraries,
  };
  for (const path of [models.embedding, models.segmentation]) {
    assertStrictChild(workspace.assetRoot, await realpath(path));
  }
  for (const path of [tools.ffmpeg, tools.sherpaSidecar]) {
    assertStrictChild(workspace.toolRoot, await realpath(path));
  }
  const inputSha256 = Object.fromEntries(
    await Promise.all(
      Object.entries(paths).map(async ([name, path]) => [name, await sha256(path)]),
    ),
  );
  for (const { file, bytes } of annotations) {
    inputSha256[file] = createHash('sha256').update(bytes).digest('hex');
  }
  for (const [name, digest] of Object.entries(inputSha256)) {
    assert.equal(digest, expected[name], 'input hash mismatch: ' + name);
  }
  const repo = new URL('../..', import.meta.url);
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  assert.equal(git('status', '--porcelain', '--untracked-files=all'), '', 'clean source required');
  const data = execFileSync(
    tools.ffmpeg,
    [
      '-v',
      'error',
      '-ss',
      String(start),
      '-i',
      workspace.sourceWav,
      '-t',
      '60',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-f',
      's16le',
      '-',
    ],
    { maxBuffer: 2_000_000, timeout: 15000 },
  );
  assert.equal(data.length, 60 * 32000);
  receipt = {
    schemaVersion: 1,
    meeting,
    start,
    duration: 60,
    threshold,
    sourceCommit: git('rev-parse', 'HEAD'),
    inputSha256,
    pcmSha256: createHash('sha256').update(data).digest('hex'),
    runtime: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      os: release(),
    },
    config: {
      sampleRate: 16000,
      threads: 4,
      hopMs: 5000,
      slotMs: 100,
      tickMs: 10,
      liveJoinSimilarity: LIVE_JOIN_SIMILARITY,
      namedAfterMs: NAMED_AFTER_MS,
      baselineParityRequired: threshold === 1.2,
    },
    reference: {
      totalTicks: reference.totals,
      exclusiveTicks: reference.exclusive,
      overlapTicks: reference.overlapTicks,
      sustainedIndices: reference.sustained,
    },
  };
  let hops = 0;
  for (let sequence = 0; sequence < 600; sequence++) {
    const startMs = sequence * 100;
    const samples = new Int16Array(1600);
    for (let i = 0; i < samples.length; i++) samples[i] = data.readInt16LE(sequence * 3200 + i * 2);
    diarizer.push({
      track: 'meeting',
      sequence,
      generation: 0,
      startNs: startMs * 1e6,
      boundary: false,
      samples,
    });
    if ((sequence + 1) % 50 === 0) {
      const hopStart = startMs - 4900;
      const id = String(hops);
      const words = Array.from({ length: 50 }, (_, i) => ({
        text: '',
        startMs: hopStart + i * 100,
        endMs: hopStart + (i + 1) * 100,
        confidence: 1,
      }));
      segments.set(
        id,
        diarizer.attribute({
          id,
          sequence,
          generation: 0,
          track: 'meeting',
          startMs: hopStart,
          endMs: startMs + 100,
          text: '',
          speakerId: 'meeting',
          speakerLabel: 'Meeting',
          provisional: true,
          words,
        }),
      );
      await diarizer.waitForHop();
      if (error) throw error;
      assert.equal(completed, ++hops);
    }
  }
  const labels = [...segments.values()].flatMap((s) => s.wordSpeakers ?? []);
  console.log(
    JSON.stringify({
      ...receipt,
      status: 'complete',
      hops,
      ...scoreSlots(reference, labels, aliases),
      elapsedMs: Math.round(performance.now() - started),
    }),
  );
} catch (failure) {
  if (receipt) {
    console.log(
      JSON.stringify({
        ...receipt,
        status: 'failed',
        hops: completed,
        elapsedMs: Math.round(performance.now() - started),
      }),
    );
  }
  throw failure;
} finally {
  diarizer.close();
  await workspace.cleanup();
}
