/**
 * Applies the reconcile step to saved extractions, so the scorer can compare before and after
 * without another model run (the step is deterministic).
 *
 *   node dist/eval/reconcile.js <fixtures_dir> <in_dir> <out_dir> <meeting>... [--per-minute N] [--no-cap]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { reconcileExtraction } from '../src/reconcile.js';
import type { Extraction } from '../src/types.js';
import { parseTranscript } from './fixture.js';

const args = process.argv.slice(2);
const at = args.indexOf('--per-minute');
const perMinute = args.includes('--no-cap') ? 0 : at >= 0 ? Number(args[at + 1]) : undefined;
const [fixtures, input, out, ...meetings] = args.filter(
  (a, i) => !a.startsWith('--') && (at < 0 || i !== at + 1),
);
if (!fixtures || !input || !out || meetings.length === 0)
  throw new Error('usage: reconcile.js <fixtures> <in> <out> <meeting>...');
mkdirSync(out, { recursive: true });
for (const meeting of meetings) {
  const transcript = parseTranscript(
    readFileSync(join(fixtures, `${meeting}.transcript.txt`), 'utf8'),
  );
  const before = JSON.parse(
    readFileSync(join(input, `${meeting}.extraction.json`), 'utf8'),
  ) as Extraction;
  const minutes = (transcript.lines.at(-1)?.startSec ?? 0) / 60;
  const after = reconcileExtraction(
    before,
    minutes,
    perMinute === undefined ? {} : { itemsPerMinute: perMinute },
  );
  writeFileSync(join(out, `${meeting}.extraction.json`), JSON.stringify(after, null, 1));
  const n = (e: Extraction) => e.actions.length + e.decisions.length;
  console.log(`${meeting}: ${n(before)} -> ${n(after)} items (${minutes.toFixed(0)} min)`);
}
