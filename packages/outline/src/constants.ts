/** Every tunable of Level A lives here, so tuning is one file. */

export const MAX_ITEMS = 200;
export const MAX_TEXT_CHARS = 50_000;

/** Blocks: a pause this long ends a block; a block longer than this is cut. */
export const BLOCK_PAUSE_MS = 2000;
export const BLOCK_MAX_MS = 60_000;

/** Blocks with fewer content words than this get no wording score of their own. */
export const SHORT_BLOCK_TOKENS = 8;

/** Parent headings count this much as wording for a child item. */
export const PARENT_WEIGHT = 0.4;

/** Path costs (a block's wording score is in 0..1 and is subtracted from cost). */
export const COST_NEXT = 0.12;
export const COST_SKIP_PER_ITEM = 0.1;
export const COST_BACK = 0.5;
export const COST_BACK_PER_ITEM = 0.03;
export const COST_NOT_PLACED_ENTER = 0.15;
export const COST_NOT_PLACED_LEAVE = 0.15;

/** A block must score above this to prefer an item over Not placed. */
export const NOT_PLACED_SCORE = 0.25;
/** Evidence grows with block length up to this many content words. */
export const FULL_EVIDENCE_TOKENS = 12;

/** A subheading whose own words match beats an equal match on its parent. */
export const SPECIFIC_BONUS = 0.1;
export const COST_START_PER_ITEM = 0.05;

/** Bonus when the block's speaker is the item's owner and wording already matches. */
export const OWNER_BONUS = 0.15;

/** Confidence cut-offs. */
export const LIKELY_MIN_SCORE = 0.45;
export const LIKELY_MIN_MARGIN = 0.15;

/** Pin re-location: how many words of context to fingerprint, and the time window. */
export const PIN_CONTEXT_WORDS = 3;
export const PIN_SEARCH_WINDOW_MS = 30_000;

/** The matcher's tunables as one object, so the evaluation can try other values. */
export interface Tuning {
  costNext: number;
  costSkipPerItem: number;
  costBack: number;
  costBackPerItem: number;
  costNotPlacedEnter: number;
  costNotPlacedLeave: number;
  costStartPerItem: number;
  notPlacedScore: number;
  fullEvidenceTokens: number;
  ownerBonus: number;
  specificBonus: number;
  parentWeight: number;
  likelyMinScore: number;
  likelyMinMargin: number;
  /** Level B only: share of the score from sentence-vector similarity (0 = Level A only). */
  semanticWeight: number;
  /** Level B only: cosine at or below this counts as no similarity. */
  cosineFloor: number;
}

export const DEFAULT_TUNING: Tuning = {
  costNext: COST_NEXT,
  costSkipPerItem: COST_SKIP_PER_ITEM,
  costBack: COST_BACK,
  costBackPerItem: COST_BACK_PER_ITEM,
  costNotPlacedEnter: COST_NOT_PLACED_ENTER,
  costNotPlacedLeave: COST_NOT_PLACED_LEAVE,
  costStartPerItem: COST_START_PER_ITEM,
  notPlacedScore: NOT_PLACED_SCORE,
  fullEvidenceTokens: FULL_EVIDENCE_TOKENS,
  ownerBonus: OWNER_BONUS,
  specificBonus: SPECIFIC_BONUS,
  parentWeight: PARENT_WEIGHT,
  likelyMinScore: LIKELY_MIN_SCORE,
  likelyMinMargin: LIKELY_MIN_MARGIN,
  semanticWeight: 0,
  cosineFloor: 0.2,
};
