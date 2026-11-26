import type { Backend } from './backend.js';
import { RunError } from './errors.js';
import { parseJson, prepare, type Meeting } from './run.js';
import { matchPoints, type Embed, type Word } from './match.js';
import { AGENDA_SYSTEM, promptAgenda } from './prompts.js';
import { hasNegation, numbersOf, reconcile, type ReconcileStats } from './reconcile.js';
import { contentStems, f1 } from './text.js';
import { parseOutline } from '../../src/parse.js';
import type { OutlineItem } from '../../src/types.js';

/** N1 pilot: agenda-aware atomic cited facts, deterministic Markdown, lexical scoring. Dev-only, no I/O. */

export type FactKind = 'decision' | 'info' | 'caveat' | 'date' | 'action' | 'question';
export const KINDS: readonly FactKind[] = [
  'decision',
  'info',
  'caveat',
  'date',
  'action',
  'question',
];

export interface RefFact {
  /** Agenda topic id (o1...), or a title for a topic the outline lacks. */
  topic: string;
  kind: FactKind;
  text: string;
  /** Exact value a date/quantity fact must carry, as it appears in the transcript. */
  value?: string;
  owner?: string;
}

export interface GenFact {
  topic: string;
  /** Title when the model proposes a topic outside the agenda. */
  newTopic?: string;
  kind: FactKind;
  text: string;
  /** 1-based inclusive transcript line range. */
  cite: { from: number; to: number } | null;
  /** Citation of the statement a later one replaced, so a changed decision shows both places. */
  earlier?: { from: number; to: number } | null;
  owner?: string;
}

export interface AgendaMeeting extends Meeting {
  agenda: string;
  facts: RefFact[];
}

export { promptAgenda };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const str = (x: unknown): string => (typeof x === 'string' ? x : '');

export function parseLines(raw: unknown, total: number): GenFact['cite'] {
  if (typeof raw !== 'string') return null;
  const m = /^\s*L?(\d+)\s*(?:[-–]\s*L?(\d+))?\s*$/.exec(raw);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  return a >= 1 && b >= a && b <= total ? { from: a, to: b } : null;
}

export function toFacts(raw: unknown, total: number): GenFact[] {
  if (!isObj(raw) || !Array.isArray(raw.facts)) throw new RunError('E_SHAPE');
  const out: GenFact[] = [];
  for (const f of raw.facts) {
    if (!isObj(f) || !str(f.text)) continue;
    const kind = KINDS.find((k) => k === f.kind) ?? 'info';
    const g: GenFact = {
      topic: str(f.topic),
      kind,
      text: str(f.text),
      cite: parseLines(f.cite, total),
    };
    if (str(f.newTopic)) g.newTopic = str(f.newTopic);
    if (str(f.owner)) g.owner = str(f.owner);
    out.push(g);
  }
  return out;
}

export type Verdict = 'ok' | 'badTopic' | 'badCite' | 'unsupported' | 'contradicted' | 'stale';

/** A later line that revises an earlier statement. Deliberately narrow: "now" and "then" are not cues. */
const REVISION =
  /\b(actually|instead|revised?|correction|no longer|updated?|rather|scratch that|make that)\b/i;
const CLAUSE_SPLIT = /[,;.!?]|\b(?:but|and|while|whereas|although)\b/i;
/** A clause starting with one of these continues the previous clause ("..., but that is not decided"). */
const CONTINUES = new Set(['that', 'it', 'this', 'which', 'those', 'they', 'he', 'she']);

/** Clauses of a span, with pronoun-led clauses folded into the one before. */
export function clauseTexts(span: string): string[] {
  const out: string[] = [];
  for (const raw of span.split(CLAUSE_SPLIT)) {
    const c = raw.trim();
    if (!c) continue;
    const first = c.split(/\s+/)[0]!.toLowerCase();
    if (out.length > 0 && CONTINUES.has(first)) out[out.length - 1] += ` ${c}`;
    else out.push(c);
  }
  return out;
}

