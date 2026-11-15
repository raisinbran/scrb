/** Frozen text rules for the local-model scorer (plan section 3). Pure, no I/O. */

export interface Tok {
  raw: string;
  low: string;
  /** Capitalised alphabetic word. */
  cap: boolean;
  alpha: boolean;
}

const STOP = new Set(
  (
    'a an and are as at be been being but by can could did do does for from had has have he her his i if in ' +
    'into is it its just like may me might more most must my of on or our she shall should so some such ' +
    'that the their them then there these they this those to too up us very was we were what when where ' +
    'which who will with would you your about also going gonna get got need needs each all any than ' +
    'around over under per next last approximately roughly total will wont dont'
  ).split(' '),
);

/** Words skipped when looking for the word a value is attached to. */
const TRANSPARENT = new Set(
  'the a an of to for by on at in is are was were be been will would should about around approximately roughly total up over under than from per each every our their its his her next last this these those new only about'.split(
    ' ',
  ),
);

const BARRIER = new Set([
  'and',
  'or',
  'but',
  'while',
  'then',
  'which',
  'that',
  'whereas',
  ',',
  ';',
  ':',
  '.',
  '!',
  '?',
]);

const NEGATIONS = new Set([
  'not',
  'no',
  'never',
  'cannot',
  'without',
  'against',
  'unable',
  'neither',
  'nor',
  "won't",
  "can't",
  "don't",
  "doesn't",
  "didn't",
  "isn't",
  "aren't",
  "wasn't",
  "weren't",
  "shouldn't",
  "wouldn't",
  "couldn't",
  "hasn't",
  "haven't",
  "mustn't",
  "shan't",
]);
const REJECT = /^(reject|declin|deny|denie|cancel|refus|veto|abandon|scrap|shelv)/;

const MONTH_MAP: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};
const WEEKDAY_MAP: Record<string, number> = {
  monday: 0,
  mon: 0,
  tuesday: 1,
  tue: 1,
  tues: 1,
  wednesday: 2,
  wed: 2,
  thursday: 3,
  thu: 3,
  thur: 3,
  thurs: 3,
  friday: 4,
  fri: 4,
  saturday: 5,
  sat: 5,
  sunday: 6,
  sun: 6,
};
const UNITS = /^(minute|hour|day|week|month|quarter|year|sprint)s?$/;
const NUMWORDS: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  thousand: 1000,
};

export const COMMIT_AFTER = new Set(
  (
    'will would can could should shall must may might to going needs need agreed volunteered offered promised plans ' +
    "takes owns has have wont won't can't cannot 'll said says argued proposed suggested noted confirmed reported stated insisted objected recommended decided"
  ).split(' '),
);

/** Light stemmer, then cut to 6 letters (plan: "words cut to 6 letters"). */
export function stem(word: string): string {
  let w = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ied')) w = w.slice(0, -3) + 'y';
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith('es')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
  return w.slice(0, 6);
}

export function tokenize(text: string): Tok[] {
  const re =
    /\$?\d[\d,]*(?:\.\d+)?(?::\d\d)?(?:st|nd|rd|th|am|pm|k|m|%)?|[A-Za-z]+(?:['’][A-Za-z]+)?|[,;:.!?]/g;
  const out: Tok[] = [];
  for (const m of text.matchAll(re)) {
    let raw = m[0].replace('’', "'");
    const ll = /^(.+)'ll$/i.exec(raw);
    if (ll) {
      out.push(mk(ll[1]!), mk('will'));
      continue;
    }
    raw = raw.replace(/'s$/i, '');
    out.push(mk(raw));
  }
  return out;
}

function mk(raw: string): Tok {
  const alpha = /^[A-Za-z]/.test(raw);
  return { raw, low: raw.toLowerCase(), cap: alpha && /^[A-Z]/.test(raw), alpha };
}

export const isBarrier = (t: Tok): boolean => BARRIER.has(t.low);
export const isTransparent = (t: Tok): boolean => TRANSPARENT.has(t.low);
export const isStop = (t: Tok): boolean => STOP.has(t.low) || NEGATIONS.has(t.low);
export const isNegation = (t: Tok): boolean => NEGATIONS.has(t.low) || /n't$/.test(t.low);
export const isReject = (t: Tok): boolean => REJECT.test(t.low);
export const monthIndex = (low: string): number => MONTH_MAP[low] ?? -1;
export const weekdayIndex = (low: string): number => WEEKDAY_MAP[low] ?? -1;
export const isUnit = (low: string): boolean => UNITS.test(low);
export const numberWord = (low: string): number | undefined => NUMWORDS[low];
/** A month or weekday name. Abbreviations ("sat", "dec") count only when capitalised. */
export function isDateTok(t: Tok): boolean {
  if (!t.alpha) return false;
  const full =
    t.low.length > 4 || ['may', 'june', 'july', 'march', 'april', 'monday'].includes(t.low);
  if (monthIndex(t.low) >= 0 || weekdayIndex(t.low) >= 0) return full || t.cap;
  return ['today', 'tomorrow', 'yesterday', 'tonight', 'noon', 'midnight'].includes(t.low);
}

export function contentStems(text: string): string[] {
  const out: string[] = [];
  for (const t of tokenize(text)) {
    if (!t.alpha || isStop(t) || isDateTok(t) || numberWord(t.low) !== undefined) continue;
    const s = stem(t.low);
    if (s.length > 1) out.push(s);
  }
  return out;
}

export function f1(a: readonly string[], b: readonly string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 || B.size === 0) return 0;
  let hit = 0;
  for (const x of A) if (B.has(x)) hit += 1;
  if (hit === 0) return 0;
  const p = hit / B.size;
  const r = hit / A.size;
  return (2 * p * r) / (p + r);
}

/** Round half up, for display only. Comparisons never use this. */
export const roundHalfUp = (x: number): number => Math.floor(x + 0.5);
