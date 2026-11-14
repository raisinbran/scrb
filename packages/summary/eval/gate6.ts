/**
 * Gate 6 scorer: recall, precision and link validity for saved extractions.
 *
 * Usage (after run.js has written <meeting>.extraction.json with --no-narrative or not):
 *   node dist/eval/gate6.js <fixtures_dir> <out_dir> <meeting>... [--judge] [--json file]
 *
 * Matching rule (fixed in advance, deterministic): a reference sentence is
 * RECOVERED when some output action or decision contains at least 50% of the
 * reference's stemmed content words (text.ts). Reference "NA" entries are dropped.
 * Decisions and actions are pooled because AMI annotators split them loosely;
 * per-kind numbers are printed too.
 *
 * Precision has two readings. "Reference precision" is the share of output items that
 * match some reference sentence: a LOWER bound, because AMI lists are short summaries.
 * "Judged precision" (--judge) asks the same local model, one item at a time, whether
 * the cited transcript lines really contain that action or decision; it is a model
 * judging its own output, so treat it as an estimate.
 *
 * Links: every action, decision and open question must cite a line that exists, whose
 * time equals the stored time, and whose neighbours (3 lines, 45 s) share at least 30%
 * of the item's content words.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LlamaServerWorker } from '../src/index.js';
import { contentTokens, coverage } from '../src/text.js';
import type { EvidenceLink, Extraction, SummaryItem, Transcript } from '../src/types.js';
import { parseTranscript } from './fixture.js';

const MATCH = 0.5;
const LINK_SUPPORT = 0.3;
const ASSETS = process.env.SCRB_DEV_ASSETS ?? join(homedir(), 'scrb-dev-assets');

interface Reference {
  actions: string[];
  decisions: string[];
}

const isNa = (s: string): boolean => /^\W*NA\W*$/i.test(s.trim());
const matches = (ref: string, item: SummaryItem): boolean =>
  coverage(contentTokens(ref), contentTokens(item.text)) >= MATCH;

/** A secondary (alsoAt) link must point at a real line with its stored time. */
export function secondaryProblem(link: EvidenceLink, transcript: Transcript): string | null {
  const line = transcript.lines[link.lineIndex];
  if (!line) return 'line missing';
  return line.startSec === link.timestampSec ? null : 'time differs from line';
}

export function linkProblem(item: SummaryItem, transcript: Transcript): string | null {
  const { lineIndex, timestampSec } = item.evidence;
  const line = transcript.lines[lineIndex];
  if (!line) return 'line missing';
  if (line.startSec !== timestampSec) return 'time differs from line';
  const near = transcript.lines
    .slice(Math.max(0, lineIndex - 3), lineIndex + 4)
    .filter((l) => Math.abs(l.startSec - line.startSec) <= 45)
    .map((l) => l.text)
    .join(' ');
  return coverage(contentTokens(item.text), contentTokens(near)) >= LINK_SUPPORT
    ? null
    : 'words not found nearby';
}

/** Primary and secondary (alsoAt) link checks over every item the gate covers. */
export function scoreLinks(extraction: Extraction, transcript: Transcript) {
  const linked: SummaryItem[] = [
    ...extraction.actions,
    ...extraction.decisions,
    ...extraction.openQuestions,
  ];
  const secondary = linked.flatMap((i) => i.alsoAt);
  const secondaryBroken = secondary.filter((l) => secondaryProblem(l, transcript)).length;
  const problems = linked.map((i) => ({ i, p: linkProblem(i, transcript) })).filter((x) => x.p);
  return { linked, secondary, secondaryBroken, problems };
}

const JUDGE_SCHEMA = {
  type: 'object',
  properties: { verdict: { enum: ['genuine', 'not_an_item'] } },
  required: ['verdict'],
};

async function judge(
  worker: LlamaServerWorker,
  item: SummaryItem,
  transcript: Transcript,
): Promise<boolean> {
  const at = item.evidence.lineIndex;
  const context = transcript.lines
    .slice(Math.max(0, at - 3), at + 4)
    .map((l) => `${l.speaker}: ${l.text}`)
    .join('\n');
  const response = await worker.complete({
    messages: [
      {
        role: 'system',
        content:
          'You check meeting notes against the transcript. Answer "genuine" only if the transcript excerpt shows people committing to the stated action, or settling the stated decision. Answer "not_an_item" for background, discussion, procedure, a mere suggestion nobody took up, or something the excerpt does not support.',
      },
      {
        role: 'user',
        content: `Kind: ${item.kind}\nNote: ${item.text}\n\nTranscript excerpt:\n${context}`,
      },
    ],
    schema: JUDGE_SCHEMA,
    maxTokens: 30,
  });
  return (JSON.parse(response.content) as { verdict: string }).verdict === 'genuine';
}

const brokenCount = (p: { p: string | null }[]): number =>
  p.filter((x) => x.p !== 'words not found nearby').length;

