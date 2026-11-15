import { matchPoints, SCORER, type Embed } from './match.js';
import {
  adversarialSuite,
  generalSuite,
  split,
  type AdversarialKind,
  type GeneralKind,
  type SuiteCase,
} from './suites.js';

/**
 * Deterministic stand-in embedder (hashed character trigrams) so the scorer logic can be tested with no
 * model. The real campaign must revalidate and retune tau with the frozen embedding model.
 */
export function trigramEmbedder(dim = 256): Embed {
  return async (texts) =>
    texts.map((t) => {
      const v = new Float32Array(dim);
      const s = ` ${t.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
      for (let i = 0; i + 3 <= s.length; i += 1) {
        let h = 2166136261;
        for (let k = 0; k < 3; k += 1) h = Math.imul(h ^ s.charCodeAt(i + k), 16777619);
        v[(h >>> 0) % dim]! += 1;
      }
      let n = 0;
      for (const x of v) n += x * x;
      n = Math.sqrt(n) || 1;
      for (let i = 0; i < dim; i += 1) v[i] = v[i]! / n;
      return v;
    });
}

export interface SuiteOutcome {
  paraphraseRecall: { num: number; den: number };
  contradictionFalseCredit: { num: number; den: number };
  irrelevantFalseCredit: { num: number; den: number };
  duplicatesExactlyOnce: { num: number; den: number };
  /** Credited adversarial pairs. Every one is a scorer defect. */
  adversarialCredited: {
    num: number;
    den: number;
    perKind: Record<AdversarialKind, { num: number; den: number }>;
  };
}

async function creditedCount(c: SuiteCase<string>, embed: Embed, tau: number): Promise<number> {
  const gens = c.gens.map((text) => ({ text, cite: { first: 0, last: c.span.length - 1 } }));
  const m = await matchPoints(gens, [c.ref], c.span, embed, { tau });
  return m.status.filter((s) => s === 'credited').length;
}

export async function runGeneral(
  cases: SuiteCase<GeneralKind>[],
  embed: Embed,
  tau: number,
): Promise<
  Pick<
    SuiteOutcome,
    | 'paraphraseRecall'
    | 'contradictionFalseCredit'
    | 'irrelevantFalseCredit'
    | 'duplicatesExactlyOnce'
  >
> {
  const r = {
    paraphraseRecall: { num: 0, den: 0 },
    contradictionFalseCredit: { num: 0, den: 0 },
    irrelevantFalseCredit: { num: 0, den: 0 },
    duplicatesExactlyOnce: { num: 0, den: 0 },
  };
  for (const c of cases) {
    const n = await creditedCount(c, embed, tau);
    if (c.kind === 'paraphrase') {
      r.paraphraseRecall.den += 1;
      if (n === 1) r.paraphraseRecall.num += 1;
    } else if (c.kind === 'contradiction') {
      r.contradictionFalseCredit.den += 1;
      if (n > 0) r.contradictionFalseCredit.num += 1;
    } else if (c.kind === 'irrelevant') {
      r.irrelevantFalseCredit.den += 1;
      if (n > 0) r.irrelevantFalseCredit.num += 1;
    } else {
      r.duplicatesExactlyOnce.den += 1;
      if (n === 1) r.duplicatesExactlyOnce.num += 1;
    }
  }
  return r;
}

export async function runAdversarial(
  cases: SuiteCase<AdversarialKind>[],
  embed: Embed,
  tau: number,
): Promise<SuiteOutcome['adversarialCredited']> {
  const perKind = {} as SuiteOutcome['adversarialCredited']['perKind'];
  let num = 0;
  for (const c of cases) {
    const k = (perKind[c.kind] ??= { num: 0, den: 0 });
    k.den += 1;
    if ((await creditedCount(c, embed, tau)) > 0) {
      k.num += 1;
      num += 1;
    }
  }
  return { num, den: cases.length, perKind };
}

export interface GeneralBars {
  ok: boolean;
  failed: string[];
}

/** Held-out requirements (plan section 3). */
export function generalBars(r: Awaited<ReturnType<typeof runGeneral>>): GeneralBars {
  const failed: string[] = [];
  if (r.paraphraseRecall.num * 100 < 85 * r.paraphraseRecall.den) failed.push('paraphrase-recall');
  if (r.contradictionFalseCredit.num * 100 > 5 * r.contradictionFalseCredit.den)
    failed.push('contradiction-false-credit');
  if (r.irrelevantFalseCredit.num * 100 > 5 * r.irrelevantFalseCredit.den)
    failed.push('irrelevant-false-credit');
  if (r.duplicatesExactlyOnce.num !== r.duplicatesExactlyOnce.den) failed.push('duplicates-once');
  return { ok: failed.length === 0, failed };
}

/** Picks tau on the tuning halves only: no false credit anywhere, then best paraphrase recall. */
export async function tuneTau(embed: Embed): Promise<number> {
  const g = split(generalSuite()).tuning;
  const a = split(adversarialSuite()).tuning;
  let best: number = SCORER.tau;
  let bestRecall = -1;
  for (let t = 30; t <= 90; t += 1) {
    const tau = t / 100;
    const r = await runGeneral(g, embed, tau);
    const adv = await runAdversarial(a, embed, tau);
    if (r.contradictionFalseCredit.num + r.irrelevantFalseCredit.num + adv.num > 0) continue;
    if (r.duplicatesExactlyOnce.num !== r.duplicatesExactlyOnce.den) continue;
    if (r.paraphraseRecall.num >= bestRecall) {
      bestRecall = r.paraphraseRecall.num;
      best = tau;
    }
  }
  return best;
}

export async function validateAll(
  embed: Embed,
  tau: number,
): Promise<{
  general: GeneralBars;
  adversarial: SuiteOutcome['adversarialCredited'];
  tuningAdversarial: SuiteOutcome['adversarialCredited'];
  ok: boolean;
}> {
  const g = split(generalSuite());
  const a = split(adversarialSuite());
  const general = generalBars(await runGeneral(g.heldOut, embed, tau));
  const adversarial = await runAdversarial(a.heldOut, embed, tau);
  const tuningAdversarial = await runAdversarial(a.tuning, embed, tau);
  return {
    general,
    adversarial,
    tuningAdversarial,
    ok: general.ok && adversarial.num === 0 && tuningAdversarial.num === 0,
  };
}
