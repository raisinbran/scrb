import type { LiveSegment } from './livePass.js';
import { LIVE_PCM_RATE, pcmEndNs, validPcmFrame, type LivePcmFrame } from './livePcmProtocol.js';
import type { TrackKind } from './types.js';
import type { VadSpan, WhisperWord } from './whisper.js';
import { spanKey, type LiveTrace, type TraceFields } from './liveTrace.js';

const HOP_MS = 500;
/** Longest detection hop while frames are waiting. Stays under MAX_SPEECH_MS, so one pass clears it. */
const BEHIND_HOP_MS = 2000;
const SETTLE_MS = 300;
const MAX_SPEECH_MS = 4000;
/** Longer losses cut the speech apart anyway, so they restart context as before. */
const MAX_BRIDGE_MS = 1000;
const NS_PER_SAMPLE = 62_500;

export interface TimedLiveSegment extends LiveSegment {
  sequence: number;
  words: WhisperWord[];
}

export interface LivePcmModels {
  detect(track: TrackKind, samples: Int16Array): Promise<VadSpan[]>;
  transcribe(samples: Int16Array): Promise<WhisperWord[]>;
}

export interface LiveSkip {
  track: TrackKind;
  startMs: number;
  endMs: number;
  reason: 'overflow' | 'gap' | 'worker' | 'closed';
}

/** Metadata for one reporting window; never carries audio or model output. */
export interface LiveTrackStats {
  vadCalls: number;
  vadEmpty: number;
  spans: number;
  modelCalls: number;
  modelEmpty: number;
  samples: number;
  rms: number;
  peak: number;
  /** Discontinuities kept in context, and those that restarted it. */
  bridgedGaps: number;
  resetGaps: number;
  gapMs: number;
  /** Frames the sequence numbers show as missing. */
  lostFrames: number;
  slowestHopMs: number;
}

interface Counts extends Omit<LiveTrackStats, 'rms'> {
  squares: number;
}

interface State {
  samples: Int16Array;
  baseMs: number;
  endNs: number;
  sequence: number;
  generation: number;
  sinceDetect: number;
  boundary: boolean;
  more?: boolean;
}

/** Runs only inside the isolated live process; no capture paths or durable files are accepted. */
export class LivePcmEngine {
  private tracks = new Map<TrackKind, State>();
  private counts = new Map<TrackKind, Counts>();
  private closed = false;
  private evaluation = 0;
  private call = 0;

  constructor(
    private readonly models: LivePcmModels,
    private readonly emit: (segment: TimedLiveSegment) => void,
    private readonly skip: (gap: LiveSkip) => void,
    private readonly trace?: LiveTrace,
  ) {}

  async push(frame: LivePcmFrame): Promise<void> {
    if (this.closed) return;
    if (!validPcmFrame(frame)) throw new Error('Invalid live frame');
    const startMs = frame.startNs / 1e6;
    let state = this.tracks.get(frame.track);
    if (
      state &&
      (frame.sequence <= state.sequence ||
        frame.startNs < state.endNs ||
        frame.generation < state.generation ||
        (state.boundary && !frame.boundary && frame.generation === state.generation))
    ) {
      throw new Error('Out-of-order live frame');
    }
    if (
      state &&
      (frame.sequence !== state.sequence + 1 ||
        frame.generation !== state.generation ||
        (!frame.boundary && frame.startNs !== state.endNs))
    ) {
      const missingNs = frame.startNs - state.endNs;
      const lost = frame.generation === state.generation;
      const counts = this.count(frame.track);
      if (lost) {
        counts.lostFrames += Math.max(0, frame.sequence - state.sequence - 1);
        counts.gapMs += missingNs / 1e6;
      }
      if (lost && !frame.boundary && missingNs <= MAX_BRIDGE_MS * 1e6) {
        counts.bridgedGaps += 1;
        if (missingNs > 0)
          this.skip({
            track: frame.track,
            startMs: state.endNs / 1e6,
            endMs: startMs,
            reason: 'gap',
          });
        this.bridge(state, missingNs);
      } else {
        if (lost) counts.resetGaps += 1;
        if (state.samples.length || frame.startNs > state.endNs)
          this.skip({
            track: frame.track,
            startMs: state.samples.length ? state.baseMs : state.endNs / 1e6,
            endMs: startMs,
            reason: 'gap',
          });
        state = undefined;
      }
    }
    if (!state) {
      state = {
        samples: new Int16Array(),
        baseMs: startMs,
        endNs: frame.startNs,
        sequence: frame.sequence,
        generation: frame.generation,
        sinceDetect: 0,
        boundary: false,
      };
      this.tracks.set(frame.track, state);
    }
    state.sequence = frame.sequence;
    state.more = frame.more === true;
    state.endNs = pcmEndNs(frame);
    if (frame.boundary) {
      await this.ready(frame.track, state, true);
      state.samples = new Int16Array();
      state.baseMs = startMs;
      state.sinceDetect = 0;
      state.boundary = true;
      return;
    }
    this.measure(frame.track, frame.samples);
    if (!state.samples.length) state.baseMs = startMs;
    const samples = new Int16Array(state.samples.length + frame.samples.length);
    samples.set(state.samples);
    samples.set(frame.samples, state.samples.length);
    state.samples = samples;
    state.sinceDetect += frame.samples.length;
    if (state.sinceDetect >= ((frame.more ? BEHIND_HOP_MS : HOP_MS) * LIVE_PCM_RATE) / 1000) {
      state.sinceDetect = 0;
      const startedAt = Date.now();
      await this.ready(frame.track, state, false);
      const counts = this.count(frame.track);
      counts.slowestHopMs = Math.max(counts.slowestHopMs, Date.now() - startedAt);
    }
  }

