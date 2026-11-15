import {
  COMMIT_AFTER,
  contentStems,
  f1,
  isBarrier,
  isDateTok,
  isNegation,
  isReject,
  isStop,
  isTransparent,
  isUnit,
  monthIndex,
  numberWord,
  stem,
  tokenize,
  weekdayIndex,
  type Tok,
} from './text.js';

/** A date, time, duration or quantity, with the nearest content word on each side. */
export interface Value {
  key: string;
  L: string;
  R: string;
}

/** The role-level tuple of plan section 3: who, what, when/number, polarity. */
export interface Facts {
  /** Owners of an action, or the speaker a statement is attributed to. Lower case, sorted. */
  owners: string[];
  /** Every name in the point, any role. */
  names: string[];
  values: Value[];
  /** False when an odd number of negations or rejections. */
  positive: boolean;
  what: string[];
}

const NOT_NAMES = new Set([
  'I',
  'We',
  'The',
  'A',
  'An',
  'This',
  'That',
  'It',
  'He',
  'She',
  'They',
  'You',
  'There',
  'Then',
  'So',
  'And',
  'But',
  'If',
  'Our',
  'Their',
  'My',
  'His',
  'Her',
  'Its',
  'Assigned',
  'Owner',
  'Lead',
  'Assignee',
  'Driver',
]);
const ASSIGN_VERBS = new Set([
  'assigned',
  'assign',
  'assigns',
  'goes',
  'go',
  'went',
  'handed',
  'hands',
  'delegated',
  'falls',
  'passed',
  'reassigned',
  'allocated',
  'given',
]);
const OWNER_NOUNS = new Set(['owner', 'lead', 'assignee', 'driver']);
const ADDRESSED = new Set(['can', 'could', 'will', 'would', 'please', 'should']);
const IS_FOLLOW = new Set([
  'going',
  'responsible',
  'to',
  'taking',
  'owning',
  'leading',
  'handling',
]);

const NO_WORDS: ReadonlySet<string> = new Set();

/** Words seen in lower case in any of these texts; used to tell a sentence-initial noun from a name. */
export function lowerWords(texts: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const t of texts)
    for (const k of tokenize(t)) if (k.alpha && k.raw === k.low) out.add(k.low);
  return out;
}

const numRe = /^(\$?)(\d[\d,]*(?:\.\d+)?)(?::(\d\d))?(st|nd|rd|th|am|pm|k|m|%)?$/;

interface Raw {
  key: string;
  start: number;
  end: number;
}

interface Num {
  v: number;
  cur: string;
  suf: string;
  colon?: string;
}

function parseNum(t: Tok | undefined): Num | null {
  if (!t) return null;
  const m = numRe.exec(t.low);
  if (!m) return null;
  let v = Number(m[2]!.replace(/,/g, ''));
  const suf = m[4] ?? '';
  if (suf === 'k') v *= 1000;
  if (suf === 'm') v *= 1_000_000;
  return { v, cur: m[1] ?? '', suf, colon: m[3] };
}

const isDay = (n: Num | null): n is Num =>
  !!n &&
  !n.colon &&
  !n.cur &&
  n.v >= 1 &&
  n.v <= 31 &&
  (n.suf === '' || /^(st|nd|rd|th)$/.test(n.suf));

