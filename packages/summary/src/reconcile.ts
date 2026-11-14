import { contentTokens } from './text.js';
import type { ActionItem, DecisionItem, Extraction } from './types.js';
import { EVERYONE, NOT_SPECIFIED, UNCONFIRMED } from './types.js';

export interface ReconcileOptions {
  /** Items allowed per minute of meeting; 0 turns the cap off. */
  itemsPerMinute?: number;
  /** The cap never goes below this, so a short meeting is not cut to nothing. */
  minCap?: number;
}

/**
 * The cap is off. It was sized from the tuning meetings' reference lists (42 reference items over
 * 107 minutes, 0.39 a minute; about two extracted items per reference sentence, so 0.8 a minute)
 * and on those meetings it cut recall by 5 to 14 points for 6 points of precision, because
 * nothing in an item says reliably which ones the reader needs. See docs/gates/gate-6-summary-recall.md.
 */
export const DEFAULTS = { itemsPerMinute: 0, minCap: 10 };

const MIN_SHARED = 3;
/** A later item must come this long after the one it overrides. */
const OVERRIDE_GAP_SECONDS = 60;

type Pooled = ActionItem | DecisionItem;

/**
 * Words as written, hyphenated compounds and contractions kept whole ("no-show", "won't"), so
 * "no-show" is one word and is not negation. Curly apostrophes are normalised.
 */
const spoken = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[\u2019]/g, "'")
    .match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu) ?? [];

/** Narrow on purpose: "remove" and "drop" are ordinary verbs, not a statement that something is off. */
const NEGATING = /^(?:not|never|cannot|[a-z]+n't)$/;

const CONTRACTED: Record<string, string> = { wo: 'will', ca: 'can', sha: 'shall' };

/** Words with negation taken out ("no longer" counts as one negation) and whether any was found. */
function polarity(text: string): { negated: boolean; rest: string } {
  const out: string[] = [];
  let negated = false;
  const all = spoken(text);
  for (let i = 0; i < all.length; i += 1) {
    const word = all[i]!;
    if (word === 'no' && all[i + 1] === 'longer') {
      negated = true;
      i += 1;
    } else if (NEGATING.test(word)) {
      negated = true;
      // The contraction also carries its verb: "won't" is "will not", so "will" stays in the wording.
      if (word.endsWith("n't")) out.push(CONTRACTED[word.slice(0, -3)] ?? word.slice(0, -3));
      else if (word === 'cannot') out.push('can');
    } else out.push(word);
  }
  return { negated, rest: out.join(' ') };
}

const ownerOf = (item: Pooled): string | null =>
  item.kind !== 'action' || [NOT_SPECIFIED, UNCONFIRMED, EVERYONE].includes(item.owner)
    ? null
    : item.owner.toLowerCase();

/** Support for keeping an item: raised by several passes, firmly settled, found by the first pass. */
export function weight(item: Pooled): number {
  const settled =
    item.status === 'Decided' || item.status === 'Agreed'
      ? 2
      : item.status === 'Tentatively agreed'
        ? 1
        : 0;
  return (
    item.alsoAt.length * 2 +
    settled +
    (item.pass === 'primary' ? 0.5 : 0) +
    Math.min(contentTokens(item.text).size, 12) / 12 -
    (item.flags.includes('weak_evidence') ? 2 : 0)
  );
}

/**
 * "Later change overrides earlier", deliberately narrow: an earlier item is dropped only when a
 * later one at least a minute on has the same kind and the same named owner (two ownerless items are never overridden) and exactly the
 * same content words, the negation being the only difference. A different verb, object, date or
 * qualifier is therefore never a reversal. The later item stays and keeps the earlier one's line
 * in `alsoAt`, so the history is still reachable.
 */
function dropOverridden(items: Pooled[]): Pooled[] {
  const dropped = new Set<Pooled>();
  for (const earlier of items) {
    const a = contentTokens(earlier.text);
    for (const later of items) {
      if (later === earlier || later.kind !== earlier.kind || dropped.has(later)) continue;
      if (later.evidence.timestampSec - earlier.evidence.timestampSec < OVERRIDE_GAP_SECONDS)
        continue;
      // A removal needs positive evidence: the same named person on both.
      const owner = ownerOf(earlier);
      if (owner === null || ownerOf(later) !== owner) continue;
      const before = polarity(earlier.text);
      const after = polarity(later.text);
      if (before.negated === after.negated || before.rest !== after.rest) continue;
      if (a.size < MIN_SHARED) continue;
      later.alsoAt.push(earlier.evidence);
      dropped.add(earlier);
      break;
    }
  }
  return items.filter((item) => !dropped.has(item));
}

/** Keeps the `cap` best-supported items; ties go to the earlier item. Order is unchanged. */
function capItems(items: Pooled[], cap: number): Pooled[] {
  if (items.length <= cap) return items;
  const keep = new Set(
    items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => weight(b.item) - weight(a.item) || a.index - b.index)
      .slice(0, cap)
      .map((entry) => entry.item),
  );
  return items.filter((item) => keep.has(item));
}

/** Reduces an item list in meeting order; links are never changed, only items removed. */
export function reconcileItems(
  items: Pooled[],
  minutes: number,
  options: ReconcileOptions = {},
): Pooled[] {
  const { itemsPerMinute, minCap } = { ...DEFAULTS, ...options };
  let out = items;
  out = dropOverridden(out);
  if (itemsPerMinute > 0)
    out = capItems(out, Math.max(minCap, Math.ceil(minutes * itemsPerMinute)));
  return out;
}

/** Applies the reconcile step to actions and decisions of a finished extraction. */
export function reconcileExtraction(
  extraction: Extraction,
  minutes: number,
  options: ReconcileOptions = {},
): Extraction {
  const pooled: Pooled[] = [...extraction.actions, ...extraction.decisions];
  const kept = new Set(
    reconcileItems(
      pooled.sort((a, b) => a.evidence.timestampSec - b.evidence.timestampSec),
      minutes,
      options,
    ),
  );
  return {
    ...extraction,
    actions: extraction.actions.filter((item) => kept.has(item)),
    decisions: extraction.decisions.filter((item) => kept.has(item)),
  };
}
