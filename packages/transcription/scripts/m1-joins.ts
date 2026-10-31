// M1 from docs/plans/crash-safe-chunks.md: compares the three ways of cutting chunks on AMI audio,
// with one uncut encode as the control.  Chunks go through the real assembly path.  Run a whole
// invocation under the model lock:
//   npx tsx scripts/m1-joins.ts <phase0 dir> <tools dir> <work dir> <meeting>...
// Metrics go to stdout as JSON.  Nothing here is written to the repo.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assembleChunks,
  oggCrc,
  runFinalPass,
  toolsIn,
  type FinalTranscript,
  type ModelPaths,
  type ToolPaths,
} from '../src/index.js';

const [phase0, toolsDir, workRoot, ...meetings] = process.argv.slice(2);
if (!phase0 || !toolsDir || !workRoot || !meetings.length) {
  throw new Error('usage: <phase0> <tools> <work> <meeting>...');
}
const whisperBin = join(phase0, 'upstream/whisper.cpp/build/bin');
const tools: ToolPaths = toolsIn(toolsDir, {
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
const here = dirname(fileURLToPath(import.meta.url));
const scripts = join(here, '../../../phase0/scripts');
const ami = join(phase0, 'downloads/ami');

const RATE = 48000;
const FRAME = 960;
const CHUNK_PACKETS = 250; // 5 s
const OVERLAP_PACKETS = 4; // 80 ms, as RFC 7845 advises
const ENCODE = ['-c:a', 'libopus', '-b:a', '32k', '-vbr', 'constrained', '-application', 'voip', '-frame_duration', '20'];
const WAV_HEADER = 44;

function le32(x: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(x >>> 0);
  return b;
}

/** All packets of a one-stream Ogg Opus file, past the two header packets. */
function readPackets(file: Buffer): { preSkip: number; packets: Buffer[] } {
  const packets: Buffer[] = [];
  let at = 0;
  let open: Buffer[] = [];
  while (at < file.length) {
    const segments = file[at + 26]!;
    let body = at + 27 + segments;
    for (let i = 0; i < segments; i++) {
      const size = file[at + 27 + i]!;
      open.push(file.subarray(body, body + size));
      body += size;
      if (size < 255) {
        packets.push(Buffer.concat(open));
        open = [];
      }
    }
    at = body;
  }
  return { preSkip: packets[0]!.readUInt16LE(10), packets: packets.slice(2) };
}

function page(serial: number, sequence: number, flags: number, granule: number, packets: Buffer[]): Buffer {
  const lacing: number[] = [];
  for (const p of packets) {
    for (let left = p.length; ; left -= 255) {
      lacing.push(Math.min(left, 255));
      if (left < 255) break;
    }
  }
  const head = Buffer.alloc(27);
  head.write('OggS');
  head[5] = flags;
  head.writeBigUInt64LE(BigInt(granule), 6);
  head.writeUInt32LE(serial, 14);
  head.writeUInt32LE(sequence, 18);
  head[26] = lacing.length;
  const all = Buffer.concat([head, Buffer.from(lacing), ...packets]);
  all.writeUInt32LE(oggCrc(all), 22);
  return all;
}

function writeChunk(packets: Buffer[], preSkip: number): Buffer {
  const opusHead = Buffer.concat([
    Buffer.from('OpusHead'), Buffer.from([1, 1]), Buffer.from([preSkip & 255, preSkip >> 8]),
    le32(RATE), Buffer.from([0, 0, 0]),
  ]);
  const tags = Buffer.concat([Buffer.from('OpusTags'), le32(3), Buffer.from('m1 '), le32(0)]);
  const pages = [page(1, 0, 2, 0, [opusHead]), page(1, 1, 0, 0, [tags])];
  let sequence = 2;
  for (let i = 0; i < packets.length; i += 50) {
    const end = Math.min(i + 50, packets.length);
    pages.push(page(1, sequence++, end === packets.length ? 4 : 0, end * FRAME, packets.slice(i, end)));
  }
  return Buffer.concat(pages);
}

async function cutFromOneEncode(
  encoded: Buffer, dir: string, overlap: number,
): Promise<{ path: string; startMs: number }[]> {
  await mkdir(dir, { recursive: true });
  const { preSkip, packets } = readPackets(encoded);
  const shiftMs = (preSkip / RATE) * 1000;
  const chunks: { path: string; startMs: number }[] = [];
  for (let k = 0; k * CHUNK_PACKETS < packets.length; k++) {
    const path = join(dir, `${k}.opus`);
    const from = k ? k * CHUNK_PACKETS - overlap : 0;
    const part = packets.slice(from, (k + 1) * CHUNK_PACKETS);
    // The first chunk keeps the encoder's delay; later ones skip only what they repeat.
    await writeFile(path, writeChunk(part, k ? overlap * FRAME : preSkip));
    chunks.push({ path, startMs: k ? k * 5000 - shiftMs : 0 });
  }
  return chunks;
}

async function freshStarts(pcm: Buffer, dir: string): Promise<{ path: string; startMs: number }[]> {
  await mkdir(dir, { recursive: true });
  const bytes = 2 * FRAME * CHUNK_PACKETS;
  const chunks: { path: string; startMs: number }[] = [];
  for (let k = 0; k * bytes < pcm.length; k++) {
    const path = join(dir, `${k}.opus`);
    const slice = pcm.subarray(k * bytes, (k + 1) * bytes);
    execFileSync(tools.ffmpeg, [
      '-nostdin', '-v', 'error', '-y', '-f', 'wav', '-i', 'pipe:0', ...ENCODE, path,
    ], { input: Buffer.concat([wavHeader(slice.length), slice]) });
    chunks.push({ path, startMs: k * 5000 });
  }
  return chunks;
}

// The bundled ffmpeg reads WAV but not raw PCM.
function wavHeader(bytes: number): Buffer {
  const h = Buffer.alloc(WAV_HEADER);
  h.write('RIFF');
  h.writeUInt32LE(36 + bytes, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(bytes, 40);
  return h;
}

function samples(file: Buffer): Int16Array {
  const body = file.subarray(WAV_HEADER);
  return new Int16Array(body.buffer, body.byteOffset, Math.floor(body.length / 2));
}

/** Difference from the uncut encode, within 10 ms of a join against everywhere else. */
function joinDamage(control: Int16Array, cut: Int16Array, chunkMs = 5000): unknown {
  const rate = 16;
  let nearSum = 0, nearCount = 0, farSum = 0, farCount = 0, zeroRuns = 0;
  const n = Math.min(control.length, cut.length);
  for (let i = 0; i < n; i++) {
    const position = i % (chunkMs * rate);
    const near = position < 10 * rate || position >= (chunkMs - 10) * rate;
    const d = (control[i]! - cut[i]!) ** 2;
    if (near) { nearSum += d; nearCount++; } else { farSum += d; farCount++; }
    if (cut[i] === 0 && cut[i + 1] === 0 && control[i] !== 0) zeroRuns++;
  }
  const near = Math.sqrt(nearSum / nearCount);
  const far = Math.sqrt(farSum / farCount);
  return { nearRms: Math.round(near * 10) / 10, farRms: Math.round(far * 10) / 10, ratio: Math.round((near / far) * 100) / 100, zeroRuns };
}

function score(script: string, args: string[]): unknown {
  const out = execFileSync('python3', ['-I', join(scripts, script), ...args], { encoding: 'utf8' });
  return JSON.parse(out.trim().split('\n').at(-1)!);
}

async function measure(meeting: string, name: string, wavPath: string, work: string): Promise<FinalTranscript> {
  const t = await runFinalPass({
    tools, models, tracks: [{ kind: 'meeting', source: { wavPath } }], workDir: join(work, `${name}-final`),
  });
  const words = join(work, `${name}.txt`);
  await writeFile(words, t.words.map((w) => w.text).join(' '));
  const spans = join(work, `${name}.der.txt`);
  await writeFile(spans, t.spans.map((s) => `${s.startMs / 1000} ${s.endMs / 1000} ${s.speakerId}`).join('\n') + '\n');
  console.log(JSON.stringify({
    meeting, writer: name, words: t.words.length, speakers: t.speakers.length,
    wer: score('score_ami_wer.py', [join(ami, 'ann'), meeting, words]),
    der: score('score_der.py', [join(ami, 'ann/segments'), meeting, spans]),
  }));
  return t;
}

for (const meeting of meetings) {
  const work = join(workRoot, meeting);
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  const source = join(ami, `${meeting}.Mix-Headset.wav`);
  const sourceWav = join(work, 'source.wav');
  execFileSync(tools.ffmpeg, [
    '-nostdin', '-v', 'error', '-y', '-i', source, '-ac', '1', '-ar', String(RATE), '-c:a', 'pcm_s16le', '-bitexact',
    '-map_metadata', '-1', sourceWav,
  ]);
  const pcm = (await readFile(sourceWav)).subarray(WAV_HEADER);
  const whole = join(work, 'whole.opus');
  execFileSync(tools.ffmpeg, [
    '-nostdin', '-v', 'error', '-y', '-i', sourceWav, ...ENCODE, whole,
  ]);
  const controlWav = join(work, 'control.wav');
  execFileSync(tools.ffmpeg, [
    '-nostdin', '-v', 'error', '-y', '-i', whole, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-bitexact',
    '-map_metadata', '-1', controlWav,
  ]);
  const encoded = await readFile(whole);
  const writers = {
    simple: await cutFromOneEncode(encoded, join(work, 'simple'), 0),
    overlap: await cutFromOneEncode(encoded, join(work, 'overlap'), OVERLAP_PACKETS),
    fresh: await freshStarts(pcm, join(work, 'fresh')),
  };
  await measure(meeting, 'control', controlWav, work);
  const control = samples(await readFile(controlWav));
  for (const [name, list] of Object.entries(writers)) {
    const wavPath = join(work, `${name}.wav`);
    await assembleChunks(tools, list.map((c) => ({ ...c, durationMs: 5000 })), wavPath);
    console.log(JSON.stringify({ meeting, writer: name, chunks: list.length, join: joinDamage(control, samples(await readFile(wavPath))) }));
    await measure(meeting, name, wavPath, work);
  }
}