/** Negation is judged on the clause that best matches the fact, not on the whole span (defect 4). */
export function polarityAgrees(factText: string, span: string): boolean {
  const fs = contentStems(factText);
  let best = span;
  let bestHit = 0;
  for (const c of clauseTexts(span)) {
    const hit = new Set(contentStems(c).filter((s) => fs.includes(s))).size;
    if (hit > bestHit) {
      best = c;
      bestHit = hit;
    }
  }
  return hasNegation(factText) === hasNegation(best);
}

/**
 * A fact is stale when a later transcript line revises the same thing to a different number or date
 * and the fact does not cite that line (defect 3).
 */
export function isStale(f: GenFact, lines: readonly { text: string }[]): boolean {
  if (!f.cite) return false;
  const mine = numbersOf(f.text);
  if (mine.length === 0) return false;
  const fs = contentStems(f.text);
  for (let i = f.cite.to; i < lines.length; i += 1) {
    const t = lines[i]!.text;
    if (!REVISION.test(t)) continue;
    if (!contentStems(t).some((s) => fs.includes(s))) continue;
    if (numbersOf(t).some((n) => !mine.includes(n))) return true;
  }
  return false;
}

/** Checks a fact against the lines it cites. Lexical overlap alone never verifies a date, owner or polarity. */
export function verify(
  f: GenFact,
  items: readonly OutlineItem[],
  lines: readonly { text: string }[],
): Verdict {
  const known = items.some((i) => i.id === f.topic);
  if (!known && !(f.topic === 'new' && f.newTopic)) return 'badTopic';
  if (!f.cite) return 'badCite';
  const at = (c: { from: number; to: number }): string =>
    lines
      .slice(c.from - 1, c.to)
      .map((l) => l.text)
      .join(' ');
  const span = at(f.cite);
  const both = f.earlier ? `${span} ${at(f.earlier)}` : span;
  const have = new Set(numbersOf(both));
  if (numbersOf(f.text).some((n) => !have.has(n))) return 'unsupported';
  if (f.owner && !both.toLowerCase().includes(f.owner.toLowerCase())) return 'unsupported';
  if (f1(contentStems(span), contentStems(f.text)) < 0.15) return 'unsupported';
  if (!polarityAgrees(f.text, span)) return 'contradicted';
  if (isStale(f, lines)) return 'stale';
  return 'ok';
}

/** Deterministic Markdown: agenda order and levels kept, facts under their topic, new topics last. */
export function renderMarkdown(
  items: readonly OutlineItem[],
  facts: readonly GenFact[],
  complete: boolean,
): string {
  const out: string[] = [];
  const ref = (f: GenFact): string =>
    f.cite
      ? ` [L${f.cite.from}-L${f.cite.to}${f.earlier ? `; earlier L${f.earlier.from}-L${f.earlier.to}` : ''}]`
      : '';
  const bullet = (f: GenFact, pad: string): string =>
    `${pad}- ${f.kind === 'info' ? '' : `${f.kind}: `}${f.text}${f.owner ? ` (${f.owner})` : ''}${ref(f)}`;
  for (const it of items) {
    const pad = '  '.repeat(it.level - 1);
    out.push(`${pad}- **${it.text}**`);
    const own = facts.filter((f) => f.topic === it.id);
    for (const f of own) out.push(bullet(f, pad + '  '));
    if (own.length === 0 && complete) out.push(`${pad}  - No discussion found`);
  }
  const titles = [...new Set(facts.filter((f) => f.topic === 'new').map((f) => f.newTopic!))];
  if (titles.length > 0) out.push('- **Proposed new topics**');
  for (const t of titles) {
    out.push(`  - ${t}`);
    for (const f of facts.filter((x) => x.topic === 'new' && x.newTopic === t))
      out.push(bullet(f, '    '));
  }
  return out.join('\n') + '\n';
}

export interface GenResult {
  facts: GenFact[];
  verdicts: Verdict[];
  /** Chunks whose output could not be read; coverage is incomplete when above zero. */
  failedChunks: number;
  chunks: number;
  /** Cross-chunk folding: paraphrased repeats dropped and later reversals applied. */
  reconciled: ReconcileStats;
}

