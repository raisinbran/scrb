import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MODEL_RATE, decodeChunk, pcmToWav } from './audio.js';
import type { ModelPaths, ToolPaths } from './config.js';
import { SherpaWorker } from './sherpa.js';
import { LiveClusterer, type LiveMerge, type Span } from './speakers.js';
import type { AudioChunk, TrackKind } from './types.js';
import { LiveWhisper, detectSpeech, type LiveWhisperOptions } from './whisper.js';

/** Phase 0 inc mode: every 5 s, segment the last 10 s and embed each new segment. */
const WINDOW_MS = 10_000;
const MIN_EMBED_MS = 1500;
/** Silence after a segment before it counts as finished (Phase 0 replay). */
const SETTLE_MS = 300;
/** Long speech is cut here rather than holding text back. */
const MAX_SEGMENT_MS = 15_000;
const KEEP_SPANS_MS = 120_000;
const MAX_RESTARTS = 3;

export interface LiveSegment {
  id: string;
  track: TrackKind;
  startMs: number;
  endMs: number;
  text: string;
  speakerId: string;
  /** "You", "Meeting", "Speaker N" or "Speaker ?". */
  speakerLabel: string;
  provisional: true;
}

export interface LiveLag {
  /** Oldest unprocessed audio's age behind the newest saved audio. */
  lagMs: number;
  queuedChunks: number;
}

export interface LiveEvents {
  onSegment?: (s: LiveSegment) => void;
  onMerge?: (m: LiveMerge) => void;
  /** A stretch of the meeting track attributed to a speaker. */
  onSpeakerSpan?: (s: Span) => void;
  onSkipped?: (track: TrackKind, startMs: number, endMs: number) => void;
  onLag?: (lag: LiveLag) => void;
  /** The live pass stopped for good; the recording is unaffected. */
  onFailed?: (reason: string) => void;
}

export interface LivePassOptions extends LiveEvents {
  tools: ToolPaths;
  models: ModelPaths;
  workDir: string;
  whisper?: Pick<LiveWhisperOptions, 'threads' | 'useGpu' | 'audioContext' | 'language'>;
  /** Off, or on sherpa failure, the meeting track is labeled "Meeting". */
  diarizeMeeting?: boolean;
  sherpaThreads?: number;
  /** Chunks held per track; past this the oldest are skipped. */
  maxQueuedChunks?: number;
  /** Test hook for the whisper-server restart path. */
  startWhisper?: () => Promise<LiveWhisper>;
}

interface TrackState {
  kind: TrackKind;
  queue: AudioChunk[];
  samples: Int16Array;
  /** Timeline position of samples[0]. */
  baseMs: number;
  nextEndMs: number | null;
  /** The last WINDOW_MS of audio for diarization, kept apart from `samples`. */
  recent: Int16Array;
  recentBaseMs: number;
}

