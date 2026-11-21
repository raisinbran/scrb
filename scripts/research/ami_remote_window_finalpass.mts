// Reproducible offline check of speaker attribution on a bounded public AMI window.
// Usage: tsx scripts/research/ami_remote_window_finalpass.mts <meeting> <start-sec> <duration-sec> <report.json> [threshold]
// Requires SCRB_DEV_ASSETS and SCRB_BIN; output includes counts only, never audio, text, or embeddings.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
  OVERSPLIT_THRESHOLD,
  runFinalPass,
  resolveFinalSpeakerThreshold,
} from '../../packages/transcription/src/finalPass.js';
import type { FinalSpeaker, SpeakerSpan } from '../../packages/transcription/src/types.js';

const [meeting, startArg, durationArg, outputArg, thresholdArg] = process.argv.slice(2);
if (!meeting || !startArg || !durationArg || !outputArg) {
  throw new Error('usage: <meeting> <start-sec> <duration-sec> <report.json>');
}
if (!/^[A-Z]{2}\d{4}[a-z]$/.test(meeting)) {
  throw new Error('meeting must be an AMI meeting ID such as ES2004a');
}
const startSec = Number(startArg);
const durationSec = Number(durationArg);
if (
  !Number.isFinite(startSec) ||
  !Number.isFinite(durationSec) ||
  startSec < 0 ||
  durationSec <= 0 ||
  durationSec > 60
) {
  throw new Error('window must be 0–60 seconds with nonnegative start');
}
const finalDiarizationThreshold = thresholdArg === undefined ? 0.8 : Number(thresholdArg);
if (
  !Number.isFinite(finalDiarizationThreshold) ||
  finalDiarizationThreshold <= 0 ||
  finalDiarizationThreshold >= 2
) {
  throw new Error('threshold must be a finite number between 0 and 2');
}
const assets = process.env['SCRB_DEV_ASSETS'];
const bin = process.env['SCRB_BIN'];
if (!assets || !bin) throw new Error('SCRB_DEV_ASSETS and SCRB_BIN are required');
const ami = join(assets, 'downloads/ami');
const modelsRoot = join(assets, 'models');
const outputPath = resolve(outputArg);
const wav = join(bin, `${meeting}-${startSec}-${durationSec}-${randomUUID()}.wav`);
const sourceWav = join(ami, `${meeting}.Mix-Headset.wav`);
if (existsSync(wav) || existsSync(outputPath))
  throw new Error('refusing to overwrite existing audio or report evidence');
execFileSync(join(bin, 'ffmpeg.exe'), [
  '-hide_banner',
  '-loglevel',
  'error',
  '-ss',
  String(startSec),
  '-i',
  sourceWav,
  '-t',
  String(durationSec),
  '-ac',
  '1',
  '-ar',
  '16000',
  '-c:a',
  'pcm_s16le',
  wav,
]);

const toolPaths = {
  ffmpeg: join(bin, 'ffmpeg.exe'),
  ffprobe: join(bin, 'ffprobe.exe'),
  whisperCli: join(assets, 'upstream/whisper.cpp/build/bin/whisper-cli.exe'),
  whisperServer: join(assets, 'upstream/whisper.cpp/build/bin/whisper-server.exe'),
  whisperVad: join(assets, 'upstream/whisper.cpp/build/bin/whisper-vad-speech-segments.exe'),
  sherpaSidecar: join(bin, 'scrb-sherpa.exe'),
};
const models = {
  speechFinal: join(modelsRoot, 'whisper/ggml-large-v3-turbo-q5_0.bin'),
  speechLive: join(modelsRoot, 'whisper/ggml-small.en-q5_1.bin'),
  vad: join(modelsRoot, 'whisper/ggml-silero-v6.2.0.bin'),
  segmentation: join(
    modelsRoot,
    'sherpa-onnx/sherpa-onnx-pyannote-segmentation-3-0/model.int8.onnx',
  ),
  embedding: join(
    modelsRoot,
    'sherpa-onnx/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx',
  ),
};
const diagnostics: Record<string, unknown> = {};
// These overrides are research-only; product callers keep the validated production defaults.
const final = await runFinalPass({
  tools: toolPaths,
  models,
  tracks: [{ kind: 'meeting', source: { wavPath: wav } }],
  workDir: await mkdtemp(join(bin, `${meeting}-final-pass-work-`)),
  finalDiarizationThreshold,
  relabel: { shortMergeLine: 0.85 },
  onDiagnostics: (value) => Object.assign(diagnostics, value),
});

