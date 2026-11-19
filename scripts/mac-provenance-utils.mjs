import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const hash = (value) => createHash('sha256').update(value).digest('hex');

export function collectSourceChanges(repo) {
  const run = (args) => execFileSync('git', ['-C', repo, ...args]);
  const tracked = run(['diff', '--name-only', '-z', '--diff-filter=ACDMR', 'HEAD'])
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .sort();
  const untracked = run(['ls-files', '--others', '--exclude-standard', '-z'])
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .sort();
  const trackedPatch = run(['diff', '--binary', 'HEAD']);
  const digest = createHash('sha256').update(trackedPatch);
  for (const file of untracked) {
    digest
      .update('\0untracked-source\0')
      .update(file)
      .update('\0')
      .update(hash(readFileSync(path.join(repo, file))));
  }
  return {
    changedTrackedFiles: tracked,
    untrackedSourceFiles: untracked,
    workingTreePatchSha256: digest.digest('hex'),
  };
}

export function summarizeProbe({ args, status, output, matchedExpectedOutput }) {
  return {
    args,
    status,
    outputSha256: hash(output.trim()),
    matchedExpectedOutput,
  };
}