  close(): void {
    this.trace?.record('engine_stop', { reason: 'stopped' });
    this.closed = true;
    this.tracks.clear();
  }

  pendingStartNs(track: TrackKind): number {
    const state = this.tracks.get(track);
    return state ? Math.round(state.samples.length ? state.baseMs * 1e6 : state.endNs) : 0;
  }

  /** Silence stands for audio the timestamps prove is missing. Rounds down, so text never runs late. */
  private bridge(state: State, missingNs: number): void {
    if (!state.samples.length) return;
    const silence = Math.floor(missingNs / NS_PER_SAMPLE);
    const samples = new Int16Array(state.samples.length + silence);
    samples.set(state.samples);
    state.samples = samples;
    state.sinceDetect += silence;
  }

  takeStats(): Partial<Record<TrackKind, LiveTrackStats>> {
    const stats: Partial<Record<TrackKind, LiveTrackStats>> = {};
    for (const [track, { squares, ...counts }] of this.counts) {
      stats[track] = {
        ...counts,
        rms: counts.samples ? Math.round(Math.sqrt(squares / counts.samples)) : 0,
      };
    }
    this.counts.clear();
    return stats;
  }

  private count(track: TrackKind): Counts {
    let counts = this.counts.get(track);
    if (!counts) {
      counts = {
        vadCalls: 0,
        vadEmpty: 0,
        spans: 0,
        modelCalls: 0,
        modelEmpty: 0,
        samples: 0,
        squares: 0,
        peak: 0,
        bridgedGaps: 0,
        resetGaps: 0,
        gapMs: 0,
        lostFrames: 0,
        slowestHopMs: 0,
      };
      this.counts.set(track, counts);
    }
    return counts;
  }

  private measure(track: TrackKind, samples: Int16Array): void {
    const counts = this.count(track);
    counts.samples += samples.length;
    for (const sample of samples) {
      counts.squares += sample * sample;
      counts.peak = Math.max(counts.peak, Math.abs(sample));
    }
  }

