import type { TimedLiveSegment } from './livePcmEngine.js';
import { pcmEndNs, type LivePcmFrame } from './livePcmProtocol.js';
import { LiveClusterer, type Span } from './speakers.js';
import type { LiveTrace } from './liveTrace.js';
import type { RawSegment } from './sherpa.js';

export interface SpeakerModel {
  diarizeWindow(samples: Float32Array): Promise<RawSegment[]>;
  embedPcm(samples: Float32Array): Promise<number[] | null>;
  kill(): void;
}

/** Speaker inference has no input credit and cannot hold ASR or a frame ACK. */
export class MeetingDiarizer {
  private readonly ring = new Int16Array(160_000);
  private used = 0;
  private cursor = 0;
  private endNs = 0;
  private generation = -1;
  private sequence = -1;
  private nextHopMs = 0;
  private countedMs = 0;
  private epoch = 0;
  private busy = false;
  private disabled = false;
  private pending: Promise<void> = Promise.resolve();
  private closed = false;
  private model: SpeakerModel | undefined;
  private abort = new AbortController();
  private allocated = 0;
  private mergeOrder = 0;
  private dimensions = 0;
  private readonly clusters = new LiveClusterer();
  private spans: Span[] = [];
  private readonly recent = new Map<string, TimedLiveSegment>();

  constructor(
    private readonly start: (signal: AbortSignal) => Promise<SpeakerModel>,
    private readonly update: (segment: TimedLiveSegment) => void,
    private readonly trace?: LiveTrace,
    private readonly merge?: (request: {
      from: string;
      into: string;
      generation: number;
      order: number;
      label: string;
    }) => void,
  ) {}

  push(frame: LivePcmFrame): void {
    if (this.closed || frame.track !== 'meeting') return;
    if (
      frame.generation !== this.generation ||
      frame.startNs !== this.endNs ||
      frame.sequence !== this.sequence + 1 ||
      frame.boundary
    ) {
      this.reset();
      this.disabled = false;
      this.generation = frame.generation;
      this.nextHopMs = frame.startNs / 1e6 + 5000;
      this.countedMs = frame.startNs / 1e6;
    }
    this.sequence = frame.sequence;
    this.endNs = pcmEndNs(frame);
    if (frame.boundary) return;
    for (const sample of frame.samples) {
      this.ring[this.cursor] = sample;
      this.cursor = (this.cursor + 1) % this.ring.length;
      this.used = Math.min(this.used + 1, this.ring.length);
    }
    const endMs = this.endNs / 1e6;
    if (endMs < this.nextHopMs) return;
    this.nextHopMs = endMs + 5000;
    // No accumulating queue: a busy hop drops this opportunity.
    if (this.busy || this.disabled) return;
    const pcm = new Float32Array(this.used);
    const first = (this.cursor - this.used + this.ring.length) % this.ring.length;
    for (let i = 0; i < pcm.length; i++)
      pcm[i] = this.ring[(first + i) % this.ring.length]! / 32768;
    const epoch = this.epoch;
    this.busy = true;
    this.pending = this.hop(pcm, endMs, epoch);
  }

