import { mkdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { assembleChunks } from './audio.js';
import {
  echoLikeness,
  estimateLagMs,
  lagRange,
  readWavEnvelope,
  similarWord,
  type EchoLikeness,
} from './echoEnvelope.js';
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
// TS3003a: distinct sub-30 s voices far from every larger cluster were wrongly absorbed.
const FINAL_RELABEL_DEFAULTS: RelabelOptions = { minSpeakerMs: 13_000 };
const TURN_GAP_MS = 1500;
/** A mic word counts as room echo when the meeting track has the same word this close in time. */
export const ECHO_WINDOW_MS = 1000;
/** Echo needs this many matched mic words in a row, so a lone "yeah" from the user survives. */
const ECHO_MIN_RUN = 2;
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
    const report = (phase: FinalPhase, fraction: number): void =>
      o.onProgress?.({ phase, fraction });

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

    const micTrack = results.find((r) => r.kind === 'mic');
    const echoAudio =
      micTrack && meeting ? await readEchoAudio(micTrack.wavPath, meeting.wavPath) : undefined;
    const transcript = assemble(results, speakers.spans, speakers.speakers, echoAudio);
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
    return decideSpeakers(raw, embedded, { ...FINAL_RELABEL_DEFAULTS, ...o.relabel });
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
        raw: s.speaker,
        speechMs: ms,
        embedding: null,
        embeddedSegments: 0,
        sum: null,
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

  const map = relabelClusters([...clusters.values()], { ...FINAL_RELABEL_DEFAULTS, ...relabel });
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

export function assemble(
  tracks: TrackResult[],
  spans: Span[],
  speakers: FinalSpeaker[],
  echoAudio?: EchoAudio,
): Pick<FinalTranscript, 'version' | 'durationMs' | 'words' | 'turns' | 'speakers' | 'spans'> {
  const words: Word[] = [];
  const all = [...speakers];
  const meetingWords = tracks.filter((t) => t.kind === 'meeting').flatMap((t) => t.words);
  for (const t of tracks) {
    if (t.kind === 'mic') {
      t.words = dropRoomEcho(t.words, meetingWords, echoAudio);
      for (const w of t.words) words.push({ ...w, track: 'mic', speakerId: YOU_ID });
      if (t.words.length > 0) {
        all.unshift({
          id: YOU_ID,
          label: 'You',
          speechMs: speechOf(t.words),
          embeddingSegments: 0,
        });
      }
    } else {
      const ids = assignSpeakers(t.words, spans, 'speaker-1');
      t.words.forEach((w, i) => words.push({ ...w, track: 'meeting', speakerId: ids[i]! }));
    }
  }
  // Words stay grouped by track, each in time order, because a turn is a range of words.
  // One merged timeline made a mic that hears the room alternate with the meeting track,
  // one word per turn.  Turns are ordered by time instead.
  words.sort((a, b) => trackRank(a) - trackRank(b) || a.startMs - b.startMs || a.endMs - b.endMs);
  const lastSpan = spans.reduce((end, s) => Math.max(end, s.endMs), 0);
  return {
    version: 1,
    durationMs: words.reduce((end, w) => Math.max(end, w.endMs), lastSpan),
    words,
    turns: buildTurns(words).sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs),
    speakers: all,
    spans: spans.map(({ startMs, endMs, speakerId }) => ({ startMs, endMs, speakerId })),
  };
}

/** Loudness of both saved tracks; undefined when either is not a plain final-pass WAV. */
async function readEchoAudio(micPath: string, meetingPath: string): Promise<EchoAudio | undefined> {
  const [mic, meeting] = await Promise.all([
    readWavEnvelope(micPath),
    readWavEnvelope(meetingPath),
  ]);
  return mic && meeting ? { mic, meeting } : undefined;
}

const trackRank = (w: Word): number => (w.track === 'meeting' ? 0 : 1);

