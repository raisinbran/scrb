import { describe, expect, it } from 'vitest';
import {
  assessBar,
  assessCandidate,
  BARS,
  decide,
  passes,
  type MeetingResult,
} from '../../eval/model-test/bars.js';
import type { Word } from '../../eval/model-test/match.js';
import {
  buildPartial,
  destination,
  flatten,
  moveCount,
  removeCount,
  strata,
  TASK_B_SEED,
} from '../../eval/model-test/partial.js';
import {
  metric,
  scoreTaskA,
  value,
  type GenTopic,
  type RefTopic,
} from '../../eval/model-test/taskA.js';
import { scoreTaskB } from '../../eval/model-test/taskB.js';
import { trigramEmbedder } from '../../eval/model-test/validate.js';

const embed = trigramEmbedder();
const NAMES = ['Alice', 'Bob', 'Carol', 'Dmitri', 'Elena', 'Farid', 'Grace', 'Hiro'];
const THINGS = [
  'vendor contract',
  'release notes',
  'onboarding guide',
  'security audit',
  'pricing page',
  'migration plan',
  'budget draft',
  'training deck',
  'status report',
  'design review',
  'test plan',
  'rollout checklist',
  'support rota',
  'demo script',
  'backup policy',
];
const DATES = [
  'March 3',
  'June 12',
  'April 20',
  'October 8',
  'January 15',
  'August 30',
  'November 2',
  'July 21',
];

/** Invented reference notes: `topics` outline topics of `per` points each, plus one added topic. */
function reference(topics: number, per: number): RefTopic[] {
  let k = 0;
  const out: RefTopic[] = [];
  for (let t = 0; t < topics + 1; t += 1) {
    const points: string[] = [];
    const n = t === topics ? Math.max(5, Math.floor(per / 2)) : per;
    for (let i = 0; i < n; i += 1, k += 1) {
      const pad = ' on the schedule'.repeat(i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 3);
      points.push(
        `${NAMES[k % 8]} will review the ${THINGS[k % 15]} with ${NAMES[(k * 3 + 1) % 8]} by ${DATES[(k * 5) % 8]} item ${k}${pad}.`,
      );
    }
    out.push({
      title: t === topics ? `Added topic ${t}` : `Topic ${t}`,
      inOutline: t !== topics,
      points,
    });
  }
  return out;
}

const spanOf = (ref: RefTopic[]): Word[] =>
  ref
    .flatMap((t) => t.points)
    .flatMap((p) => p.split(/\s+/).map((text) => ({ text, speaker: 'Zed' })));

/** The notes a perfect model would write: every reference point, cited to the whole transcript. */
function perfect(ref: RefTopic[], words: Word[]): GenTopic[] {
  return ref.map((t) => ({
    title: t.title,
    points: t.points.map((text) => ({ text, cite: { first: 0, last: words.length - 1 } })),
  }));
}

describe('Task B builder', () => {
  it('rounds with integers: round half up for removals, ceil for moves', () => {
    expect([4, 5, 6, 10, 18].map(removeCount)).toEqual([1, 1, 2, 3, 5]);
    expect([4, 9, 10, 25, 26].map(moveCount)).toEqual([1, 2, 2, 3, 4]);
  });

  it('is deterministic for a seed and changes with another', () => {
    const ref = reference(5, 12);
    const a = buildPartial(ref, TASK_B_SEED);
    const b = buildPartial(ref, TASK_B_SEED);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(buildPartial(ref, 1).record)).not.toBe(JSON.stringify(a.record));
  });

  it('never overlaps removed and moved, and sends a moved point to the next other outline topic', () => {
    const ref = reference(5, 12);
    const flat = flatten(ref);
    const p = buildPartial(ref);
    const removed = new Set(p.record.removed);
    expect(p.record.moved.length).toBeGreaterThan(0);
    for (const m of p.record.moved) {
      expect(removed.has(m.ref)).toBe(false);
      expect(m.to).not.toBe(m.from);
      expect(ref[m.to]!.inOutline).toBe(true);
      expect(m.to).toBe(destination(m.from, ref, flat));
      const placed = p.points.find((x) => x.ref === m.ref)!;
      expect(placed.topic).toBe(m.to);
    }
    expect(p.record.removed.length + p.record.moved.length + p.record.untouched.length).toBe(
      flat.length,
    );
    expect(p.points.length).toBe(flat.length - removed.size);
  });

  it('removes about a quarter of every stratum and gives small strata no changes', () => {
    const ref = reference(4, 12);
    const flat = flatten(ref);
    const p = buildPartial(ref);
    for (const s of strata(flat, ref)) {
      const r = s.filter((i) => p.record.removed.includes(i)).length;
      expect(r).toBe(s.length < 4 ? 0 : removeCount(s.length));
    }
    const tiny: RefTopic[] = [
      { title: 'T', inOutline: true, points: ['One thing here.', 'Two things there.'] },
    ];
    expect(buildPartial(tiny).record.removed).toEqual([]);
  });

  it('merges a topic of fewer than 4 points into the previous topic for stratification', () => {
    const ref = reference(2, 8);
    ref.splice(1, 0, {
      title: 'Small',
      inOutline: true,
      points: ['A tiny point.', 'Another tiny point.'],
    });
    const flat = flatten(ref);
    const small = flat.map((f, i) => (f.topic === 1 ? i : -1)).filter((i) => i >= 0);
    const groups = strata(flat, ref);
    const home = groups.filter((g) => g.some((i) => small.includes(i)));
    expect(home.length).toBeGreaterThan(0);
    expect(home.every((g) => g.some((i) => flat[i]!.topic === 0))).toBe(true);
  });
});

