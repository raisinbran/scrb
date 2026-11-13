// Fails on a repeated A-number in the failures register (table rows and "### A-nnn — " headings).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Historical duplicates already on main; do not add to this list.
export const KNOWN_DUPLICATES = new Set(['A-104']);

export function findDuplicateIds(text) {
  const seen = new Set();
  const dups = new Set();
  for (const line of text.split('\n')) {
    const m = /^\| (A-\d+) \|/.exec(line) ?? /^#{2,4} (A-\d+) [—-] /.exec(line);
    if (!m) continue;
    if (seen.has(m[1])) dups.add(m[1]);
    seen.add(m[1]);
  }
  return [...dups].filter((id) => !KNOWN_DUPLICATES.has(id)).sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dups = findDuplicateIds(readFileSync('agents/agent_self_induced_failures.md', 'utf8'));
  if (dups.length > 0) {
    console.error(`Repeated A-number in agents/agent_self_induced_failures.md: ${dups.join(', ')}`);
    process.exit(1);
  }
}
