### A-645 — 2026-11-16 — Codex / BCHEN-W10 — npm registry denied in restricted execution

- **Effect:** The Node 22 `npm ci` attempt did not complete, so focused Vitest and packaged smoke checks remain unavailable.
- **Evidence:** npm's request for `https://registry.npmjs.org/undici-types/-/undici-types-6.20.0.tgz` failed with `EACCES`; npm also reported `EPERM` while cleaning a partial `node_modules` directory in this new worktree.
- **Cause:** The command ran inside the network-restricted sandbox without an approved registry connection; the worktree-local cache did not contain all lockfile tarballs.
- **Correction:** Request the task-authorized dependency install with network access and continue using Node 22 plus the worktree-local cache.
- **Remaining risk:** If network access is not approved or cleanup remains denied, local tests and packaging cannot complete; CI will still need to validate the staging code.
