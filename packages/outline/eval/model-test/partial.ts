import { splitPoints } from './match.js';
import type { RefTopic } from './taskA.js';

/** Plan section 4: fixed seed for the Task B partial-notes script. */
export const TASK_B_SEED = 20261115;

export interface FlatPoint {
  text: string;
  topic: number;
  /** Position within the topic. */
  pos: number;
}

export interface PartialPoint {
  id: string;
  text: string;
  /** Topic the point sits under in the partial notes (index into the reference topics). */
  topic: number;
  /** Index into the flat reference points. */
  ref: number;
}

export interface ChangeRecord {
  removed: number[];
  moved: { ref: number; from: number; to: number; id: string }[];
  untouched: { ref: number; id: string }[];
}

export interface PartialNotes {
  points: PartialPoint[];
  record: ChangeRecord;
}

/** mulberry32: small, deterministic, identical on every machine. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function flatten(topics: readonly RefTopic[]): FlatPoint[] {
  const out: FlatPoint[] = [];
  topics.forEach((t, ti) => {
    let pos = 0;
    for (const p of t.points)
      for (const x of splitPoints(p)) out.push({ text: x, topic: ti, pos: pos++ });
  });
  return out;
}

const wc = (s: string): number => s.split(/\s+/).filter(Boolean).length;

/** Integer arithmetic only, so rounding never depends on floating point. round(25% n), half up. */
export const removeCount = (n: number): number => Math.max(1, Math.floor((25 * n + 50) / 100));
/** ceil(12% n). */
export const moveCount = (n: number): number => Math.max(1, Math.floor((12 * n + 99) / 100));

/** Strata = (topic, length tercile), small ones merged first (plan section 4, steps 1-2). */
export function strata(flat: readonly FlatPoint[], topics: readonly RefTopic[]): number[][] {
  // Topics with fewer than 4 points join the previous topic for stratification only (the first joins the next).
  const groups: number[][] = [];
  const byTopic = topics.map((_, ti) =>
    flat.map((f, i) => (f.topic === ti ? i : -1)).filter((i) => i >= 0),
  );
  let carry: number[] = [];
  byTopic.forEach((idx) => {
    if (idx.length === 0) return;
    if (idx.length < 4) {
      if (groups.length > 0) groups[groups.length - 1]!.push(...idx);
      else carry.push(...idx);
    } else {
      groups.push([...carry, ...idx]);
      carry = [];
    }
  });
  if (carry.length) {
    if (groups.length) groups[0]!.unshift(...carry);
    else groups.push(carry);
  }
  const out: number[][] = [];
  for (const g of groups) {
    const ranked = [...g].sort((a, b) => wc(flat[a]!.text) - wc(flat[b]!.text) || a - b);
    let terc: number[][] = [[], [], []];
    ranked.forEach((idx, r) => terc[Math.floor((3 * r) / ranked.length)]!.push(idx));
    terc = terc.filter((t) => t.length > 0);
    while (terc.length > 1 && terc.some((t) => t.length < 4)) {
      let k = 0;
      terc.forEach((t, i) => {
        if (t.length < terc[k]!.length) k = i;
      });
      const left = k > 0 ? terc[k - 1]!.length : Infinity;
      const right = k < terc.length - 1 ? terc[k + 1]!.length : Infinity;
      const j = left <= right ? k - 1 : k + 1;
      const lo = Math.min(j, k);
      terc[lo] = [...terc[lo]!, ...terc[lo === j ? k : j]!];
      terc.splice(lo + 1, 1);
    }
    for (const t of terc) out.push(t.sort((a, b) => a - b));
  }
  return out;
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Next other outline topic, in order and cyclic, that has at least one point; never an added topic. */
export function destination(
  from: number,
  topics: readonly RefTopic[],
  flat: readonly FlatPoint[],
): number | null {
  const has = new Set(flat.map((f) => f.topic));
  for (let k = 1; k < topics.length; k += 1) {
    const t = (from + k) % topics.length;
    if (topics[t]!.inOutline && has.has(t)) return t;
  }
  return null;
}

export function buildPartial(
  topics: readonly RefTopic[],
  seed: number = TASK_B_SEED,
): PartialNotes {
  const flat = flatten(topics);
  const groups = strata(flat, topics);
  const rand = rng(seed);
  const removed = new Set<number>();
  for (const s of groups) {
    if (s.length < 4) continue;
    for (const i of shuffle(s, rand).slice(0, removeCount(s.length))) removed.add(i);
  }
  const movedTo = new Map<number, number>();
  for (const s of groups) {
    if (s.length < 4) continue;
    const pool = s.filter(
      (i) => !removed.has(i) && destination(flat[i]!.topic, topics, flat) !== null,
    );
    for (const i of shuffle(pool, rand).slice(0, moveCount(s.length)))
      movedTo.set(i, destination(flat[i]!.topic, topics, flat)!);
  }
  const points: PartialPoint[] = [];
  const add = (ref: number, topic: number): void => {
    points.push({ id: `p${points.length + 1}`, text: flat[ref]!.text, topic, ref });
  };
  topics.forEach((_, ti) => {
    flat.forEach((f, i) => {
      if (f.topic === ti && !removed.has(i) && !movedTo.has(i)) add(i, ti);
    });
    [...movedTo.entries()]
      .sort((a, b) => a[0] - b[0])
      .forEach(([i, to]) => {
        if (to === ti) add(i, ti);
      });
  });
  const idOf = new Map(points.map((p) => [p.ref, p.id]));
  return {
    points,
    record: {
      removed: [...removed].sort((a, b) => a - b),
      moved: [...movedTo.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([ref, to]) => ({ ref, from: flat[ref]!.topic, to, id: idOf.get(ref)! })),
      untouched: flat
        .map((_, i) => i)
        .filter((i) => !removed.has(i) && !movedTo.has(i))
        .map((ref) => ({ ref, id: idOf.get(ref)! })),
    },
  };
}
