### A-573 — 2026-11-16 — Codex / model and effort unavailable / Mac desktop — Settings full check

- The first full `npm run check` ran with root and desktop `node_modules` symlinked into the Speakers worktree. The privacy scan enumerated the unignored root symlink as a repository file and failed with `EISDIR`; three unrelated profile-matching tests also timed out in that run.
- Remove the shared symlinks and install the locked dependencies directly in the Settings worktree, then rerun the required checks to assess the test suite in the correct workspace.
