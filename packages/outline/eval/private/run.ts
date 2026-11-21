import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Tuning } from '../../src/constants.js';
import { matchOutline } from '../../src/match.js';
import { emptyTally, scoreLabels, type Tally } from '../evaluate.js';
import { AMI_TUNED } from '../tuned.js';
import { alignNotes } from './align.js';
import { messageFor, RESULTS_HEADER, RunError, safeOutputPath, type ErrorCode } from './output.js';
import { listPrivateMeetings, loadPrivateMeeting } from './load.js';

/**
 * Usage: tsx eval/private/run.ts [meetingsFolder] [outFile]
 * Prints numbers only: no text, headings, names or folder names. Meetings are numbered in name order.
 * The output file must be outside the repository.
 */
const root = resolve(
  process.argv[2] ?? join(homedir(), 'Documents', 'scrb-private-samples', 'outline-fill'),
);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

async function main(): Promise<void> {
  if (!existsSync(root)) throw new RunError('E_INPUT_MISSING');
  const outFile = safeOutputPath(process.argv[3] ?? join(root, '_results.txt'), repoRoot, root);
  const pct = (a: number, b: number): string =>
    b === 0 ? 'n/a' : `${((100 * a) / b).toFixed(1)}%`;
  const median = (v: number[]): string =>
    v.length === 0
      ? 'n/a'
      : `${[...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]!.toFixed(0)}s`;
  const describe = (t: Tally): string =>
    [
      `accuracy ${pct(t.correct, t.ms)}`,
      `where a true heading exists ${pct(t.inOutlineCorrect, t.inOutlineMs)}`,
      `likely-correct ${pct(t.likelyCorrect, t.likelyMs)}`,
      `likely share ${pct(t.likelyMs, t.ms)}`,
      `unsure share ${pct(t.unsureMs, t.ms)}`,
      `not-placed share ${pct(t.notPlacedMs, t.ms)}`,
      `strict ${pct(t.strictCorrect, t.ms)}`,
      `median boundary error ${median(t.boundaryErrorsSec)}`,
    ].join(', ');

  const configs: { name: string; tuning: Partial<Tuning> }[] = [
    { name: 'defaults', tuning: {} },
    { name: 'ami-tuned', tuning: AMI_TUNED },
  ];
  const pooled = configs.map(() => emptyTally());
  const lines: string[] = [RESULTS_HEADER];
  let truthMs = 0;
  let allMs = 0;
  let used = 0;
  let skipped = 0;
  let itemsTotal = 0;
  let alignedTotal = 0;

  const folders = listPrivateMeetings(root);
  for (const [idx, folder] of folders.entries()) {
    const label = `meeting ${idx + 1}`;
    let loaded;
    try {
      loaded = await loadPrivateMeeting(join(root, folder));
    } catch {
      lines.push(`${label}: skipped (unreadable)`);
      skipped += 1;
      continue;
    }
    if (!loaded.ok) {
      lines.push(`${label}: skipped (${loaded.code})`);
      skipped += 1;
      continue;
    }
    const { items, words, bodies, agenda, ignored } = loaded.meeting;
    const al = alignNotes(words, bodies);
    if (al.alignedItems < 2) {
      lines.push(
        `${label}: skipped (fewer than 2 outline items aligned to the notes; items ${items.length}, aligned ${al.alignedItems})`,
      );
      skipped += 1;
      continue;
    }
    used += 1;
    const total = words.reduce((a, w) => a + (w.endMs - w.startMs), 0);
    const labelled = words.reduce(
      (a, w, i) => a + (al.wordItem[i] === null ? 0 : w.endMs - w.startMs),
      0,
    );
    truthMs += labelled;
    allMs += total;
    itemsTotal += items.length;
    alignedTotal += al.alignedItems;
    const truth = al.wordItem.map((i) => (i === null ? null : items[i]!.id));
    lines.push(
      `${label}: words ${words.length}, blocks ${al.blocks.length}, outline items ${items.length}, aligned to notes ${al.alignedItems}, not aligned ${items.length - al.alignedItems}, time with a reference heading ${pct(labelled, total)}, mean alignment score ${al.meanScore.toFixed(2)}${agenda ? `, agenda lines kept ${agenda.kept} of ${agenda.seen}` : ''}${ignored ? `, other candidate files ignored ${ignored}` : ''}`,
    );
    configs.forEach((c, ci) => {
      const placed = matchOutline(words, items, { tuning: c.tuning });
      const found: (string | null)[] = new Array(words.length).fill(null);
      const conf: string[] = new Array(words.length).fill('unsure');
      for (const b of placed)
        for (let i = b.first; i <= b.last; i += 1) {
          found[i] = b.itemId;
          conf[i] = b.confidence;
        }
      const t = emptyTally();
      scoreLabels(words, found, conf, truth, t);
      scoreLabels(words, found, conf, truth, pooled[ci]!);
      lines.push(`  ${c.name}: ${describe(t)}`);
    });
  }

  lines.push(
    '',
    `Overall: ${used} meetings scored, ${skipped} skipped, outline items ${itemsTotal}, aligned ${alignedTotal}, not aligned ${itemsTotal - alignedTotal}, time with a reference heading ${pct(truthMs, allMs)}`,
  );
  configs.forEach((c, ci) => {
    const t = pooled[ci]!;
    lines.push(
      `  ${c.name}: ${describe(t)}, meetings under 70% ${t.meetingAcc.filter((a) => a < 0.7).length} of ${t.meetings}, mean per-meeting accuracy ${t.meetingAcc.length ? ((100 * t.meetingAcc.reduce((a, b) => a + b, 0)) / t.meetingAcc.length).toFixed(1) + '%' : 'n/a'}`,
    );
  });
  lines.push(
    'Accuracy is time-weighted over words, against a reference built from final-notes.md (see docs/research/outline-private-eval.md for limits). Not-placed on dialog with no reference heading counts as correct.',
  );
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}

main().catch((e: unknown) => {
  const code: ErrorCode = e instanceof RunError ? e.code : 'E_UNKNOWN';
  console.error(messageFor(code));
  process.exitCode = 1;
});
