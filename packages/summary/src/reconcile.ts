import { contentTokens, coverage, hasNegation, jaccard } from './text.js';
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

const MERGE_JACCARD = 0.4;
const MERGE_WINDOW_SECONDS = 300;
const MIN_SHARED = 3;
const MERGE_MIN_SHARED = 2;
/** A later item must come this long after the one it overrides. */
const OVERRIDE_GAP_SECONDS = 60;
const OVERRIDE_JACCARD = 0.35;
const TOPIC_SHARE = 0.15;
const MIN_ITEMS_FOR_TOPIC = 12;

type Pooled = ActionItem | DecisionItem;

const ownerOf = (item: Pooled): string | null =>
  item.kind !== 'action' || [NOT_SPECIFIED, UNCONFIRMED, EVERYONE].includes(item.owner)
    ? null
    : item.owner.toLowerCase();

/** Words in many of a meeting's items name its topic and say nothing about likeness. */
function topicWords(items: Pooled[]): Set<string> {
  const counts = new Map<string, number>();
  for (const item of items)
    for (const token of contentTokens(item.text)) counts.set(token, (counts.get(token) ?? 0) + 1);
  const topic = new Set<string>();
  if (items.length >= MIN_ITEMS_FOR_TOPIC)
    for (const [token, count] of counts) if (count / items.length >= TOPIC_SHARE) topic.add(token);
  return topic;
}

function sharedCount(a: Set<string>, b: Set<string>): number {
  return coverage(a, b) * a.size;
}

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

/** Merges the lesser of two items into the better; the better is the higher weight, then the longer. */
function absorb(winner: Pooled, loser: Pooled): void {
  winner.alsoAt.push(loser.evidence, ...loser.alsoAt);
  if (
    winner.kind === 'action' &&
    loser.kind === 'action' &&
    ownerOf(winner) === null &&
    ownerOf(loser) !== null
  ) {
    winner.owner = loser.owner;
    winner.flags = winner.flags.filter((flag) => flag !== 'owner_unconfirmed');
  }
}

/** Looser repeat merge than the first dedupe: same kind, same polarity, close in the meeting. */
function mergeNearDuplicates(items: Pooled[]): Pooled[] {
  const kept: Pooled[] = [];
  const cache = new Map<Pooled, Set<string>>();
  const tokens = (item: Pooled) =>
    cache.get(item) ?? cache.set(item, contentTokens(item.text)).get(item)!;
  for (const item of items) {
    const at = kept.findIndex((other) => {
      if (other.kind !== item.kind || hasNegation(other.text) !== hasNegation(item.text))
        return false;
      if (Math.abs(other.evidence.timestampSec - item.evidence.timestampSec) > MERGE_WINDOW_SECONDS)
        return false;
      const a = tokens(other);
      const b = tokens(item);
      if (sharedCount(a, b) < MERGE_MIN_SHARED || jaccard(a, b) < MERGE_JACCARD) return false;
      const owners = [ownerOf(other), ownerOf(item)];
      return !(owners[0] && owners[1] && owners[0] !== owners[1]);
    });
    if (at === -1) {
      kept.push(item);
      continue;
    }
    const other = kept[at]!;
    const [winner, loser] =
      weight(item) > weight(other) ||
      (weight(item) === weight(other) && tokens(item).size > tokens(other).size)
        ? [item, other]
        : [other, item];
    absorb(winner, loser);
    kept[at] = winner;
  }
  return kept;
}

/**
 * "Later change overrides earlier": an earlier item is dropped when a later one on the same
 * subject, with the same owner or both ownerless, says the opposite (one has a negation, the other does not). The later item stays
 * and keeps the earlier one's line in `alsoAt`, so the history is still reachable.
 */
function dropOverridden(items: Pooled[], topic: Set<string>): Pooled[] {
  const bare = (item: Pooled) =>
    new Set([...contentTokens(item.text)].filter((t) => !topic.has(t)));
  const dropped = new Set<Pooled>();
  for (const earlier of items) {
    const a = bare(earlier);
    for (const later of items) {
      if (later === earlier || later.kind !== earlier.kind || dropped.has(later)) continue;
      if (later.evidence.timestampSec - earlier.evidence.timestampSec < OVERRIDE_GAP_SECONDS)
        continue;
      if (hasNegation(later.text) === hasNegation(earlier.text)) continue;
      // Only the same person (or nobody) can take back a task; Bob declining Alice's task overrides nothing.
      if (ownerOf(later) !== ownerOf(earlier)) continue;
      const b = bare(later);
      if (sharedCount(a, b) < MIN_SHARED || jaccard(a, b) < OVERRIDE_JACCARD) continue;
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

/** Reduces an item list in meeting order; links are never changed, only items removed or merged. */
export function reconcileItems(
  items: Pooled[],
  minutes: number,
  options: ReconcileOptions = {},
): Pooled[] {
  const { itemsPerMinute, minCap } = { ...DEFAULTS, ...options };
  const topic = topicWords(items);
  let out = mergeNearDuplicates(items);
  out = dropOverridden(out, topic);
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
