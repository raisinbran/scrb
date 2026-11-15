import type { TaskAResult, Metric } from './taskA.js';
import type { TaskBResult } from './taskB.js';

/** GO bars (plan section 5), whole percents. Comparisons use integer arithmetic on the unrounded counts. */
export interface Bar {
  key: string;
  task: 'A' | 'B';
  metric: string;
  dir: 'ge' | 'le';
  pct: number;
  /** Counts toward the STOP rule (A coverage, A placement, B recall). */
  primary: boolean;
}

export const BARS: readonly Bar[] = [
  { key: 'A.coverage', task: 'A', metric: 'coverage', dir: 'ge', pct: 70, primary: true },
  { key: 'A.placement', task: 'A', metric: 'placement', dir: 'ge', pct: 80, primary: true },
  { key: 'A.precision', task: 'A', metric: 'precision', dir: 'ge', pct: 70, primary: false },
  {
    key: 'A.contradictedRate',
    task: 'A',
    metric: 'contradictedRate',
    dir: 'le',
    pct: 5,
    primary: false,
  },
  {
    key: 'A.newTopicRecall',
    task: 'A',
    metric: 'newTopicRecall',
    dir: 'ge',
    pct: 50,
    primary: false,
  },
  {
    key: 'A.newTopicPlacement',
    task: 'A',
    metric: 'newTopicPlacement',
    dir: 'ge',
    pct: 75,
    primary: false,
  },
  {
    key: 'A.falseNewTopicRate',
    task: 'A',
    metric: 'falseNewTopicRate',
    dir: 'le',
    pct: 20,
    primary: false,
  },
  {
    key: 'B.additionsRecall',
    task: 'B',
    metric: 'additionsRecall',
    dir: 'ge',
    pct: 60,
    primary: true,
  },
  {
    key: 'B.additionsPrecision',
    task: 'B',
    metric: 'additionsPrecision',
    dir: 'ge',
    pct: 70,
    primary: false,
  },
  { key: 'B.movesRecall', task: 'B', metric: 'movesRecall', dir: 'ge', pct: 60, primary: true },
  {
    key: 'B.movesPrecision',
    task: 'B',
    metric: 'movesPrecision',
    dir: 'ge',
    pct: 80,
    primary: false,
  },
  { key: 'B.falseMoveRate', task: 'B', metric: 'falseMoveRate', dir: 'le', pct: 2, primary: false },
  { key: 'B.preservation', task: 'B', metric: 'preservation', dir: 'ge', pct: 98, primary: false },
];

/** A score exactly on the bar passes; 69.6% fails 70%. */
export function passes(num: number, den: number, bar: Bar): boolean {
  return bar.dir === 'ge' ? num * 100 >= bar.pct * den : num * 100 <= bar.pct * den;
}

export const MIN_EVALUABLE_MEETINGS = 3;
export const MIN_MEETINGS_FOR_DECISION = 4;
export const MIN_RATED_TOPICS = 15;
export const STOP_MARGIN_POINTS = 15;

export interface MeetingResult {
  a?: TaskAResult;
  b?: TaskBResult;
}

export type BarStatus = 'met' | 'failed' | 'inconclusive';

export interface BarAssessment {
  key: string;
  evaluableMeetings: number;
  meetingsPassing: number;
  pooled: { num: number; den: number } | null;
  pooledPass: boolean;
  status: BarStatus;
  /** Percentage points by which the pooled score misses the bar; 0 if it does not. */
  shortfall: number;
  primary: boolean;
}

function pick(m: MeetingResult, bar: Bar): Metric | undefined {
  const src = (bar.task === 'A' ? m.a : m.b) as unknown as Record<string, Metric> | undefined;
  return src?.[bar.metric];
}

export function assessBar(meetings: readonly MeetingResult[], bar: Bar): BarAssessment {
  let num = 0;
  let den = 0;
  let evaluable = 0;
  let passing = 0;
  for (const m of meetings) {
    const x = pick(m, bar);
    if (!x || !x.evaluable) continue; // not evaluable: out of the pool and out of the 75% count
    evaluable += 1;
    num += x.num;
    den += x.den;
    if (passes(x.num, x.den, bar)) passing += 1;
  }
  const pooledOk = den > 0 && evaluable > 0;
  const pooledPass = pooledOk && passes(num, den, bar);
  let status: BarStatus = 'inconclusive';
  if (evaluable >= MIN_EVALUABLE_MEETINGS)
    status = pooledPass && passing * 4 >= evaluable * 3 ? 'met' : 'failed';
  const pct = pooledOk ? (100 * num) / den : 0;
  const shortfall = !pooledOk || pooledPass ? 0 : bar.dir === 'ge' ? bar.pct - pct : pct - bar.pct;
  return {
    key: bar.key,
    evaluableMeetings: evaluable,
    meetingsPassing: passing,
    pooled: pooledOk ? { num, den } : null,
    pooledPass,
    status,
    shortfall,
    primary: bar.primary,
  };
}

