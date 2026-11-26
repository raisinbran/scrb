import type { GenFact } from './agenda.js';
import { contentStems, f1, isDateTok, isNegation, tokenize } from './text.js';

/** Cross-chunk reconciliation for agenda facts: paraphrased repeats and later reversals. Pure, no I/O. */

const ONES: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const SCALE: Record<string, number> = { hundred: 100, thousand: 1000, million: 1e6 };

/**
 * Spoken numbers ("twenty five", "fifteen million") as digits. A lone word below ten stays a word
 * ("one of us"); compounds and values from ten up are converted.
 */
export function spokenToDigits(text: string): string {
  const words = text.split(/(\s+)/);
  const out: string[] = [];
  let i = 0;
  while (i < words.length) {
    const w = words[i]!;
    const lw = w.toLowerCase().replace(/[^a-z-]/g, '');
    if (!(lw in ONES) && !(lw in TENS)) {
      out.push(w);
      i += 1;
      continue;
    }
    let total = 0;
    let cur = 0;
    let used = 0;
    let last = i;
    let j = i;
    while (j < words.length) {
      const t = words[j]!;
      if (/^\s+$/.test(t)) {
        j += 1;
        continue;
      }
      const x = t.toLowerCase().replace(/[^a-z-]/g, '');
      if (x === 'and' && used > 0) {
        j += 1;
        continue;
      }
      if (x in TENS && cur % 100 === 0) cur += TENS[x]!;
      else if (
        x in ONES &&
        (cur % 100 === 0 || (cur % 10 === 0 && cur % 100 >= 20 && ONES[x]! < 10))
      )
        cur += ONES[x]!;
      else if (x === 'hundred') cur = (cur || 1) * 100;
      else if (x === 'thousand' || x === 'million') {
        total += (cur || 1) * SCALE[x]!;
        cur = 0;
      } else break;
      used += 1;
      j += 1;
      last = j;
    }
    const value = total + cur;
    if (used >= 2 || value >= 10) {
      out.push(
        String(value) + (/[.,;!?]$/.test(words[last - 1]!) ? words[last - 1]!.slice(-1) : ''),
      );
      i = last;
    } else {
      out.push(w);
      i += 1;
    }
  }
  return out.join('');
}

/** Numbers and dates a text carries, normalized; spoken numbers count as their digits. */
export const numbersOf = (s: string): string[] =>
  tokenize(spokenToDigits(s))
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
