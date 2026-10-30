import { mkdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { assembleChunks } from './audio.js';
import type { ModelPaths, ToolPaths } from './config.js';
import { SherpaWorker, type RawSegment } from './sherpa.js';
import {
  assignSpeakers,
  embeddingSpans,
  relabelClusters,
  unit,
  type RawCluster,
  type RelabelOptions,
  type Span,
} from './speakers.js';
import type {
  FinalPhase,
  FinalSpeaker,
  FinalTranscript,
  Progress,
  SpeakerSpan,
  TrackInput,
  TrackKind,
  Turn,
  Word,
} from './types.js';
import { transcribeWholeFile, type WhisperWord } from './whisper.js';

/** Sherpa runs under the usable band on purpose; speakers are merged afterwards. */
export const OVERSPLIT_THRESHOLD = 1.0;
const TURN_GAP_MS = 1500;
export const YOU_ID = 'you';

export interface FinalPassOptions {
  tools: ToolPaths;
  models: ModelPaths;
  tracks: TrackInput[];
  /** Scratch space; removed when the pass ends. */
  workDir: string;
  threads?: number;
  useGpu?: boolean;
  language?: string;
  vocabularyHint?: string;
  relabel?: RelabelOptions;
  signal?: AbortSignal;
  onProgress?: (p: Progress<FinalPhase>) => void;
}

interface TrackResult {
  kind: TrackKind;
  wavPath: string;
  words: WhisperWord[];
}

/**
 * Words, timing and speakers for a whole meeting.  Stages run one after the
 * other in child processes, each exiting before the next starts, so only one
 * large model is ever loaded.
 */
export async function runFinalPass(o: FinalPassOptions): Promise<FinalTranscript> {
  await mkdir(o.workDir, { recursive: true });
  try {
    const threads = o.threads ?? 4;
    const report = (phase: FinalPhase, fraction: number): void => o.onProgress?.({ phase, fraction });

    const prepared: { kind: TrackKind; wavPath: string }[] = [];
    for (const [i, track] of o.tracks.entries()) {
      if ('wavPath' in track.source) {
        prepared.push({ kind: track.kind, wavPath: track.source.wavPath });
        continue;
      }
      const wavPath = join(o.workDir, `track-${i}.wav`);
      report('assembling', i / o.tracks.length);
      await assembleChunks(o.tools, track.source.chunks, wavPath, o.signal);
      prepared.push({ kind: track.kind, wavPath });
    }

    const transcribeStart = Date.now();
    const results: TrackResult[] = [];
    for (const [i, track] of prepared.entries()) {
      const words = await transcribeWholeFile(o.tools, track.wavPath, o.workDir, {
        model: o.models.speechFinal,
        vadModel: o.models.vad,
        threads,
        ...(o.useGpu === undefined ? {} : { useGpu: o.useGpu }),
        ...(o.language ? { language: o.language } : {}),
        ...(o.vocabularyHint ? { prompt: o.vocabularyHint } : {}),
        ...(o.signal ? { signal: o.signal } : {}),
        onFraction: (f) => report('transcribing', (i + f) / prepared.length),
      });
      results.push({ kind: track.kind, wavPath: track.wavPath, words });
    }
    const transcribeMs = Date.now() - transcribeStart;

    const diarizeStart = Date.now();
    const meeting = results.find((r) => r.kind === 'meeting');
    const speakers = meeting
      ? await diarizeTrack(o, meeting.wavPath, threads, (f) => report('diarizing', f))
      : { spans: [], speakers: [] };
    const diarizeMs = Date.now() - diarizeStart;

    const transcript = assemble(results, speakers.spans, speakers.speakers);
    report('done', 1);
    return {
      ...transcript,
      models: {
        speech: basename(o.models.speechFinal),
        segmentation: basename(o.models.segmentation),
        embedding: basename(o.models.embedding),
      },
      timing: { transcribeMs, diarizeMs },
    };
  } finally {
    await rm(o.workDir, { recursive: true, force: true });
  }
}

async function diarizeTrack(
  o: FinalPassOptions,
  wavPath: string,
  threads: number,
  onFraction: (fraction: number) => void,
): Promise<{ spans: SpeakerSpan[]; speakers: FinalSpeaker[] }> {
  const sherpa = await SherpaWorker.start(o.tools, o.models, threads, o.signal);
  try {
    const raw = await sherpa.diarizeFile(wavPath, OVERSPLIT_THRESHOLD, onFraction);
    const toEmbed = embeddingSpans(raw);
    const vectors = await sherpa.embedSpans(wavPath, toEmbed);
    await sherpa.close();
    const embedded = toEmbed.flatMap((s, i) =>
      vectors[i] ? [{ segment: s, vector: vectors[i] }] : [],
    );
    return decideSpeakers(raw, embedded, o.relabel);
  } catch (err) {
    sherpa.kill();
    throw err;
  }
}

export interface EmbeddedSegment {
  segment: RawSegment;
  vector: number[];
}

/** Pure final relabel: raw diarization plus embeddings to named-by-number speakers. */
export function decideSpeakers(
  raw: RawSegment[],
  embedded: EmbeddedSegment[],
  relabel: RelabelOptions = {},
): { spans: SpeakerSpan[]; speakers: FinalSpeaker[] } {
  const clusters = new Map<number, RawCluster & { sum: number[] | null }>();
  for (const s of raw) {
    const c = clusters.get(s.speaker);
    const ms = (s.end - s.start) * 1000;
    if (c) c.speechMs += ms;
    else {
      clusters.set(s.speaker, {
        raw: s.speaker, speechMs: ms, embedding: null, embeddedSegments: 0, sum: null,
      });
    }
  }
  for (const { segment, vector } of embedded) {
    const c = clusters.get(segment.speaker);
    if (!c) continue;
    const weight = segment.end - segment.start;
    c.sum ??= vector.map(() => 0);
    for (let i = 0; i < vector.length; i++) c.sum[i]! += vector[i]! * weight;
    c.embeddedSegments++;
  }
  for (const c of clusters.values()) if (c.sum) c.embedding = unit(c.sum);

  const map = relabelClusters([...clusters.values()], relabel);
  const id = (index: number): string => `speaker-${index + 1}`;
  const spans: SpeakerSpan[] = raw
    .map((s) => ({
      startMs: Math.round(s.start * 1000),
      endMs: Math.round(s.end * 1000),
      speakerId: id(map.get(s.speaker) ?? 0),
    }))
    .sort((a, b) => a.startMs - b.startMs);

  const totals = new Map<number, { speechMs: number; sum: number[] | null; segments: number }>();
  for (const c of clusters.values()) {
    const index = map.get(c.raw) ?? 0;
    const t = totals.get(index) ?? { speechMs: 0, sum: null, segments: 0 };
    t.speechMs += c.speechMs;
    if (c.sum) {
      const sum = c.sum;
      t.sum = t.sum ? t.sum.map((x, i) => x + sum[i]!) : [...sum];
      t.segments += c.embeddedSegments;
    }
    totals.set(index, t);
  }
  const speakers: FinalSpeaker[] = [...totals.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, t]) => ({
      id: id(index),
      label: `Speaker ${index + 1}`,
      speechMs: Math.round(t.speechMs),
      ...(t.sum ? { embedding: unit(t.sum) } : {}),
      embeddingSegments: t.segments,
    }));
  return { spans, speakers };
}

