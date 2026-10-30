import type { RawSegment } from './sherpa.js';

export function dot(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  return dot(a, b) / (Math.sqrt(dot(a, a) * dot(b, b)) + 1e-9);
}

export function unit(v: readonly number[]): number[] {
  const norm = Math.sqrt(dot(v, v));
  return norm > 0 ? v.map((x) => x / norm) : [...v];
}

/** Phase 0: 0.5 tracks the speakers; 0.3--0.4 merges them, 0.55 over-splits. */
export const LIVE_JOIN_SIMILARITY = 0.5;
/** Phase 0: about 30 s of speech separates real speakers from stray clusters. */
export const NAMED_AFTER_MS = 30_000;
export const UNNAMED_LABEL = 'Speaker ?';

interface LiveSpeaker {
  id: string;
  /** Unnormalized sum of member embeddings, weighted by seconds. */
  centroid: number[];
  speechMs: number;
  mergedInto: string | null;
  /** Assigned once on reaching NAMED_AFTER_MS. */
  number: number | null;
}

export interface LiveMerge {
  from: string;
  into: string;
}

export interface LiveClusterOptions {
  joinSimilarity?: number;
  namedAfterMs?: number;
  /** Bound on stored speakers; the smallest unnamed ones go first. */
  maxSpeakers?: number;
}

/**
 * Incremental clustering for the live pass.  Each embedding joins the most
 * similar speaker at the join line or starts a new one; speakers whose
 * centroids converge are merged after each hop, which shows up as a relabel.
 */
export class LiveClusterer {
  private readonly speakers = new Map<string, LiveSpeaker>();
  private readonly changed = new Set<string>();
  private nextId = 1;
  private nextNumber = 1;
  private readonly joinSimilarity: number;
  private readonly namedAfterMs: number;
  private readonly maxSpeakers: number;

  constructor(options: LiveClusterOptions = {}) {
    this.joinSimilarity = options.joinSimilarity ?? LIVE_JOIN_SIMILARITY;
    this.namedAfterMs = options.namedAfterMs ?? NAMED_AFTER_MS;
    this.maxSpeakers = options.maxSpeakers ?? 256;
  }

  private active(): LiveSpeaker[] {
    return [...this.speakers.values()].filter((s) => s.mergedInto === null);
  }

  add(embedding: readonly number[], speechMs: number): string {
    let best: LiveSpeaker | undefined;
    let bestSim = -2;
    for (const s of this.active()) {
      const sim = cosine(embedding, s.centroid);
      if (sim > bestSim) {
        bestSim = sim;
        best = s;
      }
    }
    if (!best || bestSim < this.joinSimilarity) {
      best = {
        id: `live-${this.nextId++}`,
        centroid: embedding.map(() => 0),
        speechMs: 0,
        mergedInto: null,
        number: null,
      };
      this.speakers.set(best.id, best);
    }
    const weight = speechMs / 1000;
    for (let i = 0; i < embedding.length; i++) best.centroid[i]! += embedding[i]! * weight;
    best.speechMs += speechMs;
    this.changed.add(best.id);
    this.promote(best);
    return best.id;
  }

  private promote(s: LiveSpeaker): void {
    if (s.number === null && s.speechMs >= this.namedAfterMs) s.number = this.nextNumber++;
  }

  /** Call once per hop.  Only speakers touched since the last call can newly converge. */
  mergeConverged(): LiveMerge[] {
    const merges: LiveMerge[] = [];
    const pending = [...this.changed];
    this.changed.clear();
    while (pending.length > 0) {
      const id = this.resolve(pending.pop()!);
      const a = this.speakers.get(id)!;
      for (const b of this.active()) {
        if (b.id === a.id || cosine(a.centroid, b.centroid) < this.joinSimilarity) continue;
        const [keep, gone] = a.speechMs >= b.speechMs ? [a, b] : [b, a];
        for (let i = 0; i < keep.centroid.length; i++) keep.centroid[i]! += gone.centroid[i]!;
        keep.speechMs += gone.speechMs;
        // A label the user has already seen stays; the older number survives.
        if (gone.number !== null && (keep.number === null || gone.number < keep.number)) {
          keep.number = gone.number;
        }
        gone.mergedInto = keep.id;
        this.promote(keep);
        merges.push({ from: gone.id, into: keep.id });
        pending.push(keep.id);
        break;
      }
    }
    this.prune();
    return merges;
  }