export interface Rating {
  /** Number of topics the owner rated, pooled for this model and tier. */
  n: number;
  mean: number;
  /** Topics rated 1. */
  ones: number;
}

export type RatingStatus = BarStatus | 'missing';

export function assessRating(r: Rating | undefined): { status: RatingStatus; shortfall: number } {
  if (!r || r.n < MIN_RATED_TOPICS) return { status: r ? 'inconclusive' : 'missing', shortfall: 0 };
  const ok = r.mean >= 3.5 && r.ones * 10 <= r.n;
  // On a 0-100 scale (mean / 5) the bar is 70; this is an assumption for the STOP margin only.
  return {
    status: ok ? 'met' : 'failed',
    shortfall: ok ? 0 : Math.max(0, 70 - (r.mean / 5) * 100),
  };
}

export interface CandidateAssessment {
  bars: BarAssessment[];
  rating: { status: RatingStatus; shortfall: number };
  allEvaluable: boolean;
  go: boolean;
  /** Some primary bar (or the rating) is failed by more than 15 points, pooled. */
  missesPrimary: boolean;
}

export function assessCandidate(
  meetings: readonly MeetingResult[],
  rating?: Rating,
): CandidateAssessment {
  const bars = BARS.map((b) => assessBar(meetings, b));
  const rt = assessRating(rating);
  const allEvaluable =
    bars.every((b) => b.status !== 'inconclusive') &&
    (rt.status === 'met' || rt.status === 'failed');
  const go = bars.every((b) => b.status === 'met') && rt.status === 'met';
  const missesPrimary =
    bars.some((b) => b.primary && b.status === 'failed' && b.shortfall > STOP_MARGIN_POINTS) ||
    (rt.status === 'failed' && rt.shortfall > STOP_MARGIN_POINTS);
  return { bars, rating: rt, allEvaluable, go, missesPrimary };
}

export type Outcome = 'GO' | 'STOP' | 'INCONCLUSIVE';

export interface TierInput {
  tier: 1 | 2;
  candidates: CandidateAssessment[];
}

export interface Decision {
  outcome: Outcome;
  /** Which tier gave GO, if any. */
  goTier?: 1 | 2;
  missing: string[];
}

/** The plan's campaign: two tiers, two models each. */
export const PLAN_CANDIDATES = { 1: 2, 2: 2 } as const;

/**
 * Plan section 7. STOP needs the best candidate in EVERY tier to have failed, so it is never returned
 * while a tier, or one of its approved candidates, has not been evaluated: that is INCONCLUSIVE.
 * GO is allowed from one tier alone (a Tier 1 GO needs no Tier 2 result).
 */
export function decide(
  tiers: readonly TierInput[],
  ctx: {
    scorerValidated: boolean;
    meetingsFullyRun: number;
    /** How many candidates the owner approved per tier (defaults to the plan: 2 and 2). */
    expectedCandidates?: Record<1 | 2, number>;
  },
): Decision {
  const missing: string[] = [];
  if (!ctx.scorerValidated) missing.push('scorer-not-validated');
  if (ctx.meetingsFullyRun < MIN_MEETINGS_FOR_DECISION) missing.push('fewer-than-4-meetings');
  if (missing.length > 0) return { outcome: 'INCONCLUSIVE', missing };
  const go = tiers.find((t) => t.candidates.some((c) => c.go));
  if (go) return { outcome: 'GO', goTier: go.tier, missing };

  const expected = ctx.expectedCandidates ?? PLAN_CANDIDATES;
  for (const tier of [1, 2] as const) {
    const have = tiers.filter((t) => t.tier === tier).reduce((n, t) => n + t.candidates.length, 0);
    if (have === 0) missing.push(`tier${tier}-missing`);
    else if (have < expected[tier]) missing.push(`tier${tier}-candidate-missing`);
  }
  const stop =
    missing.length === 0 && tiers.every((t) => t.candidates.every((c) => c.missesPrimary));
  if (stop) return { outcome: 'STOP', missing };
  for (const t of tiers)
    for (const c of t.candidates)
      if (!c.allEvaluable) missing.push(`tier${t.tier}-bar-not-evaluable`);
  return { outcome: 'INCONCLUSIVE', missing: [...new Set(missing)] };
}
