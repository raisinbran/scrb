import {
  parseLines,
  reanchor,
  toFacts,
  verifyWhy,
  type AgendaMeeting,
  type Cause,
  type FactKind,
  type GenFact,
  type GenResult,
} from './agenda.js';
import type { Backend } from './backend.js';
import { CANDIDATE_SYSTEM, CLASSIFY_SYSTEM, promptCandidates, promptClassify } from './prompts.js';
import { reconcile, type ReconcileStats } from './reconcile.js';
import { parseJson, prepare } from './run.js';
import { parseOutline } from '../../src/parse.js';

/**
 * Two-pass agenda notes. Pass 1 lists candidate line spans (no kind, no topic). Pass 2 classifies each
 * candidate, assigns an agenda topic and rewrites it as one claim. The citation of a fact is its pass-1
 * span, so the model never has to restate line numbers in pass 2. Dev-only.
 */

export interface Span {
  from: number;
  to: number;
}

export interface TwoPassResult extends GenResult {
  /** Candidate spans per chunk after pass 1 (1-based inclusive lines). */
  candidates: Span[];
  /** Candidates the classifier left out (kind "other" or no entry). */
  dropped: number;
  failedPass1: number;
  failedPass2: number;
  errors: string[];
  /** Candidates the classifier called "other", and candidates it did not answer. */
  other: number;
  unanswered: number;
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9$]+/g, ' ')
    .trim();

/**
 * Pass 1 reply: spans as {"lines","quote"} (or a bare "L12-L14" string). When a quote is given and the
 * lines do not hold it, the span moves to the nearest line in the chunk that does, which cancels the
 * model's line-number drift; with no such line the span is dropped.
 */