function extractValues(toks: Tok[], consumed: boolean[]): Raw[] {
  const out: Raw[] = [];
  const take = (key: string, start: number, end: number): void => {
    for (let k = start; k <= end; k += 1) consumed[k] = true;
    out.push({ key, start, end });
  };
  const n = toks.length;
  const isMonth = (i: number): boolean => {
    const t = toks[i];
    if (!t || !t.alpha || !isDateTok(t) || monthIndex(t.low) < 0) return false;
    return (
      t.low !== 'may' ||
      t.cap ||
      /^\d/.test(toks[i + 1]?.low ?? '') ||
      /^\d/.test(toks[i - 1]?.low ?? '')
    );
  };
  for (let i = 0; i < n; i += 1) {
    if (consumed[i]) continue;
    const t = toks[i]!;
    const num = parseNum(t);
    if (isDay(num)) {
      const j = toks[i + 1]?.low === 'of' ? i + 2 : i + 1;
      if (isMonth(j)) {
        let end = j;
        if (/^(19|20)\d\d$/.test(toks[j + 1]?.low ?? '')) end = j + 1;
        take(`d:${monthIndex(toks[j]!.low)}-${num.v}`, i, end);
        continue;
      }
    }
    if (isMonth(i)) {
      const nx = parseNum(toks[i + 1]);
      if (isDay(nx)) {
        let end = i + 1;
        if (toks[end + 1]?.low === ',' && /^(19|20)\d\d$/.test(toks[end + 2]?.low ?? '')) end += 2;
        else if (/^(19|20)\d\d$/.test(toks[end + 1]?.low ?? '')) end += 1;
        take(`d:${monthIndex(t.low)}-${nx.v}`, i, end);
      } else take(`d:${monthIndex(t.low)}`, i, i);
      continue;
    }
    if (t.alpha) {
      const w = weekdayIndex(t.low);
      if (w >= 0 && isDateTok(t)) {
        const prev = toks[i - 1]?.low;
        if (prev === 'next' || prev === 'last' || prev === 'this')
          take(`d:wk${w}-${prev}`, i - 1, i);
        else take(`d:wk${w}`, i, i);
        continue;
      }
      if (['today', 'tomorrow', 'yesterday', 'tonight'].includes(t.low)) {
        take(`d:${t.low}`, i, i);
        continue;
      }
      if (t.low === 'noon') {
        take('t:12:00', i, i);
        continue;
      }
      if (
        (t.low === 'next' || t.low === 'last' || t.low === 'this') &&
        toks[i + 1] &&
        isUnit(toks[i + 1]!.low)
      ) {
        take(`d:${t.low}-${toks[i + 1]!.low.replace(/s$/, '')}`, i, i + 1);
        continue;
      }
      if (t.low === 'end' && toks[i + 1]?.low === 'of') {
        const j = toks[i + 2]?.low === 'the' ? i + 3 : i + 2;
        if (toks[j] && isUnit(toks[j]!.low)) {
          take(`d:end-${toks[j]!.low.replace(/s$/, '')}`, i, j);
          continue;
        }
      }
      if (t.low === 'q' && /^[1-4]$/.test(toks[i + 1]?.low ?? '')) {
        take(`d:q${toks[i + 1]!.low}`, i, i + 1);
        continue;
      }
    }
    if (num) {
      const ampm =
        num.suf === 'am' || num.suf === 'pm'
          ? num.suf
          : /^(am|pm)$/.test(toks[i + 1]?.low ?? '')
            ? toks[i + 1]!.low
            : '';
      if (num.colon !== undefined || ampm) {
        let h = Math.floor(num.v);
        if (ampm === 'pm' && h < 12) h += 12;
        if (ampm === 'am' && h === 12) h = 0;
        const inline = num.suf === 'am' || num.suf === 'pm' || num.colon !== undefined;
        take(`t:${h}:${num.colon ?? '00'}`, i, inline ? i : i + 1);
        continue;
      }
      const nx = toks[i + 1];
      if (nx && isUnit(nx.low) && !num.cur) {
        take(`u:${num.v}-${nx.low.replace(/s$/, '')}`, i, i + 1);
        continue;
      }
      if (/^(st|nd|rd|th)$/.test(num.suf)) take(`o:${num.v}`, i, i);
      else take(`n:${num.cur}${num.v}${num.suf === '%' ? '%' : ''}`, i, i);
      continue;
    }
    if (t.alpha && numberWord(t.low) !== undefined) {
      let cur = 0;
      let j = i;
      for (; j < n && toks[j]!.alpha && numberWord(toks[j]!.low) !== undefined; j += 1) {
        const w = numberWord(toks[j]!.low)!;
        cur = w < 100 ? cur + w : (cur || 1) * w;
      }
      const end = j - 1;
      const un = toks[end + 1];
      if (un && isUnit(un.low)) take(`u:${cur}-${un.low.replace(/s$/, '')}`, i, end + 1);
      else take(`n:${cur}`, i, end);
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

function bindWord(toks: Tok[], consumed: boolean[], from: number, step: 1 | -1): string {
  for (let j = from; j >= 0 && j < toks.length; j += step) {
    const t = toks[j]!;
    if (consumed[j] || isBarrier(t) || !t.alpha) return '';
    if (isTransparent(t) || isStop(t)) continue;
    return stem(t.low);
  }
  return '';
}

function isNameToken(
  toks: Tok[],
  i: number,
  consumed: boolean[],
  common: ReadonlySet<string>,
): boolean {
  const t = toks[i]!;
  if (consumed[i] || !t.cap || !/^[A-Z][a-z]+$/.test(t.raw) || NOT_NAMES.has(t.raw)) return false;
  const prev = toks[i - 1];
  const sentenceStart = !prev || ['.', '!', '?'].includes(prev.low);
  if (!sentenceStart) return true;
  // A capitalised first word is a name only if it is never seen in lower case in the texts being compared
  // ("Contractors will" is a noun; "Bob will" is a name) and a commitment or attribution follows.
  if (common.has(t.low)) return false;
  const nx = toks[i + 1];
  const n2 = toks[i + 2];
  return (
    !!nx &&
    (COMMIT_AFTER.has(nx.low) ||
      nx.low === ',' ||
      (nx.low === 'and' && !!n2?.cap && !NOT_NAMES.has(n2.raw)) ||
      ((nx.low === 'is' || nx.low === 'are') && !!n2 && IS_FOLLOW.has(n2.low)))
  );
}

export function extractFacts(text: string, common: ReadonlySet<string> = NO_WORDS): Facts {
  const toks = tokenize(text);
  const consumed: boolean[] = toks.map(() => false);
  const raws = extractValues(toks, consumed);
  // A value's own tokens must not block its binding search; other values do.
  const values: Value[] = raws.map((r) => {
    const others = consumed.map((c, k) => c && !(k >= r.start && k <= r.end));
    return {
      key: r.key,
      L: bindWord(toks, others, r.start - 1, -1),
      R: bindWord(toks, others, r.end + 1, 1),
    };
  });
  const isName = toks.map((_, i) => isNameToken(toks, i, consumed, common));
  const names = new Set<string>();
  const owners = new Set<string>();
  for (let i = 0; i < toks.length; i += 1) {
    if (!isName[i]) continue;
    names.add(toks[i]!.low);
    if (i >= 2 && isName[i - 2] && ['and', ','].includes(toks[i - 1]!.low)) continue; // not the start of a run
    let end = i;
    while (['and', ','].includes(toks[end + 1]?.low ?? '') && isName[end + 2]) end += 2;
    const a1 = toks[end + 1]?.low ?? '';
    const a2 = toks[end + 2]?.low ?? '';
    let owner =
      COMMIT_AFTER.has(a1) ||
      ((a1 === 'is' || a1 === 'are') && IS_FOLLOW.has(a2)) ||
      (a1 === ',' && ADDRESSED.has(a2));
    const b1 = toks[i - 1]?.low ?? '';
    const b2 = toks[i - 2]?.low ?? '';
    if (
      b1 === 'by' ||
      (b1 === 'to' && ASSIGN_VERBS.has(b2)) ||
      ((b1 === ':' || b1 === 'is') && OWNER_NOUNS.has(b2))
    )
      owner = true;
    for (let k = i; k <= end; k += 2) {
      if (isName[k]) {
        names.add(toks[k]!.low);
        if (owner) owners.add(toks[k]!.low);
      }
    }
  }
  let negs = 0;
  for (const t of toks) if (isNegation(t) || (t.alpha && isReject(t))) negs += 1;
  const what: string[] = [];
  toks.forEach((t, i) => {
    if (
      consumed[i] ||
      isName[i] ||
      !t.alpha ||
      isStop(t) ||
      isDateTok(t) ||
      numberWord(t.low) !== undefined
    )
      return;
    const s = stem(t.low);
    if (s.length > 1) what.push(s);
  });
  return {
    owners: [...owners].sort(),
    names: [...names].sort(),
    values,
    positive: negs % 2 === 0,
    what,
  };
}

// ---------------------------------------------------------------- comparison and grounding

export function bindMatch(r: Value, g: Value, strict = true): boolean {
  if (!strict) return true;
  const sameSide = (r.L && g.L) || (r.R && g.R);
  if (sameSide) return (!(r.L && g.L) || r.L === g.L) && (!(r.R && g.R) || r.R === g.R);
  const rs = [r.L, r.R].filter(Boolean);
  const gs = [g.L, g.R].filter(Boolean);
  if (rs.length === 0 || gs.length === 0) return true;
  return rs.some((x) => gs.includes(x));
}

export interface Clause {
  text: string;
  speaker: string;
  question: boolean;
}

/** Splits cited transcript words into clauses at sentence ends. */
export function clausesOf(words: readonly { text: string; speaker: string }[]): Clause[] {
  const out: Clause[] = [];
  let cur: string[] = [];
  let sp = '';
  const flush = (q: boolean): void => {
    if (cur.length) out.push({ text: cur.join(' '), speaker: sp, question: q });
    cur = [];
  };
  for (const w of words) {
    if (cur.length === 0) sp = w.speaker;
    cur.push(w.text);
    if (/[.?!;]$/.test(w.text)) flush(w.text.endsWith('?'));
  }
  flush(false);
  return out;
}

const segmentsOf = (text: string): string[] =>
  text.split(/,|;|\band\b|\bbut\b|\bwhile\b|\bthen\b/i);

function sharesStem(a: readonly string[], b: readonly string[]): boolean {
  const s = new Set(b);
  return a.some((x) => s.has(x));
}

/** Is `name` the owner (or attributed speaker) of an action the point is about, in this span? */
export function ownerGrounded(
  name: string,
  clauses: readonly Clause[],
  pointStems: readonly string[],
  common: ReadonlySet<string> = NO_WORDS,
): boolean {
  for (const c of clauses) {
    if (c.question) continue;
    if (c.speaker.toLowerCase() === name && sharesStem(contentStems(c.text), pointStems))
      return true;
    for (const seg of segmentsOf(c.text)) {
      const f = extractFacts(seg, common);
      if (f.owners.includes(name) && sharesStem(f.what, pointStems)) return true;
    }
  }
  return false;
}

export function nameGrounded(
  name: string,
  clauses: readonly Clause[],
  pointStems: readonly string[],
  common: ReadonlySet<string> = NO_WORDS,
): boolean {
  return clauses.some((c) => {
    const f = extractFacts(c.text, common);
    return f.names.includes(name) && sharesStem(f.what, pointStems);
  });
}

export function valueGrounded(
  v: Value,
  clauses: readonly Clause[],
  pointStems: readonly string[],
  common: ReadonlySet<string> = NO_WORDS,
): boolean {
  return clauses.some((c) => {
    const f = extractFacts(c.text, common);
    return (
      f.values.some((cv) => cv.key === v.key && bindMatch(v, cv, false)) &&
      sharesStem(f.what, pointStems)
    );
  });
}

export interface FactVerdict {
  ok: boolean;
  /** Fixed code, never text. */
  code: 'ok' | 'polarity' | 'owner' | 'owner-role' | 'name' | 'value' | 'value-role' | 'what';
}

/** Role-level fact check of one candidate pair (plan section 3). */
export function factCheck(
  gen: Facts,
  ref: Facts,
  clauses: readonly Clause[],
  cosine: number,
  common: ReadonlySet<string> = NO_WORDS,
): FactVerdict {
  if (gen.positive !== ref.positive) return { ok: false, code: 'polarity' };
  if (ref.owners.length > 0) {
    if (gen.owners.join('|') !== ref.owners.join('|')) return { ok: false, code: 'owner' };
  } else {
    for (const o of gen.owners)
      if (!ownerGrounded(o, clauses, gen.what, common)) return { ok: false, code: 'owner-role' };
  }
  for (const n of ref.names) if (!gen.names.includes(n)) return { ok: false, code: 'name' };
  for (const n of gen.names) {
    if (
      !ref.names.includes(n) &&
      !gen.owners.includes(n) &&
      !nameGrounded(n, clauses, gen.what, common)
    )
      return { ok: false, code: 'name' };
  }
  const used = new Set<number>();
  for (const r of ref.values) {
    // Binding to the neighbouring word only matters when the point has several values of one kind.
    const strict = ref.values.filter((x) => x.key[0] === r.key[0]).length > 1;
    const k = gen.values.findIndex(
      (g, i) => !used.has(i) && g.key === r.key && bindMatch(r, g, strict),
    );
    if (k < 0) return { ok: false, code: 'value' };
    used.add(k);
  }
  for (let i = 0; i < gen.values.length; i += 1) {
    if (!used.has(i) && !valueGrounded(gen.values[i]!, clauses, gen.what, common))
      return { ok: false, code: 'value-role' };
  }
  if (ref.what.length > 0 && f1(ref.what, gen.what) === 0 && cosine < 0.5)
    return { ok: false, code: 'what' };
  return { ok: true, code: 'ok' };
}
