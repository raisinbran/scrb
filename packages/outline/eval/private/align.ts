import { contentTokens } from '@scrb/summary';
import { buildBlocks } from '../../src/blocks.js';
import type { Block, TranscriptWord } from '../../src/types.js';

/** Minimum content words in the notes body for an item to count as aligned. */
export const MIN_BODY_TOKENS = 3;
/** A block needs this many content words to be placed by the notes at all. */
const MIN_BLOCK_TOKENS = 3;
/** Cosine a block must beat to be given an item; below it the block stays unlabelled. */
const TAU = 0.05;
/** Penalty per outline item skipped when the true order moves forward. */
const SKIP = 0.01;

/** Content words, cut to 6 letters so plurals, endings and many typos still meet. */
function keys(text: string): Set<string> {
  const out = new Set<string>();
  for (const t of contentTokens(text)) out.add(t.length > 6 ? t.slice(0, 6) : t);
  return out;
}

export interface Alignment {
  blocks: Block[];
  /** Outline item index per word, or null (no notes section fits). */
  wordItem: (number | null)[];
  alignedItems: number;
  /** Mean cosine of the blocks that received a label. */
  meanScore: number;
}

/**
 * Builds the reference for one meeting from its final notes. Blocks (the engine's own cutting) are
 * given the notes section they resemble most, subject to the sections being visited in outline order
 * (a best-path search, so one stray similar block cannot pull the order away). Blocks between two
 * blocks of the same item inherit it. The heading text is not used, only the notes body.
 */
export function alignNotes(words: readonly TranscriptWord[], bodies: (string | null)[]): Alignment {
  const blocks = buildBlocks(words);
  const sections: { item: number; keys: Set<string> }[] = [];
  bodies.forEach((b, i) => {
    if (b === null) return;
    const k = keys(b);
    if (k.size >= MIN_BODY_TOKENS) sections.push({ item: i, keys: k });
  });
  const m = sections.length;
  const n = blocks.length;
  const df = new Map<string, number>();
  for (const s of sections) for (const t of s.keys) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = (t: string): number => Math.log(1 + m / (df.get(t) ?? 0.5));
  const norm = sections.map((s) => Math.sqrt([...s.keys].reduce((a, t) => a + idf(t) ** 2, 0)));

  const sim: number[][] = blocks.map((b) => {
    const k = keys(b.text);
    if (k.size < MIN_BLOCK_TOKENS || m === 0) return new Array<number>(m).fill(0);
    const bn = Math.sqrt([...k].reduce((a, t) => a + idf(t) ** 2, 0));
    return sections.map((s, j) => {
      let dot = 0;
      for (const t of k) if (s.keys.has(t)) dot += idf(t) ** 2;
      return norm[j]! > 0 && bn > 0 ? dot / (bn * norm[j]!) : 0;
    });
  });

  // dp[i][q]: best total after block i with the last labelled section q (0 = none yet, else q-1).
  const NEG = -1e9;
  let prev = new Array<number>(m + 1).fill(NEG);
  prev[0] = 0;
  const back: { from: number; assigned: boolean }[][] = [];
  for (let i = 0; i < n; i += 1) {
    const cur = new Array<number>(m + 1).fill(NEG);
    const bp: { from: number; assigned: boolean }[] = new Array(m + 1);
    for (let q = 0; q <= m; q += 1) {
      cur[q] = prev[q]!;
      bp[q] = { from: q, assigned: false };
    }
    for (let q = 1; q <= m; q += 1) {
      const gain = sim[i]![q - 1]! - TAU;
      for (let p = 0; p <= q; p += 1) {
        if (prev[p]! <= NEG / 2) continue;
        const skip = q > p ? SKIP * (q - p - 1) : 0;
        const v = prev[p]! - skip + gain;
        if (v > cur[q]!) {
          cur[q] = v;
          bp[q] = { from: p, assigned: true };
        }
      }
    }
    back.push(bp);
    prev = cur;
  }
  const blockSection: (number | null)[] = new Array(n).fill(null);
  let q = 0;
  for (let q2 = 0; q2 <= m; q2 += 1) if (prev[q2]! > prev[q]!) q = q2;
  for (let i = n - 1; i >= 0; i -= 1) {
    const b = back[i]![q]!;
    if (b.assigned) blockSection[i] = q - 1;
    q = b.from;
  }
  // Fill unlabelled blocks that sit between two blocks of the same section.
  let lastIdx = -1;
  for (let i = 0; i < n; i += 1) {
    if (blockSection[i] === null) continue;
    if (lastIdx >= 0 && blockSection[lastIdx] === blockSection[i])
      for (let k = lastIdx + 1; k < i; k += 1) blockSection[k] = blockSection[i]!;
    lastIdx = i;
  }
  const wordItem: (number | null)[] = new Array(words.length).fill(null);
  let scoreSum = 0;
  let scored = 0;
  blocks.forEach((b, i) => {
    const s = blockSection[i];
    if (s === null || s === undefined) return;
    const item = sections[s]!.item;
    for (let w = b.first; w <= b.last; w += 1) wordItem[w] = item;
    if (sim[i]![s]! > TAU) {
      scoreSum += sim[i]![s]!;
      scored += 1;
    }
  });
  return { blocks, wordItem, alignedItems: m, meanScore: scored ? scoreSum / scored : 0 };
}
