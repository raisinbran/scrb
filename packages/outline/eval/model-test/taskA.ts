import {
  assign,
  matchPoints,
  similarity,
  splitPoints,
  dot,
  SCORER,
  type Cite,
  type Embed,
  type GenIn,
  type Word,
} from './match.js';

export interface RefTopic {
  title: string;
  /** False for a topic the meeting raised that the outline lacks. */
  inOutline: boolean;
  points: string[];
}

export interface GenTopic {
  title: string;
  points: { text: string; cite: Cite | null }[];
}

/** A ratio with the counts behind it. Undefined is not zero: not evaluable stays not evaluable. */
export interface Metric {
  num: number;
  den: number;
  evaluable: boolean;
}

export const value = (m: Metric): number | null =>
  m.evaluable && m.den > 0 ? m.num / m.den : null;

/** Minimum evaluable counts per meeting (plan section 7). */
export const MIN = {
  refPoints: 20,
  genPoints: 20,
  matched: 10,
  refNewTopics: 2,
  newTopicMatched: 5,
  proposedNew: 3,
  removed: 8,
  moved: 5,
  proposedMoves: 3,
  proposedAdditions: 3,
  untouched: 50,
} as const;

export const metric = (num: number, den: number, ok: boolean): Metric => ({
  num,
  den,
  evaluable: ok && den > 0,
});

export interface TaskAResult {
  coverage: Metric;
  /** Outline-topic placement. */
  placement: Metric;
  newTopicPlacement: Metric;
  overallPlacement: Metric;
  /** Matched pairs under the right topic / reference points. */
  placedCoverage: Metric;
  precision: Metric;
  contradictedRate: Metric;
  unsupportedRate: Metric;
  newTopicRecall: Metric;
  falseNewTopicRate: Metric;
  counts: {
    refPoints: number;
    genPoints: number;
    matched: number;
    credited: number;
    duplicate: number;
    contradicted: number;
    unsupported: number;
    extra: number;
  };
}

export const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export interface TopicMap {
  /** Key of each generated topic: outline title, matched new topic, or unmatched proposal. */
  genKeys: string[];
  refKeys: string[];
  proposedNew: number;
  matchedNew: number;
}

/** Maps generated topics onto reference topics. Outline topics by title; new ones by s >= tau. */
export async function mapTopics(
  refTopics: readonly RefTopic[],
  genTopics: readonly GenTopic[],
  embed: Embed,
  tau: number,
): Promise<TopicMap> {
  const outline = new Set(refTopics.filter((t) => t.inOutline).map((t) => norm(t.title)));
  const newRef = refTopics.map((t, i) => ({ t, i })).filter((x) => !x.t.inOutline);
  const proposed = genTopics.map((t, i) => ({ t, i })).filter((x) => !outline.has(norm(x.t.title)));
  const vecs = await embed([...proposed.map((p) => p.t.title), ...newRef.map((r) => r.t.title)]);
  const w = proposed.map((p, a) =>
    newRef.map((r, b) => {
      const s = similarity(dot(vecs[a]!, vecs[proposed.length + b]!), p.t.title, r.t.title);
      return s >= tau ? s : 0;
    }),
  );
  const col = assign(w, proposed.length, newRef.length);
  const genKeys = genTopics.map((t) =>
    outline.has(norm(t.title)) ? `o:${norm(t.title)}` : `x:${norm(t.title)}`,
  );
  let matchedNew = 0;
  col.forEach((j, a) => {
    if (j >= 0) {
      genKeys[proposed[a]!.i] = `n:${newRef[j]!.i}`;
      matchedNew += 1;
    }
  });
  const refKeys = refTopics.map((t, i) => (t.inOutline ? `o:${norm(t.title)}` : `n:${i}`));
  return { genKeys, refKeys, proposedNew: proposed.length, matchedNew };
}

export async function scoreTaskA(
  refTopics: readonly RefTopic[],
  genTopics: readonly GenTopic[],
  words: readonly Word[],
  embed: Embed,
  tau: number = SCORER.tau,
): Promise<TaskAResult> {
  const refs: { text: string; topic: number }[] = [];
  refTopics.forEach((t, ti) =>
    t.points.forEach((p) => splitPoints(p).forEach((x) => refs.push({ text: x, topic: ti }))),
  );
  const gens: (GenIn & { topic: number })[] = [];
  genTopics.forEach((t, ti) =>
    t.points.forEach((p) =>
      splitPoints(p.text).forEach((x) => gens.push({ text: x, cite: p.cite, topic: ti })),
    ),
  );
  const m = await matchPoints(
    gens,
    refs.map((r) => r.text),
    words,
    embed,
    { tau },
  );
  const tm = await mapTopics(refTopics, genTopics, embed, tau);

  const count = (s: string): number => m.status.filter((x) => x === s).length;
  const credited = count('credited');
  let outlineMatched = 0;
  let outlineSame = 0;
  let newMatched = 0;
  let newSame = 0;
  m.refToGen.forEach((g, r) => {
    if (g < 0) return;
    const rk = tm.refKeys[refs[r]!.topic]!;
    const same = tm.genKeys[gens[g]!.topic] === rk;
    if (rk.startsWith('n:')) {
      newMatched += 1;
      if (same) newSame += 1;
    } else {
      outlineMatched += 1;
      if (same) outlineSame += 1;
    }
  });
  const matched = credited;
  const base =
    refs.length >= MIN.refPoints && gens.length >= MIN.genPoints && matched >= MIN.matched;
  const gate = gens.length >= MIN.genPoints;
  const refNew = refTopics.filter((t) => !t.inOutline).length;
  return {
    coverage: metric(matched, refs.length, base),
    placement: metric(outlineSame, outlineMatched, base),
    newTopicPlacement: metric(newSame, newMatched, newMatched >= MIN.newTopicMatched),
    overallPlacement: metric(outlineSame + newSame, matched, base),
    placedCoverage: metric(outlineSame + newSame, refs.length, base),
    precision: metric(credited, gens.length, base),
    contradictedRate: metric(count('contradicted'), gens.length, gate),
    unsupportedRate: metric(count('unsupported'), gens.length, gate),
    newTopicRecall: metric(tm.matchedNew, refNew, refNew >= MIN.refNewTopics),
    falseNewTopicRate: metric(
      tm.proposedNew - tm.matchedNew,
      tm.proposedNew,
      tm.proposedNew >= MIN.proposedNew,
    ),
    counts: {
      refPoints: refs.length,
      genPoints: gens.length,
      matched,
      credited,
      duplicate: count('duplicate'),
      contradicted: count('contradicted'),
      unsupported: count('unsupported'),
      extra: count('extra'),
    },
  };
}
