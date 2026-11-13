// Register integrity: no repeated A-number in the failures register, and well-formed, unique rows in the
// usage log. Both files merge as a union, so this catches what a silent union merge can produce.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Historical repeats already on main, grandfathered by exact occurrence count. Do not add to this.
export const KNOWN_DUPLICATES = new Map([['A-104', 2]]);

export const USAGE_COLUMNS = 12;
// The two existing 11-column rows, identified by their leading cells. Do not add to this.
export const KNOWN_SHORT_ROWS = [
  '| 2026-11-12 | Codex / GPT-6 / Windows desktop | PHASE0-STEP2-WINDOWS-20261112 ',
  '| 2026-11-12 | Codex / GPT-6 / Windows desktop | PHASE0-STEP2-WINDOWS-FOLLOWUP-20261112 ',
];

export function findDuplicateIds(text) {
  const counts = new Map();
  for (const line of text.split('\n')) {
    const m = /^\| (A-\d+) \|/.exec(line) ?? /^#{2,4} (A-\d+) [—-] /.exec(line);
    if (m) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  return [...counts]
    .filter(([id, n]) => n > (KNOWN_DUPLICATES.get(id) ?? 1))
    .map(([id]) => id)
    .sort();
}

const columns = (line) => line.split(/(?<!\\)\|/).length - 2;

export function findBadUsageRows(text) {
  const problems = [];
  const seen = new Set();
  text.split('\n').forEach((line, i) => {
    if (!/^\| 20\d\d-\d\d-\d\d /.test(line)) return;
    const n = columns(line);
    const grandfathered =
      n === USAGE_COLUMNS - 1 && KNOWN_SHORT_ROWS.some((p) => line.startsWith(p));
    if (n !== USAGE_COLUMNS && !grandfathered)
      problems.push(`line ${i + 1}: ${n} columns, expected ${USAGE_COLUMNS}`);
    if (seen.has(line)) problems.push(`line ${i + 1}: duplicate row`);
    seen.add(line);
  });
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = [];
  const dups = findDuplicateIds(readFileSync('agents/agent_self_induced_failures.md', 'utf8'));
  if (dups.length > 0)
    failures.push(`Repeated A-number in agents/agent_self_induced_failures.md: ${dups.join(', ')}`);
  for (const p of findBadUsageRows(readFileSync('agents/usage-log.md', 'utf8')))
    failures.push(`agents/usage-log.md ${p}`);
  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
}