  private prune(): void {
    const active = this.active();
    if (active.length <= this.maxSpeakers) return;
    const unnamed = active.filter((s) => s.number === null).sort((a, b) => a.speechMs - b.speechMs);
    for (const s of unnamed.slice(0, active.length - this.maxSpeakers)) this.speakers.delete(s.id);
  }

  resolve(id: string): string {
    let s = this.speakers.get(id);
    while (s?.mergedInto) {
      id = s.mergedInto;
      s = this.speakers.get(id);
    }
    return id;
  }

  label(id: string): string {
    const s = this.speakers.get(this.resolve(id));
    return s?.number != null ? `Speaker ${s.number}` : UNNAMED_LABEL;
  }

  get speakerCount(): number {
    return this.active().length;
  }
}

/** A raw diarization cluster with its voice, ready for the final relabel. */
export interface RawCluster {
  raw: number;
  speechMs: number;
  /** Unit length; null when no stretch was long enough to embed. */
  embedding: number[] | null;
  embeddedSegments: number;
}

export interface RelabelOptions {
  /** The user told us how many people spoke. */
  knownSpeakers?: number;
  /** Clusters under this are absorbed into their nearest real speaker. */
  minSpeakerMs?: number;
  /** Merge clusters at or above this cosine similarity. */
  mergeLine?: number;
}

export const RELABEL_DEFAULTS = {
  minSpeakerMs: NAMED_AFTER_MS,
  mergeLine: 0.65,
} as const;

interface Group {
  members: number[];
  sum: number[];
  speechMs: number;
}

const groupUnit = (g: Group): number[] => unit(g.sum);

function mergeGroups(groups: Group[], i: number, j: number): void {
  const a = groups[i]!;
  const b = groups[j]!;
  a.members.push(...b.members);
  for (let k = 0; k < a.sum.length; k++) a.sum[k]! += b.sum[k]!;
  a.speechMs += b.speechMs;
  groups.splice(j, 1);
}

function closestPair(groups: Group[]): { i: number; j: number; sim: number } | null {
  let best: { i: number; j: number; sim: number } | null = null;
  for (let i = 0; i < groups.length; i++) {
    const a = groupUnit(groups[i]!);
    for (let j = i + 1; j < groups.length; j++) {
      const sim = dot(a, groupUnit(groups[j]!));
      if (!best || sim > best.sim) best = { i, j, sim };
    }
  }
  return best;
}

/**
 * Decides the final speakers from an over-split diarization.  Phase 0 showed no
 * sherpa threshold holds: the usable band is narrow and moved 11 points of DER
 * between onnxruntime builds.  So sherpa runs below that band and clusters are
 * merged here on voice similarity, where 0.60--0.70 gave the same result on
 * three AMI meetings, from WAV and from Opus chunks alike.
 *
 * Returns a map from raw cluster to final speaker index, biggest speaker first.
 */
