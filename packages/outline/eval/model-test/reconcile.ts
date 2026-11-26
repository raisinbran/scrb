import type { GenFact } from './agenda.js';
import { contentStems, f1, isDateTok, isNegation, tokenize } from './text.js';

/** Cross-chunk reconciliation for agenda facts: paraphrased repeats and later reversals. Pure, no I/O. */

/** Numbers and dates a text carries, normalized. */
export const numbersOf = (s: string): string[] =>
  tokenize(s)
    .filter((t) => /^\$?\d/.test(t.raw) || isDateTok(t))
    .map((t) => t.low.replace(/[$,]/g, ''));

export const hasNegation = (s: string): boolean => tokenize(s).some(isNegation);

export const DUP_SAME_TOPIC = 0.6;
export const DUP_OTHER_TOPIC = 0.75;
export const REVERSAL = 0.6;
/** Facts that may be reversed by a later statement. */
const REVERSIBLE = new Set(['decision', 'date', 'info', 'action', 'caveat']);

const sameTopic = (a: GenFact, b: GenFact): boolean =>
  a.topic === b.topic && a.newTopic === b.newTopic;
const sameNumbers = (a: string, b: string): boolean => {
  const x = new Set(numbersOf(a));
  const y = new Set(numbersOf(b));
  return x.size === y.size && [...x].every((n) => y.has(n));
};
const shared = (a: readonly string[], b: readonly string[]): number => {
  const s = new Set(b);
  return new Set(a.filter((x) => s.has(x))).size;
};

export interface ReconcileStats {
  duplicates: number;
  reversals: number;
}

/**
 * Folds `incoming` into `prev`. A paraphrased repeat (same kind, same numbers and polarity, similar words)
 * is dropped. A later statement about the same thing with a different number or opposite polarity replaces
 * the earlier one and keeps the earlier citation as `earlier`, so both places stay visible. "Later" means
 * the later cited line, not the later position in the model's output.
 */
export function reconcile(
  prev: readonly GenFact[],
  incoming: readonly GenFact[],
  stats: ReconcileStats = { duplicates: 0, reversals: 0 },
): GenFact[] {
  const out = prev.map((f) => ({ ...f }));
  for (const g of incoming) {
    const gs = contentStems(g.text);
    let handled = false;
    for (let i = 0; i < out.length && !handled; i += 1) {
      const e = out[i]!;
      if (e.kind !== g.kind) continue;
      const es = contentStems(e.text);
      const sim = f1(es, gs);
      const same = sameTopic(e, g);
      const unchanged = sameNumbers(e.text, g.text) && hasNegation(e.text) === hasNegation(g.text);
      if (unchanged && sim >= (same ? DUP_SAME_TOPIC : DUP_OTHER_TOPIC)) {
        if (!e.cite && g.cite) e.cite = g.cite;
        stats.duplicates += 1;
        handled = true;
      } else if (
        !unchanged &&
        same &&
        REVERSIBLE.has(g.kind) &&
        sim >= REVERSAL &&
        shared(es, gs) >= 2
      ) {
        const gLater = (g.cite?.to ?? -1) >= (e.cite?.to ?? -1);
        if (gLater) {
          out[i] = { ...g, earlier: e.cite ?? e.earlier ?? null };
        } else {
          e.earlier = g.cite ?? e.earlier ?? null;
        }
        stats.reversals += 1;
        handled = true;
      }
    }
    if (!handled) out.push({ ...g });
  }
  return out;
}