function joined(a: Int16Array, b: Int16Array): Int16Array {
  const out = new Int16Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

/**
 * Bounded live pass.  It reads chunks the recording has already saved and is
 * told about them through addChunk, so it can lag, restart or die without the
 * recording noticing.  All model work is in child processes.
 */
export class LivePass {
  private readonly tracks = new Map<TrackKind, TrackState>();
  private readonly clusterer = new LiveClusterer();
  private spans: Span[] = [];
  private whisper: LiveWhisper | null = null;
  private sherpa: SherpaWorker | null = null;
  private running = false;
  private stopped = false;
  private busy = false;
  private wake: (() => void) | null = null;
  private loop: Promise<void> | null = null;
  private restarts = 0;
  private nextId = 1;
  private readonly maxQueued: number;

  constructor(private readonly o: LivePassOptions) {
    this.maxQueued = o.maxQueuedChunks ?? 6;
  }

  async start(): Promise<void> {
    await mkdir(this.o.workDir, { recursive: true });
    this.whisper = await this.startWhisper();
    if (this.o.diarizeMeeting !== false) {
      try {
        this.sherpa = await SherpaWorker.start(this.o.tools, this.o.models, this.o.sherpaThreads ?? 4);
      } catch {
        this.sherpa = null;
      }
    }
    this.running = true;
    this.loop = this.run();
  }

  private startWhisper(): Promise<LiveWhisper> {
    if (this.o.startWhisper) return this.o.startWhisper();
    return LiveWhisper.start(this.o.tools, { ...this.o.whisper, model: this.o.models.speechLive });
  }

  /** Call when the recording closes a chunk.  Never blocks and never throws. */
  addChunk(kind: TrackKind, chunk: AudioChunk): void {
    if (this.stopped) return;
    let track = this.tracks.get(kind);
    if (!track) {
      track = {
        kind, queue: [], samples: new Int16Array(0), baseMs: chunk.startMs, nextEndMs: null,
        recent: new Int16Array(0), recentBaseMs: chunk.startMs,
      };
      this.tracks.set(kind, track);
    }
    track.queue.push(chunk);
    while (track.queue.length > this.maxQueued) {
      const dropped = track.queue.shift()!;
      this.o.onSkipped?.(kind, dropped.startMs, dropped.startMs + dropped.durationMs);
    }
    this.reportLag();
    this.wake?.();
  }

  /** Resolves once everything queued so far has been processed. */
  async idle(): Promise<void> {
    while (this.busy || [...this.tracks.values()].some((t) => t.queue.length > 0)) {
      await new Promise((r) => setTimeout(r, 5));
    }
  }

  /** Waits for queued chunks to finish, then shuts down the workers. */
  async finish(): Promise<void> {
    this.stopped = true;
    this.running = false;
    this.wake?.();
    await this.loop;
    await this.shutdown();
  }

  /** Immediate stop. */
  async kill(): Promise<void> {
    this.stopped = true;
    this.running = false;
    this.whisper?.kill();
    this.sherpa?.kill();
    this.wake?.();
    await this.loop?.catch(() => undefined);
    await this.shutdown();
  }

  private async shutdown(): Promise<void> {
    this.whisper?.kill();
    await this.sherpa?.close().catch(() => undefined);
    this.whisper = null;
    this.sherpa = null;
    await rm(this.o.workDir, { recursive: true, force: true });
  }

  private reportLag(): void {
    let oldest = Infinity;
    let newest = 0;
    let queued = 0;
    for (const t of this.tracks.values()) {
      queued += t.queue.length;
      const head = t.queue[0];
      const tail = t.queue.at(-1);
      if (head) oldest = Math.min(oldest, head.startMs);
      if (tail) newest = Math.max(newest, tail.startMs + tail.durationMs);
    }
    this.o.onLag?.({ lagMs: queued ? newest - oldest : 0, queuedChunks: queued });
  }

  /** Oldest audio first, across tracks. */
  private nextChunk(): { track: TrackState; chunk: AudioChunk } | null {
    let pick: TrackState | null = null;
    for (const t of this.tracks.values()) {
      const head = t.queue[0];
      if (head && (!pick || head.startMs < pick.queue[0]!.startMs)) pick = t;
    }
    return pick ? { track: pick, chunk: pick.queue.shift()! } : null;
  }

  private async run(): Promise<void> {
    for (;;) {
      const next = this.nextChunk();
      if (!next) {
        if (!this.running) break;
        await new Promise<void>((resolve) => (this.wake = resolve));
        this.wake = null;
        continue;
      }
      this.busy = true;
      try {
        await this.process(next.track, next.chunk);
        this.reportLag();
      } catch (err) {
        if (!(await this.recover(err))) {
          this.busy = false;
          return;
        }
      }
      this.busy = false;
    }
    for (const t of this.tracks.values()) {
      try {
        await this.transcribeReady(t, true);
      } catch {
        // Shutting down; the final pass covers anything left.
      }
    }
  }

  /** Restarts whisper-server after a failure; the chunk in hand is skipped. */
  private async recover(err: unknown): Promise<boolean> {
    if (this.stopped && !this.running) return false;
    this.whisper?.kill();
    if (++this.restarts > MAX_RESTARTS) {
      this.giveUp(err);
      return false;
    }
    try {
      this.whisper = await this.startWhisper();
      return true;
    } catch (restartError) {
      this.giveUp(restartError);
      return false;
    }
  }

  private giveUp(err: unknown): void {
    this.stopped = true;
    for (const t of this.tracks.values()) t.queue = [];
    this.o.onFailed?.((err as Error).message);
  }

  private async process(track: TrackState, chunk: AudioChunk): Promise<void> {
    const pcm = await decodeChunk(this.o.tools, chunk.path);
    // A gap (pause, device change) ends the speech before it.
    if (track.nextEndMs !== null && Math.abs(chunk.startMs - track.nextEndMs) > 100) {
      await this.transcribeReady(track, true);
      track.samples = new Int16Array(0);
      track.recent = new Int16Array(0);
    }
    if (track.samples.length === 0) track.baseMs = chunk.startMs;
    if (track.recent.length === 0) track.recentBaseMs = chunk.startMs;
    track.samples = joined(track.samples, pcm);
    track.recent = joined(track.recent, pcm);
    const excess = track.recent.length - (WINDOW_MS * MODEL_RATE) / 1000;
    if (excess > 0) {
      track.recent = track.recent.slice(excess);
      track.recentBaseMs += (excess * 1000) / MODEL_RATE;
    }
    track.nextEndMs = chunk.startMs + chunk.durationMs;

    if (track.kind === 'meeting') await this.updateSpeakers(track, chunk);
    await this.transcribeReady(track, false);
  }

  private async updateSpeakers(track: TrackState, chunk: AudioChunk): Promise<void> {
    const sherpa = this.sherpa;
    if (!sherpa) return;
    try {
      const hopStart = chunk.startMs;
      const hopEnd = chunk.startMs + chunk.durationMs;
      const windowStart = track.recentBaseMs;
      const window = this.floats(track, windowStart, hopEnd);
      if (window.length === 0) return;
      const local = await sherpa.diarizeWindow(window);
      for (const s of local) {
        const a = Math.max(windowStart + s.start * 1000, hopStart);
        const b = Math.min(windowStart + s.end * 1000, hopEnd);
        if (b - a <= 50) continue;
        const mid = (a + b) / 2;
        const half = Math.max(MIN_EMBED_MS / 2, (b - a) / 2);
        const audio = this.floats(track, mid - half, mid + half);
        const vector = await sherpa.embedPcm(audio);
        if (!vector) continue;
        const speakerId = this.clusterer.add(vector, b - a);
        this.spans.push({ startMs: a, endMs: b, speakerId });
        this.o.onSpeakerSpan?.({ startMs: a, endMs: b, speakerId });
      }
      for (const m of this.clusterer.mergeConverged()) {
        this.o.onMerge?.(m);
        for (const s of this.spans) if (s.speakerId === m.from) s.speakerId = m.into;
      }
      const keepFrom = hopEnd - KEEP_SPANS_MS;
      this.spans = this.spans.filter((s) => s.endMs >= keepFrom);
    } catch {
      this.sherpa?.kill();
      this.sherpa = null; // Fall back to the plain "Meeting" label.
    }
  }

  private floats(track: TrackState, startMs: number, endMs: number): Float32Array {
    const a = Math.max(0, Math.round(((startMs - track.recentBaseMs) * MODEL_RATE) / 1000));
    const b = Math.min(track.recent.length, Math.round(((endMs - track.recentBaseMs) * MODEL_RATE) / 1000));
    const out = new Float32Array(Math.max(0, b - a));
    for (let i = 0; i < out.length; i++) out[i] = track.recent[a + i]! / 32768;
    return out;
  }

  private async transcribeReady(track: TrackState, flush: boolean): Promise<void> {
    if (track.samples.length === 0) return;
    const bufferMs = (track.samples.length / MODEL_RATE) * 1000;
    const wav = join(this.o.workDir, `vad-${track.kind}.wav`);
    await writeFile(wav, pcmToWav(track.samples));
    const spans = await detectSpeech(this.o.tools, this.o.models.vad, wav);
    let consumedMs = 0;
    for (const span of spans) {
      const finished = span.endMs + SETTLE_MS <= bufferMs;
      const tooLong = span.endMs - span.startMs >= MAX_SEGMENT_MS;
      if (!flush && !finished && !tooLong) break;
      await this.transcribeSpan(track, span.startMs, span.endMs);
      consumedMs = span.endMs;
    }
    // With no speech pending, keep a little tail for a word starting at the edge.
    const open = spans.find((s) => s.endMs > consumedMs);
    const dropTo = flush
      ? bufferMs
      : open
        ? Math.max(consumedMs, open.startMs)
        : Math.max(consumedMs, bufferMs - 1000);
    const dropSamples = Math.round((dropTo * MODEL_RATE) / 1000);
    track.samples = track.samples.slice(dropSamples);
    track.baseMs += dropTo;
  }

  private async transcribeSpan(track: TrackState, startMs: number, endMs: number): Promise<void> {
    const a = Math.round((startMs * MODEL_RATE) / 1000);
    const b = Math.round((endMs * MODEL_RATE) / 1000);
    const text = await this.whisper!.transcribe(track.samples.subarray(a, b));
    if (!text || /^[\[(].*[\])]$/.test(text)) return;
    const absStart = track.baseMs + startMs;
    const absEnd = track.baseMs + endMs;
    const { speakerId, speakerLabel } = this.labelFor(track.kind, absStart, absEnd);
    this.o.onSegment?.({
      id: `live-seg-${this.nextId++}`,
      track: track.kind,
      startMs: absStart,
      endMs: absEnd,
      text,
      speakerId,
      speakerLabel,
      provisional: true,
    });
  }

  private labelFor(kind: TrackKind, startMs: number, endMs: number): { speakerId: string; speakerLabel: string } {
    if (kind === 'mic') return { speakerId: 'you', speakerLabel: 'You' };
    const overlap = new Map<string, number>();
    for (const s of this.spans) {
      const ms = Math.min(s.endMs, endMs) - Math.max(s.startMs, startMs);
      if (ms > 0) overlap.set(s.speakerId, (overlap.get(s.speakerId) ?? 0) + ms);
    }
    const best = [...overlap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!best) return { speakerId: 'meeting', speakerLabel: this.sherpa ? 'Speaker ?' : 'Meeting' };
    return { speakerId: this.clusterer.resolve(best), speakerLabel: this.clusterer.label(best) };
  }
}
