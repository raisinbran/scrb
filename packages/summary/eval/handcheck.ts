/**
 * Builds the hand-check pack: a seeded random sample of output actions and decisions, each with
 * the line it cites, for a person to mark correct or not. Nothing here is scored by a model.
 *
 *   node dist/eval/handcheck.js <fixtures_dir> <out_dir> <per_meeting> <seed> <meeting>...  > pack.md
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatStamp } from '../src/time.js';
import type { Extraction } from '../src/types.js';
import { parseTranscript } from './fixture.js';

/** Small seeded generator (mulberry32), so the same seed always draws the same items. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const [fixtures, out, perMeeting, seed, ...meetings] = process.argv.slice(2);
if (!fixtures || !out || !perMeeting || !seed || meetings.length === 0)
  throw new Error('usage: handcheck.js <fixtures> <out> <per_meeting> <seed> <meeting>...');
const next = random(Number(seed));
const cell = (s: string) => s.replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
const rows: string[] = [];
let n = 0;
for (const meeting of meetings) {
  const transcript = parseTranscript(
    readFileSync(join(fixtures, `${meeting}.transcript.txt`), 'utf8'),
  );
  const e = JSON.parse(readFileSync(join(out, `${meeting}.extraction.json`), 'utf8')) as Extraction;
  const pool = [...e.actions, ...e.decisions];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  for (const item of pool.slice(0, Number(perMeeting))) {
    const at = item.evidence.lineIndex;
    const quote = transcript.lines
      .slice(Math.max(0, at - 1), at + 2)
      .map(
        (l, k) =>
          `${k === (at === 0 ? 0 : 1) ? '**' : ''}${l.speaker}: ${l.text}${k === (at === 0 ? 0 : 1) ? '**' : ''}`,
      )
      .join(' / ');
    n += 1;
    rows.push(
      `| ${n} | ${meeting} | ${item.kind} | ${cell(item.text)} | ${formatStamp(item.evidence.timestampSec)} | ${cell(quote)} |  |`,
    );
  }
}
console.log(
  '| # | Meeting | Kind | Output item | Time | Cited line (bold) with neighbours | Correct? (y / n) |',
);
console.log('| -: | --- | --- | --- | --- | --- | --- |');
console.log(rows.join('\n'));
