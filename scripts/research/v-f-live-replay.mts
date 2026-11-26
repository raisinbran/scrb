import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MeetingDiarizer } from '../../packages/transcription/src/meetingDiarizer.js';
import { SherpaWorker } from '../../packages/transcription/src/sherpa.js';
import { toolsIn } from '../../packages/transcription/src/config.js';
import type { TimedLiveSegment } from '../../packages/transcription/src/livePcmEngine.js';
import { createAmiWorkspace, readAmiSegmentAnnotations } from './ami_remote_workspace.mjs';

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

try {
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
  const annotations = await readAmiSegmentAnnotations(workspace.ami, meeting);
  const references = annotations.map(({ xml }) =>
    [...xml.matchAll(/<segment\b[^>]*>/g)].map(([tag]) => [
      Number(tag.match(/transcriber_start="([^"]+)"/)?.[1]) - start,
      Number(tag.match(/transcriber_end="([^"]+)"/)?.[1]) - start,
    ]),
  );
  const labels = [...segments.values()].flatMap((s) => s.wordSpeakers ?? []);
  assert.equal(labels.length, 600);
  const resolve = (id: string) => {
    while (aliases.has(id)) id = aliases.get(id)!;
    return id;
  };
  const totals = references.map(() => 0);
  const scored = references.map(() => new Map<string, number>());
  for (let tick = 0; tick < 6000; tick++) {
    const time = (tick + 0.5) / 100;
    const active = references.map((turns) => turns.some(([a, b]) => a <= time && time < b));
    active.forEach((isActive, i) => {
      if (isActive) totals[i]++;
    });
    if (active.filter(Boolean).length !== 1) continue;
    const counts = scored[active.indexOf(true)]!;
    const id = resolve(labels[Math.floor(tick / 10)]!.id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const sustained = scored.filter((_, i) => totals[i]! >= 500);
  assert.equal(sustained.length, 2);
  const voices = sustained.map((counts) => {
    const seconds = [...counts.values()].reduce((sum, n) => sum + n, 0) / 100;
    const unassigned = (counts.get('meeting') ?? 0) / 100;
    counts.delete('meeting');
    const ranked = [...counts].sort((a, b) => b[1] - a[1]);
    const [id, ticks] = ranked[0] ?? ['', 0];
    const dominant = ticks / 100;
    return { id: ranked[1]?.[1] === ticks ? '' : id, seconds, dominant, unassigned };
  });
  const separated = Number(
    voices[0]!.id !== voices[1]!.id &&
      voices.every(({ id, seconds, dominant }) => id && dominant >= Math.max(1, seconds * 0.25)),
  );
  const assigned = labels.filter(({ id }) => id !== 'meeting');
  const ids = new Set(assigned.map(({ id }) => resolve(id))).size;
  const promoted = new Set(
    assigned.filter(({ label }) => /^Speaker [0-9]+$/.test(label)).map(({ id }) => resolve(id)),
  ).size;
  console.log(
    JSON.stringify({
      meeting,
      start,
      threshold,
      hops,
      separated,
      ids,
      promoted,
      voices: voices.map(({ seconds, dominant, unassigned }) => ({
        seconds,
        dominant,
        unassigned,
      })),
      elapsedMs: Math.round(performance.now() - started),
    }),
  );
} finally {
  diarizer.close();
  await workspace.cleanup();
}
