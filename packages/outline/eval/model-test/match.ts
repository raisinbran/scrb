import { clausesOf, extractFacts, factCheck, lowerWords, type Facts } from './facts.js';
import { contentStems, f1 } from './text.js';

/** Frozen scorer settings. tau is set on the tuning half of the invented suites only. */
export const SCORER = {
  /** Similarity threshold for a candidate pair. Starts at 0.60 (plan); tuned values live in tuned.json via validate. */
  tau: 0.6,
  wEmbed: 0.5,
  wWords: 0.5,
  citationShare: 0.5,
  longLineWords: 40,
} as const;

export type Embed = (texts: string[]) => Promise<Float32Array[]>;

export interface Word {
  text: string;
  speaker: string;
}

export interface Cite {
  first: number;
  last: number;
}

export interface GenIn {
  text: string;
  cite: Cite | null;
}

export type GenStatus = 'credited' | 'duplicate' | 'contradicted' | 'unsupported' | 'extra';

export interface MatchResult {
  status: GenStatus[];
  /** Reference index credited to each generated point, or -1. */
  genToRef: number[];
  /** Generated index credited to each reference point, or -1. */
  refToGen: number[];
  /** Similarity of each credited pair, indexed by generated point. */
  sim: number[];
}

/** One bullet or line is one point; a line over 40 words is split at sentence ends. */
export function splitPoints(line: string): string[] {
  const text = line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim();
  if (!text) return [];
  if (text.split(/\s+/).length <= SCORER.longLineWords) return [text];
  const parts = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [text];
  return parts.map((p) => p.trim()).filter(Boolean);
}

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i]! * b[i]!;
  return s;
}

/** s(g, r) = 0.5 x cosine + 0.5 x F1 of stemmed content words. */
export function similarity(cos: number, a: string, b: string): number {
  return SCORER.wEmbed * Math.max(0, cos) + SCORER.wWords * f1(contentStems(a), contentStems(b));
}

/** Supported only if the range exists and at least half of the point's content words occur in it. */
export function citationSupported(
  text: string,
  cite: Cite | null,
  words: readonly Word[],
): boolean {
  if (!cite || !Number.isInteger(cite.first) || !Number.isInteger(cite.last)) return false;
  if (cite.first < 0 || cite.last < cite.first || cite.last >= words.length) return false;
  const own = new Set(contentStems(text));
  if (own.size === 0) return false;
  const inside = new Set(
    contentStems(
      words
        .slice(cite.first, cite.last + 1)
        .map((w) => w.text)
        .join(' '),
    ),
  );
  let hit = 0;
  for (const s of own) if (inside.has(s)) hit += 1;
  return hit / own.size >= SCORER.citationShare;
}

/** Maximum-weight assignment (Hungarian). weight 0 means "no edge". Returns col for each row or -1. */
export function assign(weight: number[][], rows: number, cols: number): number[] {
  const n = Math.max(rows, cols);
  if (n === 0) return [];
  const INF = 1e18;
  const a: number[][] = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) =>
      i >= 1 && j >= 1 && i <= rows && j <= cols ? -(weight[i - 1]![j - 1] ?? 0) : 0,
    ),
  );
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(n + 1).fill(0);
  const p = new Array<number>(n + 1).fill(0);
  const way = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= n; i += 1) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(n + 1).fill(INF);
    const used = new Array<boolean>(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0]!;
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= n; j += 1) {
        if (used[j]) continue;
        const cur = a[i0]![j]! - u[i0]! - v[j]!;
        if (cur < minv[j]!) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j]! < delta) {
          delta = minv[j]!;
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j += 1) {
        if (used[j]) {
          u[p[j]!] = u[p[j]!]! + delta;
          v[j] = v[j]! - delta;
        } else minv[j] = minv[j]! - delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0]!;
      p[j0] = p[j1]!;
      j0 = j1;
    } while (j0);
  }
  const out = new Array<number>(rows).fill(-1);
  for (let j = 1; j <= n; j += 1) {
    const i = p[j]!;
    if (i >= 1 && i <= rows && j <= cols && (weight[i - 1]![j - 1] ?? 0) > 0) out[i - 1] = j - 1;
  }
  return out;
}

export interface MatchOptions {
  tau?: number;
}

/**
 * Plan section 3: citation check, candidates at s >= tau, role-level fact check, then the
 * one-to-one maximum-total-similarity assignment. Remaining points are classified.
 */
export async function matchPoints(
  gens: readonly GenIn[],
  refs: readonly string[],
  words: readonly Word[],
  embed: Embed,
  opts: MatchOptions = {},
): Promise<MatchResult> {
  const tau = opts.tau ?? SCORER.tau;
  const vecs = await embed([...gens.map((g) => g.text), ...refs]);
  const gv = vecs.slice(0, gens.length);
  const rv = vecs.slice(gens.length);
  const common = lowerWords([
    ...gens.map((g) => g.text),
    ...refs,
    words.map((w) => w.text).join(' '),
  ]);
  const gFacts: Facts[] = gens.map((g) => extractFacts(g.text, common));
  const rFacts: Facts[] = refs.map((r) => extractFacts(r, common));
  const supported = gens.map((g) => citationSupported(g.text, g.cite, words));
  const weight: number[][] = gens.map(() => refs.map(() => 0));
  const candidate: boolean[][] = gens.map(() => refs.map(() => false));
  const passes: boolean[][] = gens.map(() => refs.map(() => false));
  gens.forEach((g, i) => {
    if (!supported[i]) return;
    const clauses = clausesOf(words.slice(g.cite!.first, g.cite!.last + 1));
    refs.forEach((r, j) => {
      const cos = dot(gv[i]!, rv[j]!);
      const s = similarity(cos, g.text, r);
      if (s < tau) return;
      candidate[i]![j] = true;
      if (factCheck(gFacts[i]!, rFacts[j]!, clauses, cos, common).ok) {
        passes[i]![j] = true;
        weight[i]![j] = Math.max(s, 1e-9);
      }
    });
  });
  const col = assign(weight, gens.length, refs.length);
  const genToRef = col.slice();
  const refToGen = refs.map(() => -1);
  const sim = gens.map(() => 0);
  col.forEach((j, i) => {
    if (j >= 0) {
      refToGen[j] = i;
      sim[i] = weight[i]![j]!;
    }
  });
  const status: GenStatus[] = gens.map((_, i) => {
    if (!supported[i]) return 'unsupported';
    if (genToRef[i]! >= 0) return 'credited';
    if (passes[i]!.some((p, j) => p && refToGen[j]! >= 0)) return 'duplicate';
    if (candidate[i]!.some(Boolean)) return 'contradicted';
    return 'extra';
  });
  return { status, genToRef, refToGen, sim };
}