/** Runs one meeting: chunks, backend call, parse, reconcile across chunks, verify. */
export async function generateFacts(m: AgendaMeeting, backend: Backend): Promise<GenResult> {
  const parsed = parseOutline(m.agenda);
  const items = parsed.items;
  const p = prepare(m);
  let facts: GenFact[] = [];
  const reconciled: ReconcileStats = { duplicates: 0, reversals: 0 };
  let failedChunks = 0;
  for (const c of p.chunks) {
    const transcript = m.lines
      .slice(c.from, c.to + 1)
      .map((l, k) => `[L${c.from + k + 1}] ${l.speaker}: ${l.text}`)
      .join('\n');
    try {
      const text = await backend.complete({
        system: AGENDA_SYSTEM,
        user: promptAgenda(items, transcript),
      });
      const incoming = toFacts(parseJson(text), m.lines.length);
      for (const f of incoming)
        if (f.cite && (f.cite.from < c.from + 1 || f.cite.to > c.to + 1)) f.cite = null;
      facts = reconcile(facts, incoming, reconciled);
    } catch {
      failedChunks += 1;
    }
  }
  return {
    facts,
    verdicts: facts.map((f) => verify(f, items, m.lines)),
    failedChunks,
    chunks: p.chunks.length,
    reconciled,
  };
}

export interface Ratio {
  num: number;
  den: number;
}
export const ratio = (r: Ratio): number | null => (r.den > 0 ? r.num / r.den : null);

export interface ReviewActions {
  /** Credited and filed under the right topic. */
  accept: number;
  /** Generated but not credited. */
  reject: number;
  /** Credited, filed under the wrong topic. */
  move: number;
  /** Credited but worded too differently to accept as is. */
  edit: number;
  /** Needs a person using the review screen; never simulated. */
  undo: null;
  reviewSeconds: null;
}

export interface AgendaScore {
  decisionRecall: Ratio;
  dateRecall: Ratio;
  /** Failed verification, stale, contradicted or unsupported generated facts over all generated facts, counted once. */
  hallucination: Ratio;
  validCitations: Ratio;
  /** (insert + delete + move + substitute) / reference facts. */
  editDistance: { ins: number; del: number; move: number; sub: number; refs: number; norm: number };
  /** Word-level edit distance between reference and generated notes text, over reference words. */
  wordEdit: { distance: number; refWords: number; norm: number };
  review: ReviewActions;
  matched: number;
}

export interface ScoreOptions {
  tau?: number;
  /** Credit a match only when the generated kind agrees with the reference kind (defect 1). Default true. */
  kindStrict?: boolean;
}

const stemsOf = (t: string): string[] => contentStems(t);
const wordsOf = (t: string): string[] => t.toLowerCase().match(/[a-z0-9$]+/g) ?? [];

/** Levenshtein distance over words. */
export function wordDistance(a: readonly string[], b: readonly string[]): number {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1)
      next[j] = Math.min(
        row[j]! + 1,
        next[j - 1]! + 1,
        row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    row = next;
  }
  return row[b.length]!;
}

/** Notes text in agenda order, then new topics in first-seen order; no citations or kind labels. */
function notesWords(
  order: readonly string[],
  facts: readonly { topic: string; newTopic?: string; text: string }[],
): string[] {
  const key = (f: { topic: string; newTopic?: string }): string =>
    f.topic === 'new' ? `new:${f.newTopic}` : f.topic;
  const keys = [...order];
  for (const f of facts) if (!keys.includes(key(f))) keys.push(key(f));
  return keys.flatMap((k) => facts.filter((f) => key(f) === k).flatMap((f) => wordsOf(f.text)));
}

const classOf = (k: FactKind, strict: boolean): string =>
  !strict ? 'all' : k === 'info' || k === 'caveat' ? 'note' : k;

/**
 * Scores generated facts against reference facts with the Task A embedding match (`matchPoints`):
 * citation check, role/number/polarity fact check, one-to-one assignment, and the contradicted and
 * unsupported statuses. Matching runs inside a kind class, so an echoed transcript line filed as info
 * cannot earn decision, action, question or date credit.
 */
