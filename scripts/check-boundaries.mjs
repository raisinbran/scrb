// Fails a branch that edits the owner-approved contract without recording the approval, or (on `ui/*`
// and `backend/*` branches) crosses the UI/backend folder boundary (Development Process, Enforcement).
// The agent split is a preference, so only the folder rule depends on the branch name.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const UI_PATHS = ['apps/desktop/src/ui/', 'apps/desktop/e2e/'];
const CONTRACT_PATH = 'packages/contracts/';
export const APPROVALS_FILE = 'packages/contracts/APPROVALS.md';
const SHARED_PATHS = ['docs/handoffs/'];

const tableRows = (text) =>
  text
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith('|'))
    .map((line) =>
      line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => cell.trim()),
    )
    .filter((cells) => !cells.every((c) => /^:?-*:?$/.test(c)) && cells[0] !== 'Date (PT)');

const isApprovalRow = ([date, pr, change, decision, ...rest]) =>
  rest.length === 0 &&
  /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') &&
  !Number.isNaN(Date.parse(date)) &&
  /^#\d+$/.test(pr ?? '') &&
  Boolean(change) &&
  Boolean(decision);

/**
 * True when `head` keeps every existing approval row unchanged (ignoring table padding) and adds at
 * least one new, complete row: date, PR number, change and the owner's decision.
 */
export function approvalAdded(base, head) {
  const key = (cells) => cells.join('|');
  const before = new Set(tableRows(base).map(key));
  const after = tableRows(head);
  const kept = new Set(after.map(key));
  if ([...before].some((row) => !kept.has(row))) return false;
  return after.some((cells) => !before.has(key(cells)) && isApprovalRow(cells));
}

/** Problems with one branch's changed files; `approvalAdded` is whether it adds a valid approval row. */
export function findViolations(branch, changed, approvalAdded) {
  const problems = [];
  const contractEdits = changed.filter((f) => f.startsWith(CONTRACT_PATH) && f !== APPROVALS_FILE);
  if (contractEdits.length > 0 && !approvalAdded) {
    problems.push(
      `Contract files changed without a new, complete row in ${APPROVALS_FILE} (date, #PR, change, owner's decision) that leaves existing rows unchanged:\n${contractEdits.join('\n')}`,
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
  const base = git('merge-base', process.env.BOUNDARY_BASE || 'origin/main', 'HEAD');
  const changed = git('diff', '--name-only', `${base}...HEAD`).split('\n').filter(Boolean);
  const read = (rev) => {
    try {
      return execFileSync('git', ['show', `${rev}:${APPROVALS_FILE}`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      return '';
    }
  };
  const problems = findViolations(branch, changed, approvalAdded(read(base), read('HEAD')));
  if (problems.length > 0) {
    console.error(problems.join('\n\n'));
    process.exit(1);
  }
  console.log(`Boundary check passed for ${changed.length} files on ${branch}.`);
}
