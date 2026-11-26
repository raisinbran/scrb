import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DECODING, type Backend } from './backend.js';
import { RunError } from './errors.js';
import { SCORER, type Cite, type Embed, type Word } from './match.js';
import { buildPartial, TASK_B_SEED } from './partial.js';
import {
  agendaPromptHash,
  twoPassPromptHash,
  CHUNK_WORDS,
  promptA,
  promptB,
  promptHash,
  renderPartial,
  SYSTEM,
} from './prompts.js';
import { norm, scoreTaskA, type GenTopic, type RefTopic, type TaskAResult } from './taskA.js';
import { scoreTaskB, type TaskBOutput, type TaskBResult } from './taskB.js';

/** One meeting as the runner reads it. Invented in tests; the owner's real ones live outside the repo. */
export interface Meeting {
  outline: string[];
  lines: { speaker: string; text: string }[];
  /** The reference notes. */
  reference: RefTopic[];
}

export interface MeetingResult {
  meeting: number;
  /** Fixed code when a task failed to run; never text. */
  codeA?: string;
  codeB?: string;
  a?: TaskAResult;
  b?: TaskBResult;
}

interface Prepared {
  words: Word[];
  /** Per line: first and last word index. */
  span: { first: number; last: number }[];
  /** Chunks as ranges of line indices. */
  chunks: { from: number; to: number }[];
}

export function prepare(m: Meeting): Prepared {
  const words: Word[] = [];
  const span: Prepared['span'] = [];
  for (const l of m.lines) {
    const first = words.length;
    for (const t of l.text.split(/\s+/).filter(Boolean))
      words.push({ text: t, speaker: l.speaker });
    span.push({ first, last: Math.max(first, words.length - 1) });
  }
  const chunks: Prepared['chunks'] = [];
  let from = 0;
  let count = 0;
  m.lines.forEach((l, i) => {
    count += l.text.split(/\s+/).length;
    if (count >= CHUNK_WORDS) {
      chunks.push({ from, to: i });
      from = i + 1;
      count = 0;
    }
  });
  if (from < m.lines.length) chunks.push({ from, to: m.lines.length - 1 });
  return { words, span, chunks };
}

const renderLines = (m: Meeting, from: number, to: number): string =>
  m.lines
    .slice(from, to + 1)
    .map((l, k) => `[L${from + k + 1}] ${l.speaker}: ${l.text}`)
    .join('\n');

/** "L3" or "L3-L5" (1-based lines) to a word range; anything else is no citation. */
export function parseCite(raw: unknown, p: Prepared): Cite | null {
  if (typeof raw !== 'string') return null;
  const m = /^\s*L?(\d+)\s*(?:[-–]\s*L?(\d+))?\s*$/.exec(raw);
  if (!m) return null;
  const a = Number(m[1]) - 1;
  const b = (m[2] ? Number(m[2]) : Number(m[1])) - 1;
  if (a < 0 || b < a || b >= p.span.length) return null;
  return { first: p.span[a]!.first, last: p.span[b]!.last };
}

export function parseJson(text: string): unknown {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) throw new RunError('E_PARSE');
  try {
    return JSON.parse(text.slice(a, b + 1));
  } catch {
    throw new RunError('E_PARSE');
  }
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const str = (x: unknown): string => (typeof x === 'string' ? x : '');
const objs = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter(isObj) : []);

function toTopics(raw: unknown, p: Prepared): GenTopic[] {
  if (!isObj(raw) || !Array.isArray(raw.topics)) throw new RunError('E_SHAPE');
  return objs(raw.topics).map((t) => ({
    title: str(t.title),
    points: objs(t.points)
      .map((x) => ({ text: str(x.text), cite: parseCite(x.cite, p) }))
      .filter((x) => x.text),
  }));
}

function toTaskB(raw: unknown, p: Prepared): TaskBOutput {
  if (!isObj(raw)) throw new RunError('E_SHAPE');
  return {
    additions: objs(raw.additions)
      .map((a) => ({ topic: str(a.topic), text: str(a.text), cite: parseCite(a.cite, p) }))
      .filter((a) => a.text),
    moves: objs(raw.moves)
      .map((x) => ({ id: str(x.id), toTopic: str(x.toTopic) }))
      .filter((x) => x.id),
    edits: objs(raw.edits)
      .map((x) => ({
        id: str(x.id),
        kind: x.kind === 'delete' ? ('delete' as const) : ('reword' as const),
      }))
      .filter((x) => x.id),
  };
}

