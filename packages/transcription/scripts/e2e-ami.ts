// End-to-end AMI check.  Needs the Phase 0 models and binaries; run a whole
// invocation under the model lock:
//   taskpolicy -c utility lockf -k ~/.local/share/scrb-node/model.lock \
//     npx tsx scripts/e2e-ami.ts <phase0 dir> <work dir> <meeting> [import|chunks|live]...
// Paths and metrics go to stdout as JSON.  Nothing here is written to the repo.
import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LivePass,
  importAudioFile,
  readChunkManifest,
  runFinalPass,
  toolsIn,
  type FinalTranscript,
  type LiveSegment,
  type ModelPaths,
  type ToolPaths,
} from '../src/index.js';

const [phase0, workRoot, meeting, ...stages] = process.argv.slice(2);
if (!phase0 || !workRoot || !meeting) throw new Error('usage: <phase0> <work> <meeting> [stages]');
const want = stages.length ? stages : ['import', 'chunks', 'live'];
const here = dirname(fileURLToPath(import.meta.url));
const whisperBin = join(phase0, 'upstream/whisper.cpp/build/bin');
const tools: ToolPaths = toolsIn(join(here, '../.bin'), {
  whisperCli: join(whisperBin, 'whisper-cli'),
  whisperServer: join(whisperBin, 'whisper-server'),
  whisperVad: join(whisperBin, 'whisper-vad-speech-segments'),
});
const models: ModelPaths = {
  speechFinal: join(phase0, 'models/whisper/ggml-large-v3-turbo-q5_0.bin'),
  speechLive: join(phase0, 'models/whisper/ggml-large-v3-turbo-q5_0.bin'),
  vad: join(phase0, 'models/whisper/ggml-silero-v6.2.0.bin'),
  segmentation: join(phase0, 'models/sherpa-onnx/sherpa-onnx-pyannote-segmentation-3-0/model.int8.onnx'),
  embedding: join(phase0, 'models/sherpa-onnx/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx'),
};
const ami = join(phase0, 'downloads/ami');
const source = join(ami, `${meeting}.Mix-Headset.wav`);
const scripts = join(here, '../../../phase0/scripts');
const work = join(workRoot, meeting);
await mkdir(work, { recursive: true });

function score(script: string, args: string[]): unknown {
  const out = execFileSync('python3', ['-I', join(scripts, script), ...args], { encoding: 'utf8' });
  return JSON.parse(out.trim().split('\n').at(-1)!);
}

async function scoreWords(name: string, text: string): Promise<unknown> {
  const path = join(work, `${name}.txt`);
  await writeFile(path, text);
  return score('score_ami_wer.py', [join(ami, 'ann'), meeting!, path]);
}

async function scoreSpans(name: string, lines: string[]): Promise<unknown> {
  const path = join(work, `${name}.der.txt`);
  await writeFile(path, lines.join('\n') + '\n');
  return score('score_der.py', [join(ami, 'ann/segments'), meeting!, path]);
}

async function report(name: string, t: FinalTranscript): Promise<void> {
  await writeFile(join(work, `${name}.json`), JSON.stringify(t));
  console.log(JSON.stringify({
    stage: name,
    words: t.words.length,
    speakers: t.speakers.map((s) => [s.label, Math.round(s.speechMs / 1000), s.embeddingSegments]),
    timing: t.timing,
    wer: await scoreWords(name, t.words.map((w) => w.text).join(' ')),
    der: await scoreSpans(name, t.spans.map((s) => `${s.startMs / 1000} ${s.endMs / 1000} ${s.speakerId}`)),
  }));
}

const meetingDir = join(work, 'meeting');
if (want.includes('import')) {
  await rm(meetingDir, { recursive: true, force: true });
  const started = Date.now();
  const result = await importAudioFile({
    tools, sourcePath: source, meetingDir, transcribe: { models },
  });
  console.log(JSON.stringify({
    stage: 'import-wall', ms: Date.now() - started, durationMs: result.durationMs, chunks: result.chunks.length,
  }));
  await report('import', result.transcript!);
}

if (want.includes('chunks')) {
  const chunks = await readChunkManifest(meetingDir);
  await report('chunks', await runFinalPass({
    tools, models, tracks: [{ kind: 'meeting', source: { chunks } }], workDir: join(work, 'final-work'),
  }));
}

if (want.includes('live')) {
  const chunks = await readChunkManifest(meetingDir);
  const segments: LiveSegment[] = [];
  const merges: [string, string][] = [];
  let maxQueued = 0;
  const live = new LivePass({
    tools, models, workDir: join(work, 'live-work'),
    onSegment: (s) => segments.push(s),
    onMerge: (m) => merges.push([m.from, m.into]),
    onLag: (l) => (maxQueued = Math.max(maxQueued, l.queuedChunks)),
    onFailed: (reason) => console.log(JSON.stringify({ stage: 'live-failed', reason })),
  });
  await live.start();
  const started = Date.now();
  const worst: number[] = [];
  // Replay at full speed, one chunk at a time, so nothing is skipped.
  for (const c of chunks) {
    const before = Date.now();
    live.addChunk('meeting', c);
    await live.idle();
    worst.push(Date.now() - before);
  }
  await live.finish();
  const elapsed = Date.now() - started;
  worst.sort((a, b) => a - b);
  const remap = new Map(merges);
  const resolve = (id: string): string => {
    while (remap.has(id)) id = remap.get(id)!;
    return id;
  };
  console.log(JSON.stringify({
    stage: 'live',
    segments: segments.length,
    elapsedMs: elapsed,
    chunkP50Ms: worst[Math.floor(worst.length / 2)],
    chunkP95Ms: worst[Math.floor(worst.length * 0.95)],
    chunkMaxMs: worst.at(-1),
    relabels: merges.length,
    labels: [...new Set(segments.map((s) => s.speakerLabel))],
    wer: await scoreWords('live', segments.map((s) => s.text).join(' ')),
    der: await scoreSpans('live', segments.map((s) => `${s.startMs / 1000} ${s.endMs / 1000} ${s.speakerId}`)),
    derPostMerge: await scoreSpans('live-merged',
      segments.map((s) => `${s.startMs / 1000} ${s.endMs / 1000} ${resolve(s.speakerId)}`)),
  }));
}