describe('Task A scoring', () => {
  const ref = reference(8, 15);
  const words = spanOf(ref);

  it('scores a perfect copy at 100% and marks it evaluable', async () => {
    const r = await scoreTaskA(ref, perfect(ref, words), words, embed, 0.7);
    expect(value(r.coverage)).toBe(1);
    expect(value(r.placement)).toBe(1);
    expect(value(r.precision)).toBe(1);
    expect(value(r.placedCoverage)).toBe(1);
    expect(value(r.contradictedRate)).toBe(0);
    expect(r.newTopicRecall.evaluable).toBe(false); // only one added topic: below the minimum of 2
    expect(r.counts.refPoints).toBeGreaterThanOrEqual(20);
  });

  it('counts a point filed under the wrong topic as found but misplaced', async () => {
    const gen = perfect(ref, words);
    const moved = gen[0]!.points.splice(0, 3);
    gen[1]!.points.push(...moved);
    const r = await scoreTaskA(ref, gen, words, embed, 0.7);
    expect(value(r.coverage)).toBe(1);
    expect(r.placement.num).toBe(r.placement.den - 3);
  });

  it('does not credit points without a citation and keeps them in the precision denominator', async () => {
    const gen = perfect(ref, words);
    for (const p of gen[0]!.points) p.cite = null;
    const r = await scoreTaskA(ref, gen, words, embed, 0.7);
    expect(r.counts.unsupported).toBe(15);
    expect(r.coverage.num).toBe(r.counts.refPoints - 15);
    expect(r.precision.den).toBe(r.counts.genPoints);
  });

  it('reports a meeting below the minimum counts as not evaluable, never as zero', async () => {
    const tiny = reference(2, 4);
    const w = spanOf(tiny);
    const r = await scoreTaskA(tiny, perfect(tiny, w), w, embed, 0.7);
    expect(r.coverage.evaluable).toBe(false);
    expect(value(r.coverage)).toBeNull();
  });

  it('counts a matched point under the matching new topic as new-topic placement', async () => {
    const big = reference(8, 15);
    big.push({
      title: 'Second added topic',
      inOutline: false,
      points: reference(8, 15)[8]!.points.map((p) => `${p} extra`),
    });
    const w = spanOf(big);
    const r = await scoreTaskA(big, perfect(big, w), w, embed, 0.7);
    expect(r.newTopicRecall.den).toBe(2);
    expect(value(r.newTopicRecall)).toBe(1);
    expect(value(r.falseNewTopicRate)).toBeNull(); // only two proposed: below the minimum of 3
  });
});

