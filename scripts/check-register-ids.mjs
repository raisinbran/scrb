// Register integrity: no repeated A-number across the legacy failures register and agents/incidents/, and
// well-formed, unique rows across the legacy usage log and agents/usage-log/. New rows and incidents are one
// file each, so parallel PRs never conflict; rows appended to the legacy files by already-open PRs are still
// accepted until the follow-up that enforces the freeze; this catches what that scheme allows (a clashing A-number).
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Historical repeats already on main, grandfathered by exact occurrence count. Do not add to this.
export const KNOWN_DUPLICATES = new Map([['A-104', 2]]);

export const USAGE_COLUMNS = 12;
// SHA-256 of the two complete existing 11-column rows (full-line equality). Do not add to this.
export const KNOWN_SHORT_ROW_HASHES = new Set([
  'c4310a8439ec548b1dcb12c4c969cf2d537ed3473ac3c8a087da64761657fade',
  '266784f56b5ef5aac2e48cb320d280c11284283c047db2a44cfc5fc3fd6d138d',
]);

export function findDuplicateIds(text) {
  const counts = new Map();
  for (const line of text.split(/\r?\n/)) {
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
  text.split(/\r?\n/).forEach((line, i) => {
    if (!/^\| 20\d\d-\d\d-\d\d /.test(line)) return;
    const n = columns(line);
    const grandfathered = KNOWN_SHORT_ROW_HASHES.has(
      createHash('sha256').update(line).digest('hex'),
    );
    if (n !== USAGE_COLUMNS && !grandfathered)
      problems.push(`line ${i + 1}: ${n} columns, expected ${USAGE_COLUMNS}`);
    if (seen.has(line)) problems.push(`line ${i + 1}: duplicate row`);
    seen.add(line);
  });
  return problems;
}

const ROW = /^\| 20\d\d-\d\d-\d\d /;
const HEADING = /^#{2,4} (A-\d+) [—-] /;

// A usage-row file holds exactly one row; extra prose around it is allowed.
export function checkUsageRowFile(text) {
  const rows = text.split(/\r?\n/).filter((l) => ROW.test(l));
  if (rows.length !== 1) return [`expected exactly one usage row, found ${rows.length}`];
  const stray = text
    .split(/\r?\n/)
    .filter((l) => l.startsWith('|') && !ROW.test(l) && !/^\|[\s:|-]+$/.test(l));
  return [
    ...findBadUsageRows(rows[0]).map((p) => p.replace(/^line 1: /, '')),
    ...stray.map((l) => `stray table line (bad date or extra row): ${l.slice(0, 40)}`),
  ];
}

// An incident file holds one `### A-nnn — title` heading and its number must match the file name.
export function checkIncidentFile(name, text) {
  const ids = text
    .split(/\r?\n/)
    .map((l) => HEADING.exec(l)?.[1])
    .filter(Boolean);
  if (ids.length !== 1) return [`expected exactly one A-number heading, found ${ids.length}`];
  if (!name.startsWith(`${ids[0]}-`)) return [`file name must start with ${ids[0]}-`];
  return [];
}

const dirFiles = (dir) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.md') && f !== 'README.md')
        .sort()
    : [];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = [];
  const legacyIncidents = readFileSync('agents/agent_self_induced_failures.md', 'utf8');
  const legacyUsage = readFileSync('agents/usage-log.md', 'utf8');
  let incidentText = legacyIncidents;
  let usageText = legacyUsage;
  for (const f of dirFiles('agents/incidents')) {
    const text = readFileSync(`agents/incidents/${f}`, 'utf8');
    for (const p of checkIncidentFile(f, text)) failures.push(`agents/incidents/${f}: ${p}`);
    incidentText += `\n${text}`;
  }
  for (const f of dirFiles('agents/usage-log')) {
    const text = readFileSync(`agents/usage-log/${f}`, 'utf8');
    for (const p of checkUsageRowFile(text)) failures.push(`agents/usage-log/${f}: ${p}`);
    usageText += `\n${text}`;
  }
  const dups = findDuplicateIds(incidentText);
  if (dups.length > 0)
    failures.push(
      `Repeated A-number across agents/agent_self_induced_failures.md and agents/incidents/: ${dups.join(', ')} (the later PR renumbers its own incident file)`,
    );
  for (const p of findBadUsageRows(usageText)) failures.push(`usage rows (legacy + folder) ${p}`);
  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
}
