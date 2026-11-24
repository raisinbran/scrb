// Fails a branch that edits the owner-approved contract without recording the approval, or (on `ui/*`
// and `backend/*` branches) crosses the UI/backend folder boundary (Development Process, Enforcement).
// The agent split is a preference, so only the folder rule depends on the branch name.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const UI_PATHS = ['apps/desktop/src/ui/', 'apps/desktop/e2e/'];
const CONTRACT_PATH = 'packages/contracts/';
export const APPROVALS_FILE = 'packages/contracts/APPROVALS.md';
const SHARED_PATHS = ['docs/handoffs/'];

/** Problems with one branch's changed files; `approvalAdded` is whether it adds an APPROVALS.md line. */
export function findViolations(branch, changed, approvalAdded) {
  const problems = [];
  const contractEdits = changed.filter((f) => f.startsWith(CONTRACT_PATH) && f !== APPROVALS_FILE);
  if (contractEdits.length > 0 && !approvalAdded) {
    problems.push(
      `Contract files changed without a new line in ${APPROVALS_FILE} recording the owner's approval:\n${contractEdits.join('\n')}`,
    );
  }
  const isUiBranch = branch.startsWith('ui/');
  if (isUiBranch || branch.startsWith('backend/')) {
    const isUi = (file) => UI_PATHS.some((path) => file.startsWith(path));
    const outside = changed.filter(
      (file) =>
        !SHARED_PATHS.some((path) => file.startsWith(path)) &&
        !file.startsWith(CONTRACT_PATH) &&
        (isUiBranch ? !isUi(file) : isUi(file)),
    );
    if (outside.length > 0)
      problems.push(`Files outside this branch's boundary:\n${outside.join('\n')}`);
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // A push to main was already checked in its pull request.
  if (process.env.GITHUB_EVENT_NAME === 'push') process.exit(0);
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const branch = process.env.GITHUB_HEAD_REF || git('rev-parse', '--abbrev-ref', 'HEAD');
  const range = `${git('merge-base', process.env.BOUNDARY_BASE || 'origin/main', 'HEAD')}...HEAD`;
  const changed = git('diff', '--name-only', range).split('\n').filter(Boolean);
  const approvalAdded = git('diff', '--unified=0', range, '--', APPROVALS_FILE)
    .split('\n')
    .some((line) => /^\+[^+]/.test(line) && line.includes('|'));
  const problems = findViolations(branch, changed, approvalAdded);
  if (problems.length > 0) {
    console.error(problems.join('\n\n'));
    process.exit(1);
  }
  console.log(`Boundary check passed for ${changed.length} files on ${branch}.`);
}
