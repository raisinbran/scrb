// Fails a branch that crosses the UI/backend folder boundary (Development Process, Enforcement).
// While the owner has lifted the agent split, only `ui/*` and `backend/*` branches are checked.
// Set CONTRACT_APPROVED=1 once the owner has approved a contract change on such a branch.
import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const UI_PATHS = ['apps/desktop/src/ui/', 'apps/desktop/e2e/'];
const CONTRACT_PATH = 'packages/contracts/';
const SHARED_PATHS = ['docs/handoffs/'];

const branch = process.env.GITHUB_HEAD_REF || git('rev-parse', '--abbrev-ref', 'HEAD');
const base = process.env.BOUNDARY_BASE || 'origin/main';
const isUiBranch = branch.startsWith('ui/');
const isBackendBranch = branch.startsWith('backend/');

if (!isUiBranch && !isBackendBranch) {
  console.log(`Boundary check skipped on ${branch}: the agent split is lifted for now.`);
  process.exit(0);
}

const changed = git('diff', '--name-only', `${git('merge-base', base, 'HEAD')}...HEAD`)
  .split('\n')
  .filter(Boolean);
const isUi = (file) => UI_PATHS.some((path) => file.startsWith(path));
const isShared = (file) => SHARED_PATHS.some((path) => file.startsWith(path));

const violations = changed.filter((file) => {
  if (isShared(file)) return false;
  if (file.startsWith(CONTRACT_PATH)) return process.env.CONTRACT_APPROVED !== '1';
  return isUiBranch ? !isUi(file) : isUi(file);
});

if (violations.length > 0) {
  console.error(`Files outside this branch's boundary:\n${violations.join('\n')}`);
  process.exit(1);
}
console.log(`Boundary check passed for ${changed.length} files on ${branch}.`);