export function parseSpans(
  raw: unknown,
  chunk: { from: number; to: number },
  lines: readonly { text: string }[] = [],
): Span[] {
  const obj = raw as { spans?: unknown } | null;
  const arr = Array.isArray(obj?.spans) ? (obj!.spans as unknown[]) : [];
  const out: Span[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    const rec =
      typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : null;
    const text = rec ? rec.lines : item;
    const quote = rec && typeof rec.quote === 'string' ? norm(rec.quote) : '';
    const parts = typeof text === 'string' ? text.split(/[,;]/) : [];
    for (const part of parts) {
      let s = parseLines(part, chunk.to + 1);
      if (s && (s.from < chunk.from + 1 || s.to > chunk.to + 1 || s.to - s.from > 2)) s = null;
      if (quote.split(' ').length >= 2 && lines.length > 0) {
        const holds = (a: number, b: number): boolean =>
          norm(
            lines
              .slice(a - 1, b)
              .map((l) => l.text)
              .join(' '),
          ).includes(quote);
        if (!s || !holds(s.from, s.to)) {
          const len = s ? s.to - s.from : 0;
          const near = s ? s.from : Math.floor((chunk.from + chunk.to) / 2) + 1;
          let best: number | null = null;
          for (let a = chunk.from + 1; a + len <= chunk.to + 1; a += 1)
            if (holds(a, a + len) && (best === null || Math.abs(a - near) < Math.abs(best - near)))
              best = a;
          s = best === null ? null : { from: best, to: best + len };
        }
      }
      if (!s) continue;
      const k = `${s.from}-${s.to}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
  }
  return out.sort((a, b) => a.from - b.from || a.to - b.to);
}

const KINDS2: Record<string, FactKind | 'drop'> = {
  decision: 'decision',
  action: 'action',
  date: 'date',
  number: 'info',
  caveat: 'caveat',
  question: 'question',
  info: 'info',
  other: 'drop',
};

const WINDOW = 50;
const OVERLAP = 5;
const BATCH = 12;

export async function generateTwoPass(
  m: AgendaMeeting,
  backend: Backend,
  opts: { noResolve?: boolean } = {},
): Promise<TwoPassResult> {
  const items = parseOutline(m.agenda).items;
  const p = prepare(m);
  let facts: GenFact[] = [];
  const reconciled: ReconcileStats = { duplicates: 0, reversals: 0 };
  const candidates: Span[] = [];
  let dropped = 0;
  let otherCount = 0;
  let unanswered = 0;
  let failedPass1 = 0;
  let failedPass2 = 0;
  let resolvedCites = 0;
  const errors: string[] = [];
  const label = (sp: Span): string => (sp.from === sp.to ? `L${sp.from}` : `L${sp.from}-L${sp.to}`);
  for (const c of p.chunks) {
    // Pass 1 runs on short windows: a 7B model finds more in 50 lines than in 200.
    const spans: Span[] = [];
    const have = new Set<string>();
    for (let a = c.from; a <= c.to; a += WINDOW - OVERLAP) {
      const w = { from: a, to: Math.min(c.to, a + WINDOW - 1) };
      const transcript = m.lines
        .slice(w.from, w.to + 1)
        .map((l, k) => `[L${w.from + k + 1}] ${l.speaker}: ${l.text}`)
        .join('\n');
      try {
        const out = await backend.complete({
          system: CANDIDATE_SYSTEM,
          user: promptCandidates(transcript),
        });
        for (const sp of parseSpans(parseJson(out), w, m.lines))
          if (!have.has(label(sp))) {
            have.add(label(sp));
            spans.push(sp);
          }
      } catch (e) {
        failedPass1 += 1;
        errors.push(`p1:${e instanceof Error ? e.message : 'x'}`);
      }
      if (w.to >= c.to) break;
    }
    spans.sort((x, y) => x.from - y.from || x.to - y.to);
    candidates.push(...spans);
    // Pass 2 answers every candidate, in batches.
    for (let b = 0; b < spans.length; b += BATCH) {
      const batch = spans.slice(b, b + BATCH);
      try {
        const cand = batch.map((sp) => ({
          label: label(sp),
          text: m.lines
            .slice(sp.from - 1, sp.to)
            .map((l, k) => `[L${sp.from + k}] ${l.text}`)
            .join(' '),
        }));
        const out = await backend.complete({
          system: CLASSIFY_SYSTEM,
          user: promptClassify(items, cand),
        });
        const parsed = parseJson(out) as { facts?: { span?: unknown }[] };
        const raw = Array.isArray(parsed.facts) ? parsed.facts : [];
        const incoming: GenFact[] = [];
        const answered = new Set<string>();
        for (const r of raw) {
          const key = typeof r.span === 'string' ? r.span.replace(/\s+/g, '') : '';
          const span = batch.find((sp) => label(sp) === key);
          if (!span || answered.has(key)) continue;
          answered.add(key);
          const kindRaw = String((r as { kind?: unknown }).kind ?? '').toLowerCase();
          const kind = KINDS2[kindRaw];
          if (kind === undefined || kind === 'drop') {
            otherCount += 1;
            continue;
          }
          const [g] = toFacts(
            { facts: [{ ...r, kind, cite: `L${span.from}-L${span.to}` }] },
            m.lines.length,
          );
          if (!g) continue;
          delete g.owner;
          g.cite = { ...span };
          incoming.push(g);
        }
        unanswered += batch.length - answered.size;
        dropped += batch.length - incoming.length;
        if (!opts.noResolve)
          for (const f of incoming) {
            const w = verifyWhy(f, items, m.lines);
            if (
              w.cause === 'ok' ||
              w.cause === 'topic' ||
              w.cause === 'polarity' ||
              w.cause === 'stale'
            )
              continue;
            const found = reanchor(f, m.lines, c);
            if (found) {
              f.cite = found;
              f.resolved = true;
              resolvedCites += 1;
            }
          }
        facts = reconcile(facts, incoming, reconciled);
      } catch (e) {
        failedPass2 += 1;
        errors.push(`p2:${e instanceof Error ? e.message : 'x'}`);
      }
    }
  }
  const why = facts.map((f) => verifyWhy(f, items, m.lines));
  const causes: Record<string, number> = {};
  for (const w of why) causes[w.cause] = (causes[w.cause] ?? 0) + 1;
  return {
    facts,
    verdicts: why.map((w) => w.verdict),
    causes,
    why: why.map((w) => w.cause as Cause),
    resolvedCites,
    failedChunks: failedPass1 + failedPass2,
    chunks: p.chunks.length,
    reconciled,
    candidates,
    dropped,
    failedPass1,
    failedPass2,
    errors,
    other: otherCount,
    unanswered,
  };
}

const cls = (k: FactKind): string => (k === 'info' || k === 'caveat' ? 'note' : k);

export interface PassDiagnosis {
  /** Reference facts that carry a known evidence line. */
  located: number;
  /** Pass 1: a candidate span covers the evidence line. */
  candidateHit: number;
  /** After pass 2: some fact cites a span covering the line. */
  factHit: number;
  /** After pass 2: that fact has the reference's kind (info and caveat count together). */
  kindHit: number;
  /** After pass 2: that fact is filed under the reference's topic. */
  topicHit: number;
  perKind: Record<string, { located: number; candidate: number; fact: number; kind: number }>;
}

/** Shows which pass loses reference facts. Needs fixtures with evidence lines (the invented meetings). */
export function diagnose(m: AgendaMeeting, r: TwoPassResult): PassDiagnosis {
  const d: PassDiagnosis = {
    located: 0,
    candidateHit: 0,
    factHit: 0,
    kindHit: 0,
    topicHit: 0,
    perKind: {},
  };
  for (const ref of m.facts) {
    if (!ref.line) continue;
    const k = ref.kind;
    const pk = (d.perKind[k] ??= { located: 0, candidate: 0, fact: 0, kind: 0 });
    d.located += 1;
    pk.located += 1;
    const cand = r.candidates.some((s) => s.from <= ref.line! && ref.line! <= s.to);
    if (cand) {
      d.candidateHit += 1;
      pk.candidate += 1;
    }
    const f = r.facts.find((x) => x.cite && x.cite.from <= ref.line! && ref.line! <= x.cite.to);
    if (!f) continue;
    d.factHit += 1;
    pk.fact += 1;
    if (cls(f.kind) === cls(ref.kind)) {
      d.kindHit += 1;
      pk.kind += 1;
    }
    if (f.topic === ref.topic || (f.topic === 'new' && f.newTopic === ref.topic)) d.topicHit += 1;
  }
  return d;
}