const pct = (n: number, d: number): string => (d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(0)}%`);

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const jsonAt = args.indexOf('--json');
  const jsonOut = jsonAt >= 0 ? args[jsonAt + 1] : undefined;
  const doJudge = args.includes('--judge');
  const [fixtures, out, ...meetings] = args.filter(
    (a, i) => !a.startsWith('--') && (jsonAt < 0 || i !== jsonAt + 1),
  );
  if (!fixtures || !out || meetings.length === 0)
    throw new Error('usage: gate6.js <fixtures> <out> <meeting>...');

  const worker = doJudge
    ? new LlamaServerWorker({
        serverPath: join(ASSETS, 'upstream/llama.cpp/build/bin/llama-server'),
        modelPath: join(ASSETS, 'models/llm/Qwen3.5-9B-Q4_K_M.gguf'),
      })
    : undefined;
  if (worker) await worker.start();
  const rows: Record<string, unknown>[] = [];
  try {
    for (const meeting of meetings) {
      const transcript = parseTranscript(
        readFileSync(join(fixtures, `${meeting}.transcript.txt`), 'utf8'),
      );
      const reference = JSON.parse(
        readFileSync(join(fixtures, `${meeting}.reference.json`), 'utf8'),
      ) as Reference;
      const extraction = JSON.parse(
        readFileSync(join(out, `${meeting}.extraction.json`), 'utf8'),
      ) as Extraction;
      const refA = reference.actions.filter((r) => !isNa(r));
      const refD = reference.decisions.filter((r) => !isNa(r));
      const pooled = [...extraction.actions, ...extraction.decisions];
      const recA = refA.filter((r) => extraction.actions.some((i) => matches(r, i)));
      const recD = refD.filter((r) => extraction.decisions.some((i) => matches(r, i)));
      const recPooled = [...refA, ...refD].filter((r) => pooled.some((i) => matches(r, i)));
      const refMatched = pooled.filter((i) => [...refA, ...refD].some((r) => matches(r, i)));
      const { linked, secondary, secondaryBroken, problems } = scoreLinks(extraction, transcript);
      let judged: { genuine: number; total: number } | undefined;
      if (worker) {
        let genuine = 0;
        for (const item of pooled) if (await judge(worker, item, transcript)) genuine += 1;
        judged = { genuine, total: pooled.length };
      }
      const row = {
        meeting,
        refActions: refA.length,
        refDecisions: refD.length,
        recoveredActions: recA.length,
        recoveredDecisions: recD.length,
        recoveredPooled: recPooled.length,
        pooledRecall:
          refA.length + refD.length ? recPooled.length / (refA.length + refD.length) : null,
        outputItems: pooled.length,
        referencePrecision: pooled.length ? refMatched.length / pooled.length : null,
        judgedPrecision: judged && judged.total ? judged.genuine / judged.total : null,
        linkChecked: linked.length,
        secondaryChecked: secondary.length,
        secondaryBroken,
        linkProblems: problems.length,
        linkBroken: problems.filter((x) => x.p !== 'words not found nearby').length,
        linkProblemList: problems.map((x) => `${x.i.kind} ${x.i.evidence.timestampSec}s: ${x.p}`),
        missed: [...refA, ...refD].filter((r) => !pooled.some((i) => matches(r, i))),
        warnings: extraction.warnings,
      };
      rows.push(row);
      console.log(
        `${meeting}: recall ${recPooled.length}/${refA.length + refD.length} (${pct(recPooled.length, refA.length + refD.length)}; actions ${recA.length}/${refA.length}, decisions ${recD.length}/${refD.length}); ` +
          `reference-precision ${refMatched.length}/${pooled.length} (${pct(refMatched.length, pooled.length)}); ` +
          `judged-precision ${judged ? `${judged.genuine}/${judged.total} (${pct(judged.genuine, judged.total)})` : 'not run'}; ` +
          `links: ${linked.length - brokenCount(problems)}/${linked.length} point at a real line with its stored time; secondary (alsoAt) links ${secondary.length - secondaryBroken}/${secondary.length} real; ${linked.length - problems.length}/${linked.length} also share 30% of their words with the nearby lines`,
      );
    }
  } finally {
    await worker?.stop();
  }
  const sum = (k: string): number => rows.reduce((a, r) => a + (r[k] as number), 0);
  const refTotal = sum('refActions') + sum('refDecisions');
  console.log(
    `TOTAL: recall ${sum('recoveredPooled')}/${refTotal} (${pct(sum('recoveredPooled'), refTotal)}); links real: primary ${sum('linkChecked') - sum('linkBroken')}/${sum('linkChecked')}, secondary ${sum('secondaryChecked') - sum('secondaryBroken')}/${sum('secondaryChecked')}; word-supported ${sum('linkChecked') - sum('linkProblems')}/${sum('linkChecked')}`,
  );
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
