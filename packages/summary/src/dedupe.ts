import { contentTokens, coverage, hasNegation, jaccard } from "./text.js";
import type { ItemFlag, SummaryItem } from "./types.js";
import { NOT_SPECIFIED, UNCONFIRMED } from "./types.js";

const SAME_JACCARD = 0.6;
const SAME_CONTAINMENT = 0.8;
const CONFLICT_JACCARD = 0.5;

function ownerOf(item: SummaryItem): string | null {
  if (item.kind !== "action") return null;
  return item.owner === NOT_SPECIFIED || item.owner === UNCONFIRMED ? null : item.owner.toLowerCase();
}

function sameItem(a: SummaryItem, b: SummaryItem): boolean {
  const left = contentTokens(a.text);
  const right = contentTokens(b.text);
  const similar =
    jaccard(left, right) >= SAME_JACCARD ||
    coverage(left, right) >= SAME_CONTAINMENT ||
    coverage(right, left) >= SAME_CONTAINMENT;
  if (!similar || hasNegation(a.text) !== hasNegation(b.text)) return false;
  // The same words for two people are two tasks.
  const owners = [ownerOf(a), ownerOf(b)];
  return !(owners[0] && owners[1] && owners[0] !== owners[1]);
}

function addFlag(item: SummaryItem, flag: ItemFlag): void {
  if (!item.flags.includes(flag)) item.flags.push(flag);
}

/** The surviving item is the better-supported one, then the more specific. */
function better(a: SummaryItem, b: SummaryItem): SummaryItem {
  const weak = (item: SummaryItem) => (item.flags.includes("weak_evidence") ? 1 : 0);
  if (weak(a) !== weak(b)) return weak(a) < weak(b) ? a : b;
  return contentTokens(b.text).size > contentTokens(a.text).size ? b : a;
}

/** Merges repeats of the same kind; `items` go in first-pass-first order. */
export function dedupe<T extends SummaryItem>(items: T[]): T[] {
  const kept: T[] = [];
  for (const item of items) {
    const index = kept.findIndex((other) => other.kind === item.kind && sameItem(other, item));
    if (index === -1) {
      kept.push(item);
      continue;
    }
    const other = kept[index]!;
    const winner = better(other, item) as T;
    const loser = winner === other ? item : other;
    winner.alsoAt.push(loser.evidence, ...loser.alsoAt);
    if (winner.kind === "action" && loser.kind === "action" && ownerOf(winner) === null && ownerOf(loser) !== null) {
      winner.owner = loser.owner;
      winner.flags = winner.flags.filter((flag) => flag !== "owner_unconfirmed");
    }
    kept[index] = winner;
  }
  return kept;
}

/** Flags, and does not resolve, two decisions that contradict: the reader must see both. */
export function flagConflicts(items: SummaryItem[]): void {
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i]!;
      const b = items[j]!;
      if (hasNegation(a.text) !== hasNegation(b.text) && jaccard(contentTokens(a.text), contentTokens(b.text)) >= CONFLICT_JACCARD) {
        addFlag(a, "conflict");
        addFlag(b, "conflict");
      }
    }
  }
}