export const bare = (text: string): string => text.toLowerCase().replace(/[^a-z0-9']/g, '');

/** Loudness patterns (see echoEnvelope.ts) of the two saved tracks. */
export interface EchoAudio {
  mic: Float32Array;
  meeting: Float32Array;
}

/** A word whose own loudness follows the meeting's this closely is echo even if the text differs. */
const ENV_CORR = 0.8;
const ENV_SPREAD_DB = 5;
/** Echo has the room's gain; a word this much louder or quieter than that is not the same sound. */
const ENV_GAIN_DB = 6;
/** Looser bar for a word whose text already nearly matched. */
const FUZZY_CORR = 0.6;
/** Loudness-only echo words need this many in a row when no text-matched echo sits beside them. */
const ENV_ALONE_RUN = 3;

type EchoWord = { text: string; startMs: number; endMs?: number };

/**
 * Removes mic words that re-capture the meeting audio from the speakers.
 *
 * Text rule: runs of at least ECHO_MIN_RUN mic words, each at most TURN_GAP_MS after the
 * previous, that match distinct meeting words, within ECHO_WINDOW_MS, in the same order.
 * A match is exact, or a near spelling (a word heard slightly differently); a run of only
 * near spellings counts when `audio` shows their loudness following the meeting's.
 *
 * Loudness rule (needs `audio`): once the recording shows echo at a steady delay, a mic word
 * whose loudness pattern follows the meeting's at that delay is echo, if it sits in a chain
 * with text-matched echo or in a chain of ENV_ALONE_RUN such words.  The user's own words
 * over the meeting usually do not follow its pattern and are kept, but some are lost when
 * they are no louder than the echo.  Not an echo canceller.
 */
export function dropRoomEcho<W extends EchoWord>(
  mic: W[],
  meeting: { text: string; startMs: number }[],
  audio?: EchoAudio,
): W[] {
  const heard = [...meeting].sort((a, b) => a.startMs - b.startMs);
  const own = [...mic].sort((a, b) => a.startMs - b.startMs);
  const heardText = heard.map((m) => bare(m.text));
  // First meeting word that starts inside the window; only the window is scanned after it.
  const firstInWindow = (from: number): number => {
    let lo = 0;
    let hi = heard.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (heard[mid]!.startMs < from) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const heardAfter = (w: W, after: number): { k: number; near: boolean } | null => {
    const text = bare(w.text);
    const k0 = Math.max(after + 1, firstInWindow(w.startMs - ECHO_WINDOW_MS));
    let near = -1;
    for (let k = k0; k < heard.length && heard[k]!.startMs <= w.startMs + ECHO_WINDOW_MS; k++) {
      if (heardText[k] === text) return { k, near: false };
      if (near < 0 && similarWord(heardText[k]!, text)) near = k;
    }
    return near < 0 ? null : { k: near, near: true };
  };
  const endOf = (w: W): number => w.endMs ?? w.startMs + 300;
  const likeness = (w: W, range?: [number, number]): EchoLikeness | null =>
    audio ? echoLikeness(audio.mic, audio.meeting, w.startMs, endOf(w), ...(range ?? [])) : null;

  type Run = { word: W; near: boolean }[];
  const runs: Run[] = [];
  let run: Run = [];
  let last = -1;
  const endRun = (): void => {
    if (run.length >= ECHO_MIN_RUN) runs.push(run);
    run = [];
    last = -1;
  };
  for (const w of own) {
    if (run.length > 0 && w.startMs - run.at(-1)!.word.startMs > TURN_GAP_MS) endRun();
    if (!bare(w.text)) {
      endRun();
      continue;
    }
    let hit = heardAfter(w, last);
    if (!hit && run.length > 0) {
      endRun();
      hit = heardAfter(w, -1);
    }
    if (!hit) continue;
    run.push({ word: w, near: hit.near });
    last = hit.k;
  }
  endRun();

  const echo = new Set<W>();
  const certain: W[] = [];
  const nearOnly: Run[] = [];
  for (const r of runs) {
    if (r.some((x) => !x.near)) {
      for (const x of r) echo.add(x.word);
      for (const x of r) if (!x.near) certain.push(x.word);
    } else nearOnly.push(r);
  }
  if (!audio) return own.filter((w) => !echo.has(w));

  const room = estimateLagMs(
    audio.mic,
    audio.meeting,
    certain.map((w) => ({ startMs: w.startMs, endMs: endOf(w) })),
  );
  if (room === null) return own.filter((w) => !echo.has(w));
  const range = lagRange(room.lagMs);
  const follows = (w: W, corr: number): boolean => {
    const l = likeness(w, range);
    return (
      l !== null &&
      l.corr >= corr &&
      l.spreadDb <= ENV_SPREAD_DB &&
      Math.abs(l.offsetDb - room.offsetDb) <= ENV_GAIN_DB
    );
  };
  for (const r of nearOnly) {
    if (r.every((x) => follows(x.word, FUZZY_CORR))) for (const x of r) echo.add(x.word);
  }
  // Chains of consecutive mic words that are text echo or follow the meeting's loudness.
  let chain: { word: W; text: boolean }[] = [];
  const endChain = (): void => {
    const text = chain.filter((c) => c.text).length;
    const loud = chain.length - text;
    if (loud > 0 && (text > 0 || loud >= ENV_ALONE_RUN)) {
      for (const c of chain) echo.add(c.word);
    }
    chain = [];
  };
  for (const w of own) {
    if (chain.length > 0 && w.startMs - chain.at(-1)!.word.startMs > TURN_GAP_MS) endChain();
    if (echo.has(w)) chain.push({ word: w, text: true });
    else if (bare(w.text) && follows(w, ENV_CORR)) chain.push({ word: w, text: false });
    else endChain();
  }
  endChain();
  return own.filter((w) => !echo.has(w));
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
    if (
      open &&
      (open.turn.speakerId !== w.speakerId || w.startMs - open.turn.endMs > TURN_GAP_MS)
    ) {
      close();
    }
    if (!open) {
      open = {
        turn: {
          speakerId: w.speakerId,
          startMs: w.startMs,
          endMs: w.endMs,
          text: '',
          firstWord: i,
          wordCount: 0,
        },
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