  private async ready(track: TrackKind, state: State, flush: boolean): Promise<void> {
    if (!state.samples.length) return;
    const durationMs = (state.samples.length * 1000) / LIVE_PCM_RATE;
    const evaluation = this.evaluation++;
    const context: TraceFields = {
      track,
      sequence: state.sequence,
      generation: state.generation,
      startNs: Math.round(state.baseMs * 1e6),
      endNs: Math.round((state.baseMs + durationMs) * 1e6),
      evaluation,
      more: state.more === true,
      bufferedMs: durationMs,
      flush,
    };
    this.trace?.record('vad_start', context);
    let detected: VadSpan[];
    try {
      detected = await this.models.detect(track, state.samples);
    } catch (error) {
      this.trace?.record('vad_error', context);
      throw error;
    }
    this.trace?.record('vad_end', { ...context, spanCount: detected.length });
    if (this.closed) return;
    const counts = this.count(track);
    counts.vadCalls += 1;
    counts.spans += detected.length;
    if (!detected.length) counts.vadEmpty += 1;
    if (detected.length > 128) throw new Error('Invalid live VAD timing');
    const spans = detected.map((span) => {
      if (![span.startMs, span.endMs].every(Number.isFinite) || span.startMs >= durationMs) {
        throw new Error('Invalid live VAD timing');
      }
      return { startMs: span.startMs, endMs: Math.min(span.endMs, durationMs) };
    });
    let last = 0;
    for (const span of spans) {
      if (
        ![span.startMs, span.endMs].every(Number.isFinite) ||
        span.startMs < last ||
        span.endMs <= span.startMs ||
        span.endMs > durationMs
      )
        throw new Error('Invalid live VAD timing');
      last = span.endMs;
      this.trace?.record('vad_span', {
        ...context,
        startNs: Math.round((state.baseMs + span.startMs) * 1e6),
        endNs: Math.round((state.baseMs + span.endMs) * 1e6),
        spanId: spanKey(
          track,
          state.generation,
          state.baseMs + span.startMs,
          state.baseMs + span.endMs,
        ),
      });
    }
    if (!spans.length) this.trace?.record('defer', { ...context, reason: 'empty' });
    const candidates = flush
      ? spans.flatMap((span) => {
          const pieces: VadSpan[] = [];
          for (let startMs = span.startMs; startMs < span.endMs; startMs += MAX_SPEECH_MS) {
            pieces.push({ startMs, endMs: Math.min(span.endMs, startMs + MAX_SPEECH_MS) });
          }
          return pieces;
        })
      : spans;
    let consumed = 0;
    for (const span of candidates) {
      if (
        ![span.startMs, span.endMs].every(Number.isFinite) ||
        span.startMs < consumed ||
        span.endMs <= span.startMs ||
        span.endMs > durationMs
      )
        throw new Error('Invalid live VAD timing');
      if (
        !flush &&
        span.endMs + SETTLE_MS > durationMs &&
        span.endMs - span.startMs < MAX_SPEECH_MS
      ) {
        this.trace?.record('defer', {
          ...context,
          reason: 'settle',
          spanId: spanKey(
            track,
            state.generation,
            state.baseMs + span.startMs,
            state.baseMs + span.endMs,
          ),
        });
        break;
      }
      const endMs = Math.min(span.endMs, span.startMs + MAX_SPEECH_MS);
      const call = this.call++;
      const modelContext: TraceFields = {
        ...context,
        call,
        startNs: Math.round((state.baseMs + span.startMs) * 1e6),
        endNs: Math.round((state.baseMs + endMs) * 1e6),
        spanId: spanKey(track, state.generation, state.baseMs + span.startMs, state.baseMs + endMs),
        parentSpanId: spanKey(
          track,
          state.generation,
          state.baseMs + span.startMs,
          state.baseMs + span.endMs,
        ),
      };
      this.trace?.record('model_start', modelContext);
      let words: WhisperWord[];
      try {
        words = await this.models.transcribe(
          state.samples.slice(
            Math.round((span.startMs * LIVE_PCM_RATE) / 1000),
            Math.round((endMs * LIVE_PCM_RATE) / 1000),
          ),
        );
      } catch (error) {
        this.trace?.record('model_error', modelContext);
        throw error;
      }
      this.trace?.record('model_end', { ...modelContext, wordCount: words.length });
      if (this.closed) return;
      counts.modelCalls += 1;
      if (!words.length) counts.modelEmpty += 1;
      const maxMs = endMs - span.startMs;
      let previous = 0;
      const bounded = words.map((word) => {
        if (
          !word.text.trim() ||
          ![word.startMs, word.endMs, word.confidence].every(Number.isFinite) ||
          word.confidence < 0 ||
          word.confidence > 1
        )
          throw new Error('Invalid model word timing');
        const startMs = Math.max(previous, Math.min(maxMs, word.startMs));
        const endMs = Math.max(startMs, Math.min(maxMs, word.endMs));
        previous = endMs;
        return { ...word, startMs, endMs };
      });
      if (bounded.length) {
        const offset = state.baseMs + span.startMs;
        const absolute = bounded.map((w) => ({
          ...w,
          startMs: w.startMs + offset,
          endMs: w.endMs + offset,
        }));
        this.trace?.record('segment_emit', {
          ...modelContext,
          wordCount: absolute.length,
          segmentKey: `live-${track}-${state.sequence}-${consumed}`,
        });
        this.emit({
          id: `live-${track}-${state.sequence}-${consumed}`,
          track,
          sequence: state.sequence,
          startMs: absolute[0]!.startMs,
          endMs: absolute.at(-1)!.endMs,
          text: absolute.map((w) => w.text).join(' '),
          words: absolute,
          speakerId: track === 'mic' ? 'you' : 'meeting',
          speakerLabel: track === 'mic' ? 'You' : 'Meeting',
          provisional: true,
        });
      }
      consumed = endMs;
      if (endMs < span.endMs) break;
    }
    const remaining = spans.find((span) => span.endMs > consumed);
    const dropMs = flush
      ? durationMs
      : remaining
        ? Math.max(consumed, remaining.startMs)
        : Math.max(consumed, durationMs - SETTLE_MS);
    const drop = Math.round((dropMs * LIVE_PCM_RATE) / 1000);
    state.samples = state.samples.slice(drop);
    state.baseMs += (drop * 1000) / LIVE_PCM_RATE;
    if (state.samples.length > ((MAX_SPEECH_MS + HOP_MS) * LIVE_PCM_RATE) / 1000)
      throw new Error('Live audio budget exceeded');
  }
}