  private async hop(pcm: Float32Array, endMs: number, epoch: number): Promise<void> {
    const context = {
      track: 'meeting' as const,
      generation: this.generation,
      startNs: Math.round((endMs - pcm.length / 16) * 1e6),
      endNs: Math.round(endMs * 1e6),
    };
    this.trace?.record('speaker_start', context);
    const timer = setTimeout(() => {
      if (epoch === this.epoch) {
        this.reset();
        this.disabled = true;
      }
    }, 5000);
    timer.unref();
    const current = () => !this.closed && epoch === this.epoch;
    try {
      const model = this.model ?? (await this.start(this.abort.signal));
      if (!current()) {
        model.kill();
        return;
      }
      this.model = model;
      const raw = await model.diarizeWindow(pcm);
      if (!current()) return;
      const duration = pcm.length / 16;
      if (
        raw.length > 128 ||
        raw.some(
          (s) =>
            ![s.start, s.end, s.speaker].every(Number.isFinite) ||
            s.start < 0 ||
            s.end <= s.start ||
            s.end * 1000 > duration + 1 ||
            !Number.isInteger(s.speaker),
        )
      )
        throw new Error('Invalid speaker spans');
      const base = endMs - duration;
      const fresh: Span[] = [];
      const evidence: { embedding: number[]; speechMs: number; startMs: number; endMs: number }[] =
        [];
      const cutoff = Math.max(this.countedMs, endMs - 5000);
      for (const s of raw) {
        const startMs = base + s.start * 1000;
        const stopMs = base + s.end * 1000;
        const speechMs = stopMs - Math.max(startMs, cutoff);
        if (speechMs <= 0 || s.end - s.start < 1.5) continue;
        const embedding = await model.embedPcm(
          pcm.slice(Math.round(s.start * 16000), Math.round(s.end * 16000)),
        );
        if (!current()) return;
        if (
          !embedding ||
          !embedding.length ||
          embedding.length > 4096 ||
          !embedding.every(Number.isFinite) ||
          !embedding.some((v) => v !== 0)
        )
          continue;
        evidence.push({ embedding, speechMs, startMs, endMs: stopMs });
      }
      if (!current() || this.endNs / 1e6 - endMs >= 5000) return;
      if (
        evidence.some(
          (item) => item.embedding.length !== (this.dimensions || evidence[0]!.embedding.length),
        )
      )
        throw new Error('Inconsistent speaker embeddings');
      if (evidence.length) this.dimensions = evidence[0]!.embedding.length;
      for (const item of evidence) {
        if (this.allocated >= 256) break;
        const speakerId = this.clusters.add(item.embedding, item.speechMs);
        this.allocated = Math.max(this.allocated, Number(speakerId.slice(5)));
        fresh.push({ startMs: item.startMs, endMs: item.endMs, speakerId });
      }
      this.countedMs = endMs;
      const merges = this.clusters.mergeConverged();
      this.spans = fresh;
      this.trace?.record('speaker_end', {
        ...context,
        spanCount: fresh.length,
        bufferedMs: this.endNs / 1e6 - endMs,
      });
      for (const segment of this.recent.values()) {
        if (segment.endMs < endMs - 10_000) {
          this.recent.delete(segment.id);
          continue;
        }
        this.update(this.attribute(segment));
      }
      for (const m of merges)
        this.merge?.({
          ...m,
          generation: this.generation,
          order: ++this.mergeOrder,
          label: this.clusters.label(m.into),
        });
    } catch {
      this.trace?.record('speaker_error', { ...context, reason: 'failed' });
      if (current()) {
        this.reset();
        this.disabled = true;
      } // Speaker failure never escapes into transcription.
    } finally {
      clearTimeout(timer);
      if (epoch === this.epoch) this.busy = false;
    }
  }

  attribute(segment: TimedLiveSegment): TimedLiveSegment {
    if (segment.track !== 'meeting' || segment.generation !== this.generation) return segment;
    const wordSpeakers = segment.words.map((w) => {
      let best: Span | undefined;
      let overlap = 0;
      for (const span of this.spans) {
        const amount = Math.min(w.endMs, span.endMs) - Math.max(w.startMs, span.startMs);
        const midpoint = (w.startMs + w.endMs) / 2;
        if (amount > overlap || (!best && midpoint >= span.startMs && midpoint < span.endMs)) {
          best = span;
          overlap = Math.max(0, amount);
        }
      }
      const id = best ? this.clusters.resolve(best.speakerId) : 'meeting';
      return { id, label: best ? this.clusters.label(id) : 'Meeting' };
    });
    // Keep earlier confirmed spans when a new window contains no evidence for that word.
    const result = {
      ...segment,
      wordSpeakers: wordSpeakers.map((s, i) =>
        s.id === 'meeting'
          ? (() => {
              const prior = segment.wordSpeakers?.[i];
              return prior && prior.id !== 'meeting'
                ? { id: prior.id, label: this.clusters.label(prior.id) }
                : s;
            })()
          : s,
      ),
    };
    this.recent.set(segment.id, result);
    if (this.recent.size > 64) this.recent.delete(this.recent.keys().next().value!);
    return result;
  }

  /** Accelerated silent replays can drain speaker work without pacing live input. */
  waitForHop(): Promise<void> {
    return this.pending;
  }

  private reset(): void {
    this.epoch++;
    this.abort.abort();
    this.abort = new AbortController();
    this.model?.kill();
    this.model = undefined;
    this.used = this.cursor = 0;
    this.busy = false;
    this.spans = [];
    this.recent.clear();
  }

  close(): void {
    this.closed = true;
    this.reset();
  }
}
