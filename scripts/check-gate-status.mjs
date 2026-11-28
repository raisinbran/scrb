// Fails when a PR changes a file under docs/gates/ (other than STATUS.md) without also changing docs/gates/STATUS.md.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const STATUS = 'docs/gates/STATUS.md';

export function statusMissing(changed) {
  const gate = changed.filter((f) => f.startsWith('docs/gates/') && f !== STATUS);
  return gate.length > 0 && !changed.includes(STATUS) ? gate : [];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const git = (...a) =>
    execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  let changed;
  try {
    const base = git('merge-base', 'HEAD', 'origin/main');
    if (base === git('rev-parse', 'HEAD')) process.exit(0);
    changed = git('diff', '--name-only', `${base}...HEAD`).split('\n').filter(Boolean);
  } catch {
    console.log('check-gate-status: no origin/main to compare with, skipped');
    process.exit(0);
  }
  const gate = statusMissing(changed);
  if (gate.length > 0) {
    console.error(`${STATUS} must change in the same PR as:\n  ${gate.join('\n  ')}`);
    process.exit(1);
  }
}