describe('Task B scoring', () => {
  const ref = reference(8, 16);
  const words = spanOf(ref);
  const flat = flatten(ref);
  const partial = buildPartial(ref);
  const cite = { first: 0, last: words.length - 1 };
  const oracle = () => ({
    additions: partial.record.removed.map((i) => ({
      topic: ref[flat[i]!.topic]!.title,
      text: flat[i]!.text,
      cite,
    })),
    moves: partial.record.moved.map((m) => ({ id: m.id, toTopic: ref[m.from]!.title })),
    edits: [] as { id: string; kind: 'reword' | 'delete' }[],
  });

  it('gives full recall and precision to a perfect repair', async () => {
    const r = await scoreTaskB(ref, partial, oracle(), words, embed, 0.7);
    expect(value(r.additionsRecall)).toBe(1);
    expect(value(r.additionsPrecision)).toBe(1);
    expect(value(r.movesRecall)).toBe(1);
    expect(value(r.movesPrecision)).toBe(1);
    expect(r.counts.untouched).toBe(partial.record.untouched.length);
  });

  it('counts a move of an untouched point as a false move and an unnecessary edit', async () => {
    const o = oracle();
    const victim = partial.record.untouched[0]!;
    o.moves.push({ id: victim.id, toTopic: ref[0]!.title });
    const r = await scoreTaskB(ref, partial, o, words, embed, 0.7);
    expect(r.falseMoveRate.num).toBe(1);
    expect(r.preservation.num).toBe(r.preservation.den - 1);
    expect(r.movesPrecision.num).toBe(partial.record.moved.length);
    expect(r.movesPrecision.den).toBe(partial.record.moved.length + 1);
  });

  it('never credits a repeated move twice, and a move to the wrong topic scores nothing', async () => {
    const o = oracle();
    o.moves.push(o.moves[0]!);
    o.moves[1] = { id: o.moves[1]!.id, toTopic: 'Nowhere' };
    const r = await scoreTaskB(ref, partial, o, words, embed, 0.7);
    expect(r.movesRecall.num).toBe(partial.record.moved.length - 1);
  });

  it('proposing no moves when some points moved is recall 0, not undefined', async () => {
    const o = oracle();
    o.moves = [];
    const r = await scoreTaskB(ref, partial, o, words, embed, 0.7);
    if (partial.record.moved.length >= 5) {
      expect(value(r.movesRecall)).toBe(0);
      expect(r.movesPrecision.evaluable).toBe(false);
    }
  });
});

describe('bars and decisions', () => {
  const bar = BARS.find((b) => b.key === 'A.coverage')!;
  const m = (num: number, den: number, ok = true): MeetingResult => ({
    a: { coverage: metric(num, den, ok) } as never,
  });

  it('compares unrounded: 69.6% fails 70% and exactly 70% passes', () => {
    expect(passes(696, 1000, bar)).toBe(false);
    expect(passes(700, 1000, bar)).toBe(true);
    const le = BARS.find((b) => b.key === 'A.contradictedRate')!;
    expect(passes(5, 100, le)).toBe(true);
    expect(passes(51, 1000, le)).toBe(false);
  });

  it('leaves a not-evaluable meeting out of the pool and out of the meeting count', () => {
    const a = assessBar([m(80, 100), m(75, 100), m(90, 100), m(0, 0, false)], bar);
    expect(a.evaluableMeetings).toBe(3);
    expect(a.pooled).toEqual({ num: 245, den: 300 });
    expect(a.status).toBe('met');
  });

  it('is inconclusive with fewer than 3 evaluable meetings, even when every one passes', () => {
    expect(assessBar([m(90, 100), m(90, 100)], bar).status).toBe('inconclusive');
  });

  it('needs 75% of evaluable meetings, not only the pooled figure', () => {
    // Pooled 74% passes, but only 2 of 4 meetings pass.
    const a = assessBar([m(95, 100), m(95, 100), m(53, 100), m(53, 100)], bar);
    expect(a.pooledPass).toBe(true);
    expect(a.status).toBe('failed');
  });

  it('never calls GO or STOP below 4 meetings or without a validated scorer', () => {
    const c = assessCandidate([m(10, 100), m(10, 100), m(10, 100), m(10, 100)]);
    expect(
      decide([{ tier: 1, candidates: [c] }], { scorerValidated: true, meetingsFullyRun: 3 })
        .outcome,
    ).toBe('INCONCLUSIVE');
    expect(
      decide([{ tier: 1, candidates: [c] }], { scorerValidated: false, meetingsFullyRun: 6 })
        .outcome,
    ).toBe('INCONCLUSIVE');
  });

  it('stops only when every candidate in every tier misses a primary bar by more than 15 points', () => {
    const bad = assessCandidate([m(10, 100), m(10, 100), m(10, 100), m(10, 100)]);
    const near = assessCandidate([m(60, 100), m(60, 100), m(60, 100), m(60, 100)]);
    const ctx = { scorerValidated: true, meetingsFullyRun: 4 };
    expect(
      decide(
        [
          { tier: 1, candidates: [bad, bad] },
          { tier: 2, candidates: [bad] },
        ],
        ctx,
      ).outcome,
    ).toBe('STOP');
    expect(
      decide(
        [
          { tier: 1, candidates: [bad, near] },
          { tier: 2, candidates: [bad] },
        ],
        ctx,
      ).outcome,
    ).toBe('INCONCLUSIVE');
  });

  it('needs the owner rating for GO: fewer than 15 rated topics is not evaluable', () => {
    const c = assessCandidate([], { n: 14, mean: 5, ones: 0 });
    expect(c.rating.status).toBe('inconclusive');
    expect(assessCandidate([], { n: 15, mean: 3.5, ones: 1 }).rating.status).toBe('met');
    expect(assessCandidate([], { n: 15, mean: 3.5, ones: 2 }).rating.status).toBe('failed');
  });
});