type Interval = { start: number; end: number; speaker: string };
const references: Interval[] = [];
for (const file of await readdir(join(ami, 'ann/segments'))) {
  if (!file.startsWith(`${meeting}.`) || !file.endsWith('.segments.xml')) continue;
  const speaker = file.split('.')[1]!;
  const xml = await readFile(join(ami, 'ann/segments', file), 'utf8');
  for (const match of xml.matchAll(/transcriber_start="([\d.]+)"\s+transcriber_end="([\d.]+)"/g)) {
    const start = Math.max(Number(match[1]) - startSec, 0);
    const end = Math.min(Number(match[2]) - startSec, durationSec);
    if (end > start) references.push({ start, end, speaker });
  }
}
const referenceSummary = [...new Set(references.map((r) => r.speaker))].sort().map((speaker) => {
  const rows = references.filter((r) => r.speaker === speaker);
  return {
    speaker,
    segmentCount: rows.length,
    annotatedSpeechSeconds:
      Math.round(rows.reduce((sum, r) => sum + r.end - r.start, 0) * 100) / 100,
  };
});
const overlapSeconds: Record<string, Record<string, number>> = {};
for (const reference of references) {
  const row = (overlapSeconds[reference.speaker] ??= {});
  for (const span of final.spans) {
    const overlap = Math.max(
      0,
      Math.min(reference.end, span.endMs / 1000) - Math.max(reference.start, span.startMs / 1000),
    );
    if (overlap > 0) row[span.speakerId] = (row[span.speakerId] ?? 0) + overlap;
  }
}
const referenceAttribution = referenceSummary.map(({ speaker }) => {
  const matches = overlapSeconds[speaker] ?? {};
  const dominant = Object.entries(matches).sort((a, b) => b[1] - a[1])[0];
  const outputSpeakerId = dominant?.[0];
  const seconds = dominant?.[1];
  return {
    referenceSpeaker: speaker,
    dominantOutputSpeakerId: outputSpeakerId ?? null,
    overlapSeconds: seconds === undefined ? 0 : Math.round(seconds * 100) / 100,
    overlapByOutputSpeaker: Object.fromEntries(
      Object.entries(matches).map(([id, value]) => [id, Math.round(value * 100) / 100]),
    ),
  };
});
const report = {
  schemaVersion: 1,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  defaultDiarizationThreshold: OVERSPLIT_THRESHOLD,
  evaluatedDiarizationThreshold: resolveFinalSpeakerThreshold(finalDiarizationThreshold),
  evaluatedShortMergeLine: 0.85,
  sourceWindow: { meeting, startSeconds: startSec, durationSeconds: durationSec },
  sourceAudio: basename(sourceWav),
  referenceSpeakers: referenceSummary,
  referenceAttribution,
  output: {
    finalSpeakerCount: final.speakers.length,
    wordCount: final.words.length,
    spanCount: final.spans.length,
    speakerWordCounts: Object.fromEntries(
      final.speakers.map((speaker: FinalSpeaker) => [
        speaker.id,
        final.words.filter((word) => word.speakerId === speaker.id).length,
      ]),
    ),
    speakerSpanCounts: Object.fromEntries(
      final.speakers.map((speaker: FinalSpeaker) => [
        speaker.id,
        final.spans.filter((span: SpeakerSpan) => span.speakerId === speaker.id).length,
      ]),
    ),
  },
  diagnostics: {
    ...diagnostics,
    speechModel: basename(models.speechFinal),
    segmentationModel: basename(models.segmentation),
    embeddingModel: basename(models.embedding),
  },
};
await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));

