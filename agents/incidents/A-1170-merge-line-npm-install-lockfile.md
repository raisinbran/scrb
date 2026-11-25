### A-1170 — 2026-11-25 — Claude Code / Mac — `npm install` rewrote package-lock.json and it was committed

- **Attribution:** Confirmed self-induced. I ran `npm install --ignore-scripts` in the worktree for the AMI sweep and then committed everything with `git add -A`, including unrelated lockfile edits.
- **Evidence:** PR #504 independent review found exact pins, added `"peer": true` and deleted `libc` fields in `package-lock.json`.
- **Impact:** An unrelated lockfile diff in the PR; no code or test effect.
- **Correction:** Restored `package-lock.json` from `origin/main`; use `npm ci` and stage files by name.
- **Remaining risk:** Low. Identifier checked against main and open PRs; unpublished reservations unknown.
