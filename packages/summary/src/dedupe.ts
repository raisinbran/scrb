import { contentTokens, coverage, hasNegation, jaccard } from "./text.js";
import type { ItemFlag, SummaryItem } from "./types.js";
import { EVERYONE, NOT_SPECIFIED, UNCONFIRMED } from "./types.js";

const SAME_JACCARD = 0.6;
const SAME_CONTAINMENT = 0.8;
const CONFLICT_JACCARD = 0.5;
/** Two items raised this close together need less likeness to be the same point. */
const NEARBY_SECONDS = 60;
const NEARBY_JACCARD = 0.4;
const NEARBY_CONTAINMENT = 0.6;
/** Likeness means little when it rests on one or two words. */
const MIN_SHARED = 3;
const TOPIC_SHARE = 0.15;
const MIN_ITEMS_FOR_TOPIC = 12;

function ownerOf(item: SummaryItem): string | null {
  if (item.kind !== "action") return null;
  return item.owner === NOT_SPECIFIED || item.owner === UNCONFIRMED || item.owner === EVERYONE ? null : item.owner.toLowerCase();
}

/** Words in a large share of a meeting's items name its topic, and say nothing about likeness. */
function topicWords(items: SummaryItem[]): Set<string> {
  const counts = new Map<string, number>();
  for (const item of items) for (const token of contentTokens(item.text)) counts.set(token, (counts.get(token) ?? 0) + 1);
  const topic = new Set<string>();
  if (items.length < MIN_ITEMS_FOR_TOPIC) return topic;
  for (const [token, count] of counts) if (count / items.length >= TOPIC_SHARE) topic.add(token);
  return topic;
}

function withoutTopic(text: string, topic: Set<string>): Set<string> {
  return new Set([...contentTokens(text)].filter((token) => !topic.has(token)));
}

function sameItem(a: SummaryItem, b: SummaryItem, topic: Set<string>): boolean {
  const left = withoutTopic(a.text, topic);
  const right = withoutTopic(b.text, topic);
  const nearby = Math.abs(a.evidence.timestampSec - b.evidence.timestampSec) <= NEARBY_SECONDS;
  const similar =
    jaccard(left, right) >= (nearby ? NEARBY_JACCARD : SAME_JACCARD) ||
    Math.max(coverage(left, right), coverage(right, left)) >= (nearby ? NEARBY_CONTAINMENT : SAME_CONTAINMENT);
  if (similar && coverage(left, right) * left.size < MIN_SHARED) return false;
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
  const topic = topicWords(items);
  for (const item of items) {
    const index = kept.findIndex((other) => other.kind === item.kind && sameItem(other, item, topic));
    if (index === -1) {
      kept.push(item);
      continue;
    }
    const other = kept[index]!;
    const winner = better(other, item) as T;
    const loser = winner === other ? item : other;
    winner.alsoAt.push(loser.evidence, ...loser.alsoAt);
    // A coverage hit capped at tentative takes the first pass's status when both found it.
    if (winner.kind === "decision" && loser.kind === "decision" && loser.pass === "primary") winner.status = loser.status;
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