export async function scoreAgenda(
  m: AgendaMeeting,
  gen: readonly GenFact[],
  verdicts: readonly Verdict[],
  embed: Embed,
  opts: ScoreOptions = {},
): Promise<AgendaScore> {
  const strict = opts.kindStrict ?? true;
  const ref = m.facts;
  const p = prepare(m);
  const cite = (c: GenFact['cite']) =>
    c && c.from >= 1 && c.to <= p.span.length
      ? { first: p.span[c.from - 1]!.first, last: p.span[c.to - 1]!.last }
      : null;
  const pair: number[] = ref.map(() => -1);
  const status: string[] = gen.map(() => 'unverified');
  const classes = [
    ...new Set(
      [...ref.map((r) => r.kind), ...gen.map((g) => g.kind)].map((k) => classOf(k, strict)),
    ),
  ];
  for (const cls of classes) {
    const gi = gen
      .map((g, i) => (classOf(g.kind, strict) === cls && verdicts[i] === 'ok' ? i : -1))
      .filter((i) => i >= 0);
    const ri = ref.map((r, i) => (classOf(r.kind, strict) === cls ? i : -1)).filter((i) => i >= 0);
    if (gi.length === 0 || ri.length === 0) {
      gi.forEach((i) => (status[i] = 'extra'));
      continue;
    }
    const r = await matchPoints(
      gi.map((i) => ({ text: gen[i]!.text, cite: cite(gen[i]!.cite) })),
      ri.map((i) => ref[i]!.text),
      p.words as Word[],
      embed,
      opts.tau === undefined ? {} : { tau: opts.tau },
    );
    gi.forEach((i, k) => (status[i] = r.status[k]!));
    r.refToGen.forEach((g, k) => {
      if (g < 0) return;
      const rf = ref[ri[k]!]!;
      if (rf.value && !numbersOf(rf.value).every((n) => numbersOf(gen[gi[g]!]!.text).includes(n)))
        return;
      pair[ri[k]!] = gi[g]!;
    });
  }
  const hit = (k: FactKind): Ratio => {
    const idx = ref.map((r, i) => (r.kind === k ? i : -1)).filter((i) => i >= 0);
    return { num: idx.filter((i) => pair[i]! >= 0).length, den: idx.length };
  };
  const bad = gen.filter(
    (_, i) => verdicts[i] !== 'ok' || status[i] === 'contradicted' || status[i] === 'unsupported',
  ).length;
  let move = 0;
  let sub = 0;
  pair.forEach((g, ri) => {
    if (g < 0) return;
    const gf = gen[g]!;
    const r = ref[ri]!;
    if (gf.topic !== r.topic && !(gf.topic === 'new' && gf.newTopic === r.topic)) move += 1;
    else if (f1(stemsOf(r.text), stemsOf(gf.text)) < 0.6) sub += 1;
  });
  const matched = pair.filter((g) => g >= 0).length;
  const ins = ref.length - matched;
  const del = gen.length - matched;
  const order = parseOutline(m.agenda).items.map((i) => i.id);
  const refWords = notesWords(
    order,
    ref.map((r) => ({
      topic: /^o\d+$/.test(r.topic) ? r.topic : 'new',
      newTopic: r.topic,
      text: r.text,
    })),
  );
  const genWords = notesWords(
    order,
    gen.filter((_, i) => verdicts[i] === 'ok'),
  );
  const wd = wordDistance(refWords, genWords);
  return {
    decisionRecall: hit('decision'),
    dateRecall: hit('date'),
    hallucination: { num: bad, den: gen.length },
    validCitations: {
      num: gen.filter((g, i) => g.cite && verdicts[i] !== 'badCite').length,
      den: gen.length,
    },
    editDistance: {
      ins,
      del,
      move,
      sub,
      refs: ref.length,
      norm: ref.length > 0 ? (ins + del + move + sub) / ref.length : 0,
    },
    wordEdit: {
      distance: wd,
      refWords: refWords.length,
      norm: refWords.length > 0 ? wd / refWords.length : 0,
    },
    review: {
      accept: matched - move - sub,
      reject: del,
      move,
      edit: sub,
      undo: null,
      reviewSeconds: null,
    },
    matched,
  };
}