function assemble(
  tracks: TrackResult[],
  spans: Span[],
  speakers: FinalSpeaker[],
): Pick<FinalTranscript, 'version' | 'durationMs' | 'words' | 'turns' | 'speakers' | 'spans'> {
  const words: Word[] = [];
  const all = [...speakers];
  for (const t of tracks) {
    if (t.kind === 'mic') {
      for (const w of t.words) words.push({ ...w, track: 'mic', speakerId: YOU_ID });
      if (t.words.length > 0) {
        all.unshift({ id: YOU_ID, label: 'You', speechMs: speechOf(t.words), embeddingSegments: 0 });
      }
    } else {
      const ids = assignSpeakers(t.words, spans, 'speaker-1');
      t.words.forEach((w, i) => words.push({ ...w, track: 'meeting', speakerId: ids[i]! }));
    }
  }
  words.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const lastSpan = spans.reduce((end, s) => Math.max(end, s.endMs), 0);
  return {
    version: 1,
    durationMs: Math.max(words.at(-1)?.endMs ?? 0, lastSpan),
    words,
    turns: buildTurns(words),
    speakers: all,
    spans: spans.map(({ startMs, endMs, speakerId }) => ({ startMs, endMs, speakerId })),
  };
}

function speechOf(words: WhisperWord[]): number {
  return words.reduce((sum, w) => sum + (w.endMs - w.startMs), 0);
}

export function buildTurns(words: Word[]): Turn[] {
  const turns: Turn[] = [];
  let open: { turn: Turn; texts: string[] } | null = null;
  const close = (): void => {
    if (!open) return;
    open.turn.text = open.texts.join(' ');
    turns.push(open.turn);
    open = null;
  };
  words.forEach((w, i) => {
    if (open && (open.turn.speakerId !== w.speakerId || w.startMs - open.turn.endMs > TURN_GAP_MS)) {
      close();
    }
    if (!open) {
      open = {
        turn: { speakerId: w.speakerId, startMs: w.startMs, endMs: w.endMs, text: '', firstWord: i, wordCount: 0 },
        texts: [],
      };
    }
    open.texts.push(w.text);
    open.turn.endMs = Math.max(open.turn.endMs, w.endMs);
    open.turn.wordCount++;
  });
  close();
  return turns;
}
