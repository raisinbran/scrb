### A-1174 — 2026-11-25 — Mac — `npm install` in a fresh worktree rewrote package-lock.json

- **Agent:** Claude
- **Attribution:** Confirmed self-induced. I ran `npm install` instead of `npm ci` to get dependencies and committed the result with `git add -A`.
- **Evidence:** Independent review of PR #505 found unrelated lockfile edits (exact pins, added peer flags, removed libc fields).
- **Impact:** One review round; no runtime effect.
- **Correction:** Lockfile restored from `origin/main`; use `npm ci` in worktrees and stage files explicitly.
- **Remaining risk:** Low. Identifier checked against `agents/incidents/` only; open-PR reservations unchecked.
