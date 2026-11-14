/** Package-local types; mapped to the shared contract in a later slice. */

export interface OutlineItem {
  id: string;
  /** 1 = heading, 2 = subheading, and so on. */
  level: number;
  text: string;
  /** Typed name only; resolved to a speaker when a meeting is sorted. */
  ownerName?: string;
}

export interface ParseResult {
  items: OutlineItem[];
  notes: string[];
  /** Set when the text is rejected as a whole; items is then empty. */
  error?: 'empty' | 'tooLong' | 'tooManyItems';
}

/** One spoken word, in time order across the whole meeting. */
export interface TranscriptWord {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  speaker: string;
}

/** The unit that gets placed. A pinned block covers exactly one pin's words. */
export interface Block {
  /** Index range into the word array, inclusive. */
  first: number;
  last: number;
  startMs: number;
  endMs: number;
  speaker: string;
  text: string;
  /** Present when the user pinned these words; null itemId = Not placed. */
  pin?: { pinId: string; itemId: string | null };
}

export type Confidence = 'likely' | 'unsure' | 'confirmed';

export interface PlacedBlock extends Block {
  /** null = Not placed. */
  itemId: string | null;
  confidence: Confidence;
}

export interface PinFingerprint {
  /** Normalised words of the pinned range. */
  words: string[];
  before: string[];
  after: string[];
}

export interface Pin {
  id: string;
  itemId: string | null;
  firstWordId: string;
  lastWordId: string;
  startMs: number;
  endMs: number;
  fingerprint: PinFingerprint;
}

export type PinStatus = 'ok' | 'needsRecheck';

export interface LocatedPin {
  pin: Pin;
  status: PinStatus;
  /** Word index range; only when status is "ok". */
  first?: number;
  last?: number;
}
