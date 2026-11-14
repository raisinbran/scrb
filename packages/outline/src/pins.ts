import { PIN_CONTEXT_WORDS, PIN_SEARCH_WINDOW_MS } from './constants.js';
import type { LocatedPin, Pin, TranscriptWord } from './types.js';

function norm(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function normWords(words: readonly TranscriptWord[], from: number, to: number): string[] {
  const out: string[] = [];
  for (let i = Math.max(0, from); i <= Math.min(words.length - 1, to); i += 1) {
    const n = norm(words[i]!.text);
    if (n) out.push(n);
  }
  return out;
}

/** A pin belongs to a word range, not to a block; the fingerprint lets it be found again. */
export function makePin(
  id: string,
  words: readonly TranscriptWord[],
  first: number,
  last: number,
  itemId: string | null,
): Pin {
  return {
    id,
    itemId,
    firstWordId: words[first]!.id,
    lastWordId: words[last]!.id,
    startMs: words[first]!.startMs,
    endMs: words[last]!.endMs,
    fingerprint: {
      words: normWords(words, first, last),
      before: normWords(words, first - PIN_CONTEXT_WORDS, first - 1),
      after: normWords(words, last + 1, last + PIN_CONTEXT_WORDS),
    },
  };
}

function sameSeq(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Normalised words of the window starting at `start` that has `count` non-empty words. */
function windowEnd(words: readonly TranscriptWord[], start: number, count: number): number {
  let seen = 0;
  for (let i = start; i < words.length; i += 1) {
    if (norm(words[i]!.text)) seen += 1;
    if (seen === count) return i;
  }
  return -1;
}

function contextScore(
  words: readonly TranscriptWord[],
  pin: Pin,
  first: number,
  last: number,
): number {
  const before = normWords(words, first - PIN_CONTEXT_WORDS, first - 1);
  const after = normWords(words, last + 1, last + PIN_CONTEXT_WORDS);
  let score = 0;
  for (let k = 1; k <= Math.min(before.length, pin.fingerprint.before.length); k += 1)
    if (before[before.length - k] === pin.fingerprint.before[pin.fingerprint.before.length - k])
      score += 1;
  for (let k = 0; k < Math.min(after.length, pin.fingerprint.after.length); k += 1)
    if (after[k] === pin.fingerprint.after[k]) score += 1;
  return score;
}

/**
 * Finds each pin in a (possibly re-transcribed) word list: first by word ids, then by
 * fingerprint near the old time. The fingerprint match must be unambiguous. If it is not
 * (a repeated phrase, changed or missing words) the pin is kept as needsRecheck and is not
 * applied to any words. A pin is never dropped and never applied to different text.
 */
export function locatePins(pins: readonly Pin[], words: readonly TranscriptWord[]): LocatedPin[] {
  const indexById = new Map<string, number>();
  words.forEach((w, i) => indexById.set(w.id, i));

  return pins.map((pin): LocatedPin => {
    const fp = pin.fingerprint.words;
    if (fp.length === 0) return { pin, status: 'needsRecheck' };

    const a = indexById.get(pin.firstWordId);
    const b = indexById.get(pin.lastWordId);
    if (a !== undefined && b !== undefined && a <= b && sameSeq(normWords(words, a, b), fp))
      return { pin, status: 'ok', first: a, last: b };

    const candidates: { first: number; last: number; score: number }[] = [];
    for (let i = 0; i < words.length; i += 1) {
      if (Math.abs(words[i]!.startMs - pin.startMs) > PIN_SEARCH_WINDOW_MS) continue;
      if (norm(words[i]!.text) !== fp[0]) continue;
      const end = windowEnd(words, i, fp.length);
      if (end < 0 || !sameSeq(normWords(words, i, end), fp)) continue;
      candidates.push({ first: i, last: end, score: contextScore(words, pin, i, end) });
    }
    if (candidates.length === 0) return { pin, status: 'needsRecheck' };
    const best = Math.max(...candidates.map((c) => c.score));
    const top = candidates.filter((c) => c.score === best);
    if (candidates.length > 1 && top.length > 1) return { pin, status: 'needsRecheck' };
    const hit = top[0]!;
    return { pin, status: 'ok', first: hit.first, last: hit.last };
  });
}