export interface RunOptions {
  outDir: string;
  tau: number;
}

const codeOf = (e: unknown): string => (e instanceof RunError ? e.code : 'E_UNEXPECTED');

/** Runs Task A and Task B on one meeting. Raw model text goes only under outDir; the result holds numbers. */
export async function runMeeting(
  index: number,
  m: Meeting,
  backend: Backend,
  embed: Embed,
  opts: RunOptions,
): Promise<MeetingResult> {
  const p = prepare(m);
  const rawDir = join(opts.outDir, 'raw');
  mkdirSync(rawDir, { recursive: true });
  const result: MeetingResult = { meeting: index };

  try {
    const merged = new Map<string, GenTopic>();
    for (const [ci, c] of p.chunks.entries()) {
      const out = await backend.complete({
        system: SYSTEM,
        user: promptA(m.outline, renderLines(m, c.from, c.to)),
      });
      writeFileSync(join(rawDir, `m${index}-A-${ci}.txt`), out);
      for (const t of toTopics(parseJson(out), p)) {
        const k = norm(t.title);
        const cur = merged.get(k);
        if (cur) cur.points.push(...t.points);
        else merged.set(k, { title: t.title, points: [...t.points] });
      }
    }
    result.a = await scoreTaskA(m.reference, [...merged.values()], p.words, embed, opts.tau);
  } catch (e) {
    result.codeA = codeOf(e);
  }

  try {
    const partial = buildPartial(m.reference, TASK_B_SEED);
    const text = renderPartial(m.reference, partial);
    const all: TaskBOutput = { additions: [], moves: [], edits: [] };
    const seenMoves = new Set<string>();
    for (const [ci, c] of p.chunks.entries()) {
      const out = await backend.complete({
        system: SYSTEM,
        user: promptB(m.outline, text, renderLines(m, c.from, c.to)),
      });
      writeFileSync(join(rawDir, `m${index}-B-${ci}.txt`), out);
      const o = toTaskB(parseJson(out), p);
      all.additions.push(...o.additions);
      for (const mv of o.moves) {
        if (seenMoves.has(mv.id)) continue;
        seenMoves.add(mv.id);
        all.moves.push(mv);
      }
      all.edits.push(...o.edits);
    }
    result.b = await scoreTaskB(m.reference, partial, all, p.words, embed, opts.tau);
  } catch (e) {
    result.codeB = codeOf(e);
  }
  return result;
}

export interface Manifest {
  version: 1;
  promptHash: string;
  /** Hash of the agenda-aware prompt (defect 7). */
  agendaPromptHash: string;
  twoPassPromptHash: string;
  decoding: typeof DECODING;
  tau: number;
  scorer: typeof SCORER;
  taskBSeed: number;
  backend: string;
  embedder: string;
  meetings: number;
  totalMemoryMiB: number;
}

export function manifest(
  backend: Backend,
  embedderId: string,
  tau: number,
  meetings: number,
  totalMemBytes: number,
): Manifest {
  return {
    version: 1,
    promptHash: promptHash(),
    agendaPromptHash: agendaPromptHash(),
    twoPassPromptHash: twoPassPromptHash(),
    decoding: DECODING,
    tau,
    scorer: SCORER,
    taskBSeed: TASK_B_SEED,
    backend: backend.id,
    embedder: embedderId,
    meetings,
    totalMemoryMiB: Math.round(totalMemBytes / 1048576),
  };
}

export function writeResults(outDir: string, mf: Manifest, results: MeetingResult[]): void {
  const dir = join(outDir, 'results');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(mf, null, 2));
  writeFileSync(join(dir, 'results.json'), JSON.stringify(results, null, 2));
}

export function cleanTemp(outDir: string): void {
  rmSync(join(outDir, 'tmp'), { recursive: true, force: true });
}