export function relabelClusters(
  clusters: RawCluster[],
  options: RelabelOptions = {},
): Map<number, number> {
  const minSpeakerMs = options.minSpeakerMs ?? RELABEL_DEFAULTS.minSpeakerMs;
  const mergeLine = options.mergeLine ?? RELABEL_DEFAULTS.mergeLine;

  const voiced = clusters.filter((c) => c.embedding);
  const voiceless = clusters.filter((c) => !c.embedding);
  const toGroup = (c: RawCluster): Group => ({
    members: [c.raw],
    sum: c.embedding!.map((x) => (x * c.speechMs) / 1000),
    speechMs: c.speechMs,
  });
  let major = voiced.filter((c) => c.speechMs >= minSpeakerMs).map(toGroup);
  let minor = voiced.filter((c) => c.speechMs < minSpeakerMs).map(toGroup);
  if (major.length === 0) {
    major = [...major, ...minor];
    minor = [];
  }

  if (options.knownSpeakers !== undefined) {
    const k = Math.max(1, options.knownSpeakers);
    // A person can be split into small clusters only, so fill up from those.
    minor.sort((a, b) => b.speechMs - a.speechMs);
    while (major.length < k && minor.length > 0) major.push(minor.shift()!);
    while (major.length > k) {
      const p = closestPair(major)!;
      mergeGroups(major, p.i, p.j);
    }
  } else {
    for (;;) {
      const p = closestPair(major);
      if (!p || p.sim < mergeLine) break;
      mergeGroups(major, p.i, p.j);
    }
  }

  for (const g of minor) {
    const v = groupUnit(g);
    let best = 0;
    let bestSim = -2;
    major.forEach((m, i) => {
      const sim = dot(v, groupUnit(m));
      if (sim > bestSim) {
        bestSim = sim;
        best = i;
      }
    });
    const target = major[best]!;
    target.members.push(...g.members);
    target.speechMs += g.speechMs;
    // Stray clusters do not pull the centroid.
  }

  major.sort((a, b) => b.speechMs - a.speechMs);
  const map = new Map<number, number>();
  major.forEach((g, i) => g.members.forEach((raw) => map.set(raw, i)));
  // No voice to compare: keep them apart from everyone only if nothing else exists.
  for (const c of voiceless) map.set(c.raw, 0);
  return map;
}

/** Stretches to embed for one cluster: longest first, capped so 8-hour runs stay bounded. */
export function embeddingSpans(
  segments: RawSegment[],
  options: { minSeconds?: number; maxPerSpeaker?: number } = {},
): RawSegment[] {
  const minSeconds = options.minSeconds ?? 1.5;
  const max = options.maxPerSpeaker ?? 200;
  const bySpeaker = new Map<number, RawSegment[]>();
  for (const s of segments) {
    if (s.end - s.start < minSeconds) continue;
    let list = bySpeaker.get(s.speaker);
    if (!list) bySpeaker.set(s.speaker, (list = []));
    list.push(s);
  }
  const out: RawSegment[] = [];
  for (const list of bySpeaker.values()) {
    list.sort((a, b) => b.end - b.start - (a.end - a.start));
    out.push(...list.slice(0, max));
  }
  return out;
}

export interface Span {
  startMs: number;
  endMs: number;
  speakerId: string;
}

/**
 * Gives each word the span it overlaps most, else the nearest span.  `spans`
 * must be sorted by start.  Words must be sorted by start.
 */
export function assignSpeakers<W extends { startMs: number; endMs: number }>(
  words: W[],
  spans: Span[],
  fallback: string,
): string[] {
  const out: string[] = [];
  let first = 0;
  for (const w of words) {
    while (first < spans.length && spans[first]!.endMs < w.startMs - 30_000) first++;
    let best: string | null = null;
    let bestOverlap = 0;
    let nearest: string | null = null;
    let nearestGap = Infinity;
    for (let i = first; i < spans.length; i++) {
      const s = spans[i]!;
      if (s.startMs > w.endMs + 30_000) break;
      const overlap = Math.min(s.endMs, w.endMs) - Math.max(s.startMs, w.startMs);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        best = s.speakerId;
      }
      const gap = Math.max(s.startMs - w.endMs, w.startMs - s.endMs, 0);
      if (gap < nearestGap) {
        nearestGap = gap;
        nearest = s.speakerId;
      }
    }
    out.push(best ?? nearest ?? fallback);
  }
  return out;
}
