// Reproducible offline check of speaker attribution on a bounded public AMI window.
// Usage: tsx scripts/research/ami_remote_window_finalpass.mts <meeting> <start-sec> <duration-sec> <report.json> [threshold]
// Requires SCRB_DEV_ASSETS and SCRB_BIN; output includes counts only, never audio, text, or embeddings.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { existsSync } from 'node:fs';
import { lstat, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { release } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  assertStrictChild,
  collectAdjacentDlls,
  createAmiWorkspace,
  readAmiSegmentAnnotations,
  requireAmiMeetingId,
} from './ami_remote_workspace.mjs';
import {
  OVERSPLIT_THRESHOLD,
  runFinalPass,
  resolveFinalSpeakerThreshold,
} from '../../packages/transcription/src/finalPass.js';
import type { FinalSpeaker, SpeakerSpan } from '../../packages/transcription/src/types.js';


async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function sha256FilesWithin(root, files) {
  const canonicalRoot = await realpath(root);
  const hash = createHash('sha256');
  for (const [name, path] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    if (!(await lstat(path)).isFile()) throw new Error('research input must be a regular file');
    const canonicalPath = assertStrictChild(canonicalRoot, await realpath(path));
    hash.update(name + '\\0');
    for await (const chunk of createReadStream(canonicalPath)) hash.update(chunk);
    hash.update('\\0');
  }
  return hash.digest('hex');
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function requireCleanSourceCommit() {
  const status = execFileSync(
    'git',
    ['-C', repositoryRoot, 'status', '--porcelain', '--untracked-files=all'],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );
  if (status.trim()) throw new Error('AMI research requires a clean source tree');
  return execFileSync('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
}

const [meeting, startArg, durationArg, outputArg, thresholdArg] = process.argv.slice(2);
if (!meeting || !startArg || !durationArg || !outputArg) {
  throw new Error('usage: <meeting> <start-sec> <duration-sec> <report.json>');
}
requireAmiMeetingId(meeting);
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
const sourceCommit = requireCleanSourceCommit();
const outputPath = resolve(outputArg);
if (existsSync(outputPath)) throw new Error('refusing to overwrite existing report evidence');
const workspace = await createAmiWorkspace({ assets, bin, meeting });
try {
  const ami = workspace.ami;
  const modelsRoot = join(workspace.assetRoot, 'models');
  const wav = workspace.wav;
  const sourceWav = workspace.sourceWav;
  execFileSync(join(workspace.toolRoot, 'ffmpeg.exe'), [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-n',
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
    ffmpeg: join(workspace.toolRoot, 'ffmpeg.exe'),
    ffprobe: join(workspace.toolRoot, 'ffprobe.exe'),
    whisperCli: join(workspace.assetRoot, 'upstream/whisper.cpp/build/bin/whisper-cli.exe'),
    whisperServer: join(workspace.assetRoot, 'upstream/whisper.cpp/build/bin/whisper-server.exe'),
    whisperVad: join(workspace.assetRoot, 'upstream/whisper.cpp/build/bin/whisper-vad-speech-segments.exe'),
    sherpaSidecar: join(workspace.toolRoot, 'scrb-sherpa.exe'),
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
  const annotationRows = await readAmiSegmentAnnotations(ami, meeting);
  const diagnostics: Record<string, unknown> = {};
  // Research overrides only; product callers retain the production defaults.
  const final = await runFinalPass({
    tools: toolPaths,
    models,
    tracks: [{ kind: 'meeting', source: { wavPath: wav } }],
    workDir: workspace.workDir,
    finalDiarizationThreshold,
    relabel: { shortMergeLine: 0.85 },
    onDiagnostics: (value) => Object.assign(diagnostics, value),
  });

  type Interval = { start: number; end: number; speaker: string };
  const references: Interval[] = [];
  const annotationHash = createHash('sha256');
  for (const { file, speaker, bytes, xml } of annotationRows) {
    annotationHash.update(file + '\\0');
    annotationHash.update(bytes);
    annotationHash.update('\\0');
    for (const match of xml.matchAll(/transcriber_start="([\\d.]+)"\\s+transcriber_end="([\\d.]+)"/g)) {
      const start = Math.max(Number(match[1]) - startSec, 0);
      const end = Math.min(Number(match[2]) - startSec, durationSec);
      if (end > start) references.push({ start, end, speaker });
    }
  }
  const referenceAnnotationSha256 = annotationHash.digest('hex');
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
  const toolDlls = await collectAdjacentDlls(workspace.toolRoot);
  const whisperBin = join(workspace.assetRoot, 'upstream/whisper.cpp/build/bin');
  const whisperDlls = await collectAdjacentDlls(whisperBin);
  const report = {
    schemaVersion: 2,
    runtimeIdentity: {
      platform: process.platform,
      architecture: process.arch,
      nodeVersion: process.versions.node,
      operatingSystemRelease: release(),
    },
    sourceCommit,
    sourceTreeClean: true,
    sourceAudioSha256: await sha256File(sourceWav),
    windowAudioSha256: await sha256File(wav),
    referenceAnnotationSha256,
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
    modelSha256: await sha256FilesWithin(modelsRoot, {
      speechFinal: models.speechFinal,
      segmentation: models.segmentation,
      embedding: models.embedding,
      vad: models.vad,
    }),
    toolSha256: await sha256FilesWithin(workspace.toolRoot, {
      ffmpeg: toolPaths.ffmpeg,
      ffprobe: toolPaths.ffprobe,
      sherpaSidecar: toolPaths.sherpaSidecar,
      ...toolDlls,
    }),
    whisperToolSha256: await sha256FilesWithin(
      whisperBin,
      {
        whisperCli: toolPaths.whisperCli,
        whisperServer: toolPaths.whisperServer,
        whisperVad: toolPaths.whisperVad,
        ...whisperDlls,
      },
    ),
  };
  await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(report));
} finally {
  await workspace.cleanup();
}
