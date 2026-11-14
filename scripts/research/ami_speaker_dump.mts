// Dumps raw diarization segments and span embeddings for the first N seconds of an
// AMI meeting, so the relabel rule can be swept offline without rerunning the models.
// Usage: tsx ami_speaker_dump.ts <meeting.wav> <seconds> <out.json> <trimmed.wav>
// Env: SCRB_BIN (folder with ffmpeg and scrb-sherpa), SCRB_MODELS (sherpa model folder).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SherpaWorker } from '../../packages/transcription/src/sherpa.js';
import { embeddingSpans } from '../../packages/transcription/src/speakers.js';
import { OVERSPLIT_THRESHOLD } from '../../packages/transcription/src/finalPass.js';

const [wav, seconds, out, trimmed] = process.argv.slice(2) as [string, string, string, string];
const bin = process.env['SCRB_BIN']!;
const models = process.env['SCRB_MODELS']!;
execFileSync(join(bin, 'ffmpeg'), [
  '-y',
  '-v',
  'error',
  '-i',
  wav,
  '-t',
  seconds,
  '-ac',
  '1',
  '-ar',
  '16000',
  trimmed,
]);
const tools = { sherpaSidecar: join(bin, 'scrb-sherpa') } as never;
const segmentation = join(models, 'sherpa-onnx-pyannote-segmentation-3-0/model.int8.onnx');
const embedding = join(models, '3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx');
const sherpa = await SherpaWorker.start(tools, { segmentation, embedding } as never, 4);
const raw = await sherpa.diarizeFile(trimmed, OVERSPLIT_THRESHOLD);
const toEmbed = embeddingSpans(raw);
const vectors = await sherpa.embedSpans(trimmed, toEmbed);
await sherpa.close();
const embedded = toEmbed.flatMap((segment, i) =>
  vectors[i] ? [{ segment, vector: vectors[i] }] : [],
);
writeFileSync(out, JSON.stringify({ raw, embedded, segmentation, embedding }));
console.log(`raw=${raw.length} embedded=${embedded.length}`);
