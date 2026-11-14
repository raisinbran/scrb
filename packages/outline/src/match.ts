import { contentTokens } from '@scrb/summary';
import { buildBlocks, type PinAssignment } from './blocks.js';
import { DEFAULT_TUNING, SHORT_BLOCK_TOKENS, type Tuning } from './constants.js';
import { cosine } from './embed.js';
import type {
  Block,
  Confidence,
  LocatedPin,
  OutlineItem,
  PlacedBlock,
  TranscriptWord,
} from './types.js';

export interface MatchOptions {
  /** Speaker id (as in the words) to display name, for the owner bonus. */
  speakerNames?: Record<string, string>;
  pins?: readonly LocatedPin[];
  tuning?: Partial<Tuning>;
  /**
   * Level B (experiment, off by default): unit-length sentence vectors computed outside this
   * package, one per block (in buildBlocks order, no pins) and one per item. Used only when
   * tuning.semanticWeight > 0.
   */
  semantic?: { blocks: readonly Float32Array[]; items: readonly Float32Array[] };
}

interface WeightedTokens {
  weights: Map<string, number>;
  /** Sum of weight times idf; the denominator of the score. */
  total: number;
}

function itemTokens(items: readonly OutlineItem[], parentWeight: number): WeightedTokens[] {
  const maps = items.map((item, index) => {
    const weights = new Map<string, number>();
    for (const t of contentTokens(item.text)) weights.set(t, 1);
    let level = item.level;
    for (let i = index - 1; i >= 0 && level > 1; i -= 1) {
      const parent = items[i]!;
      if (parent.level < level) {
        level = parent.level;
        for (const t of contentTokens(parent.text))
          if (!weights.has(t)) weights.set(t, parentWeight);
      }
    }
    return weights;
  });
  const df = new Map<string, number>();
  for (const m of maps) for (const t of m.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const n = items.length;
  const idf = (t: string): number => Math.log(1 + n / (df.get(t) ?? 1));
  return maps.map((weights) => {
    const scaled = new Map<string, number>();
    let total = 0;
    for (const [t, w] of weights) {
      scaled.set(t, w * idf(t));
      total += w * idf(t);
    }
    return { weights: scaled, total };
  });
}

function wordingScore(block: ReadonlySet<string>, item: WeightedTokens): number {
  if (item.total === 0) return 0;
  let hit = 0;
  for (const [t, w] of item.weights) if (block.has(t)) hit += w;
  return hit / item.total;
}

function ownHit(block: ReadonlySet<string>, own: ReadonlySet<string>): boolean {
  for (const t of own) if (block.has(t)) return true;
  return false;
}

function transition(from: number, to: number, notPlaced: number, k: Tuning): number {
  if (from === to) return 0;
  if (to === notPlaced) return k.costNotPlacedEnter;
  if (from === notPlaced) return k.costNotPlacedLeave;
  if (to > from) return k.costNext + k.costSkipPerItem * (to - from - 1);
  return k.costBack + k.costBackPerItem * (from - to - 1);
}

/** Level A: wording score per block and item, then the best ordered path (Viterbi). */
export function matchOutline(
  words: readonly TranscriptWord[],
  items: readonly OutlineItem[],
  options: MatchOptions = {},
): PlacedBlock[] {
  const pinnedWords: (PinAssignment | undefined)[] = new Array(words.length).fill(undefined);
  for (const lp of options.pins ?? []) {
    if (lp.status !== 'ok' || lp.first === undefined || lp.last === undefined) continue;
    for (let i = lp.first; i <= lp.last; i += 1)
      pinnedWords[i] = { pinId: lp.pin.id, itemId: lp.pin.itemId };
  }
  const blocks = buildBlocks(words, pinnedWords);
  const k: Tuning = { ...DEFAULT_TUNING, ...options.tuning };
  const n = items.length;
  const notPlaced = n;
  if (blocks.length === 0) return [];
  if (n === 0)
    return blocks.map((b) => ({
      ...b,
      itemId: b.pin ? b.pin.itemId : null,
      confidence: b.pin ? 'confirmed' : 'unsure',
    }));

  const itemIndex = new Map(items.map((it, i) => [it.id, i]));
  const tokens = itemTokens(items, k.parentWeight);
  const owners = items.map((it) => it.ownerName?.toLowerCase());
  const names = options.speakerNames ?? {};

  const sem = options.semantic;
  if (sem && (sem.blocks.length !== blocks.length || sem.items.length !== n))
    throw new Error('semantic vectors do not match blocks and items');
  const ownTokens = items.map((it) => contentTokens(it.text));
  const blockTokens = blocks.map((b) => contentTokens(b.text));
  const short = blockTokens.map((t, i) => t.size < SHORT_BLOCK_TOKENS && !blocks[i]!.pin);
  const scores = blocks.map((_, bi) =>
    items.map((_, ii) => {
      let base = wordingScore(blockTokens[bi]!, tokens[ii]!);
      if (base > 0 && items[ii]!.level > 1 && ownHit(blockTokens[bi]!, ownTokens[ii]!))
        base += k.specificBonus;
      const owner = owners[ii];
      const name = names[blocks[bi]!.speaker]?.toLowerCase();
      if (base > 0 && owner !== undefined && name === owner) base += k.ownerBonus;
      if (sem && k.semanticWeight > 0) {
        const cos = cosine(sem.blocks[bi]!, sem.items[ii]!);
        const b = Math.max(0, cos - k.cosineFloor) / (1 - k.cosineFloor);
        base = (1 - k.semanticWeight) * base + k.semanticWeight * b;
      }
      return base;
    }),
  );

  // cost[b][s]: emission cost of block b in state s (items 0..n-1, then Not placed).
  const emission = (bi: number, s: number): number => {
    const block = blocks[bi]!;
    if (block.pin) {
      const target =
        block.pin.itemId === null ? notPlaced : (itemIndex.get(block.pin.itemId) ?? notPlaced);
      return s === target ? 0 : Infinity;
    }
    if (short[bi]) return 0;
    const evidence = Math.min(1, blockTokens[bi]!.size / k.fullEvidenceTokens);
    return -(s === notPlaced ? k.notPlacedScore : scores[bi]![s]!) * evidence;
  };

  const states = n + 1;
  let prev = new Array<number>(states);
  const back: Int32Array[] = [];
  for (let s = 0; s < states; s += 1)
    prev[s] = emission(0, s) + (s === notPlaced ? 0 : k.costStartPerItem * s);
  back.push(new Int32Array(states).fill(-1));
  for (let bi = 1; bi < blocks.length; bi += 1) {
    const cur = new Array<number>(states);
    const from = new Int32Array(states);
    for (let s = 0; s < states; s += 1) {
      const e = emission(bi, s);
      let best = Infinity;
      let arg = 0;
      for (let p = 0; p < states; p += 1) {
        const c = prev[p]! + transition(p, s, notPlaced, k);
        if (c < best) {
          best = c;
          arg = p;
        }
      }
      cur[s] = best + e;
      from[s] = arg;
    }
    back.push(from);
    prev = cur;
  }
  let state = 0;
  for (let s = 1; s < states; s += 1) if (prev[s]! < prev[state]!) state = s;
  const path = new Array<number>(blocks.length);
  for (let bi = blocks.length - 1; bi >= 0; bi -= 1) {
    path[bi] = state;
    state = back[bi]![state]!;
  }

  // Short blocks between two blocks of the same item join that item.
  for (let bi = 1; bi < blocks.length - 1; bi += 1) {
    if (!short[bi] || path[bi] !== notPlaced) continue;
    const a = path[bi - 1]!;
    if (a !== notPlaced && a === path[bi + 1]) path[bi] = a;
  }

  return blocks.map((block, bi): PlacedBlock => {
    const s = path[bi]!;
    const itemId = s === notPlaced ? null : items[s]!.id;
    let confidence: Confidence = 'unsure';
    if (block.pin) confidence = 'confirmed';
    else if (s !== notPlaced) {
      if (short[bi]) {
        const agree = bi > 0 && bi < blocks.length - 1 && path[bi - 1] === s && path[bi + 1] === s;
        confidence = agree ? 'likely' : 'unsure';
      } else {
        const own = scores[bi]![s]!;
        let runnerUp = 0;
        for (let i = 0; i < n; i += 1)
          if (i !== s && scores[bi]![i]! > runnerUp) runnerUp = scores[bi]![i]!;
        if (own >= k.likelyMinScore && own - runnerUp >= k.likelyMinMargin) confidence = 'likely';
      }
    }
    return { ...(block as Block), itemId, confidence };
  });
}
