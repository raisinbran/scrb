const STOPWORDS = new Set(
  ("a an and are as at be been but by can could did do does for from had has have he her his i if in " +
    "into is it its just like may me might more most must my no of on one or our she should so some " +
    "such that the their them then there these they this those to too up us very was we were what " +
    "when where which who will with would you your about also going gonna get got need needs team " +
    "group each all any make made").split(" "),
);

export const NEGATIONS = new Set(["not", "no", "never", "without", "exclude", "excluded", "remove", "removed", "drop", "dropped", "neither", "ruled", "rule", "excluding", "removing"]);

function stem(word: string): string {
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function words(text: string): string[] {
  return text.toLowerCase().replace(/['’]/g, "").match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Stemmed content words, the unit every similarity check here works on. */
export function contentTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const word of words(text)) {
    if (!STOPWORDS.has(word) && !NEGATIONS.has(word)) out.add(stem(word));
  }
  return out;
}

export function hasNegation(text: string): boolean {
  return words(text).some((word) => NEGATIONS.has(word));
}

/** Share of `part` found in `whole`. */
export function coverage(part: Set<string>, whole: Set<string>): number {
  if (part.size === 0) return 0;
  let hits = 0;
  for (const token of part) if (whole.has(token)) hits += 1;
  return hits / part.size;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const shared = coverage(a, b) * a.size;
  return shared / (a.size + b.size - shared);
}
