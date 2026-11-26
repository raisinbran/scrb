import type { Backend } from './backend.js';
import { RunError } from './errors.js';
import { parseJson, prepare, type Meeting } from './run.js';
import { contentStems, f1, isDateTok, isNegation, tokenize } from './text.js';
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
  owner?: string;
}

export interface AgendaMeeting extends Meeting {
  agenda: string;
  facts: RefFact[];
}

export function promptAgenda(items: readonly OutlineItem[], transcript: string): string {
  return [
    'Agenda topics (use the id exactly):',
    ...items.map((t) => `${'  '.repeat(t.level - 1)}${t.id}: ${t.text}`),
    '',
    'Write one fact at a time from the transcript. Kinds: decision, info, caveat, date, action, question.',
    'Keep tentative, conditional and disputed statements as such. If a decision changed later, state the final one and cite both places.',
    'Name an owner only if the transcript assigns one. Use the topic id; for a topic the agenda lacks, set "topic":"new" and "newTopic":"title".',
    'Cite lines as "L12" or "L12-L14". A fact has one claim, at most 40 words.',
    'Reply as {"facts":[{"topic":"o1","kind":"decision","text":"...","cite":"L1-L2","owner":"..."}]}.',
    '',
    'Transcript:',
    transcript,
  ].join('\n');
}

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

export type Verdict = 'ok' | 'badTopic' | 'badCite' | 'unsupported' | 'contradicted';

const numbers = (s: string): string[] =>
  tokenize(s)
    .filter((t) => /^\$?\d/.test(t.raw) || isDateTok(t))
    .map((t) => t.low.replace(/[$,]/g, ''));

const hasNeg = (s: string): boolean => tokenize(s).some(isNegation);

/** Checks a fact against the lines it cites. Lexical overlap alone never verifies a date, owner or polarity. */
export function verify(
  f: GenFact,
  items: readonly OutlineItem[],
  lines: readonly { text: string }[],
): Verdict {
  const known = items.some((i) => i.id === f.topic);
  if (!known && !(f.topic === 'new' && f.newTopic)) return 'badTopic';
  if (!f.cite) return 'badCite';
  const span = lines
    .slice(f.cite.from - 1, f.cite.to)
    .map((l) => l.text)
    .join(' ');
  const have = new Set(numbers(span));
  if (numbers(f.text).some((n) => !have.has(n))) return 'unsupported';
  if (f.owner && !span.toLowerCase().includes(f.owner.toLowerCase())) return 'unsupported';
  if (f1(contentStems(span), contentStems(f.text)) < 0.15) return 'unsupported';
  if (hasNeg(f.text) !== hasNeg(span)) return 'contradicted';
  return 'ok';
}

/** Deterministic Markdown: agenda order and levels kept, facts under their topic, new topics last. */
export function renderMarkdown(
  items: readonly OutlineItem[],
  facts: readonly GenFact[],
  complete: boolean,
): string {
  const out: string[] = [];
  const ref = (f: GenFact): string => (f.cite ? ` [L${f.cite.from}-L${f.cite.to}]` : '');
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
}

/** Runs one meeting: chunks, backend call, parse, de-duplicate, verify. */
export async function generateFacts(m: AgendaMeeting, backend: Backend): Promise<GenResult> {
  const parsed = parseOutline(m.agenda);
  const items = parsed.items;
  const p = prepare(m);
  const seen = new Set<string>();
  const facts: GenFact[] = [];
  let failedChunks = 0;
  for (const c of p.chunks) {
    const transcript = m.lines
      .slice(c.from, c.to + 1)
      .map((l, k) => `[L${c.from + k + 1}] ${l.speaker}: ${l.text}`)
      .join('\n');
    try {
      const text = await backend.complete({
        system: 'You write meeting notes from a transcript. Reply with one JSON object only.',
        user: promptAgenda(items, transcript),
      });
      for (const f of toFacts(parseJson(text), m.lines.length)) {
        if (f.cite && (f.cite.from < c.from + 1 || f.cite.to > c.to + 1)) f.cite = null;
        const key = `${f.topic}|${f.kind}|${f.text.toLowerCase().replace(/\W+/g, ' ')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        facts.push(f);
      }
    } catch {
      failedChunks += 1;
    }
  }
  return { facts, verdicts: facts.map((f) => verify(f, items, m.lines)), failedChunks };
}

export interface Ratio {
  num: number;
  den: number;
}
export const ratio = (r: Ratio): number | null => (r.den > 0 ? r.num / r.den : null);

export interface AgendaScore {
  decisionRecall: Ratio;
  dateRecall: Ratio;
  /** Contradicted, unsupported, bad-topic or bad-citation facts over all generated facts. */
  hallucination: Ratio;
  validCitations: Ratio;
  /** (insert + delete + move + substitute) / reference facts. */
  editDistance: { ins: number; del: number; move: number; sub: number; refs: number; norm: number };
  matched: number;
}

const stemsOf = (t: string): string[] => contentStems(t);

/** One-to-one greedy match of reference facts to verified generated facts. */
export function scoreAgenda(
  ref: readonly RefFact[],
  gen: readonly GenFact[],
  verdicts: readonly Verdict[],
): AgendaScore {
  const used = new Set<number>();
  const pair: number[] = ref.map(() => -1);
  const cand: { r: number; g: number; s: number }[] = [];
  ref.forEach((r, ri) =>
    gen.forEach((g, gi) => {
      if (verdicts[gi] !== 'ok') return;
      if (r.value && !numbers(r.value).every((n) => numbers(g.text).includes(n))) return;
      const s = f1(stemsOf(r.text), stemsOf(g.text));
      if (s >= 0.4) cand.push({ r: ri, g: gi, s });
    }),
  );
  cand.sort((a, b) => b.s - a.s || a.r - b.r || a.g - b.g);
  const done = new Set<number>();
  for (const c of cand) {
    if (done.has(c.r) || used.has(c.g)) continue;
    done.add(c.r);
    used.add(c.g);
    pair[c.r] = c.g;
  }
  const hit = (k: FactKind): Ratio => {
    const idx = ref.map((r, i) => (r.kind === k ? i : -1)).filter((i) => i >= 0);
    return { num: idx.filter((i) => pair[i]! >= 0).length, den: idx.length };
  };
  const bad = verdicts.filter((v) => v !== 'ok').length;
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
    matched,
  };
}
