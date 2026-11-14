### A-368 — 2026-11-14 — Codex / Mac desktop — runtime and sandbox prerequisites were assumed

- **Status / attribution:** Confirmed agent command-setup errors; no product defect.
- **What failed:** The first npm call omitted the documented Node directory from `PATH`; the first direct Prettier path was guessed before dependencies existed. Initial install, formatting and test invocations then hit sandbox `EPERM` while creating worktree-local dependency or Vite temporary directories. One metadata query also had a JavaScript syntax typo and was corrected before retry.
- **Impact / evidence:** Several failed setup commands and a small avoidable delay; no user data or app source was lost. The final repository check also had one unrelated `packages/summary/test/worker.test.ts` failure because the clean worktree lacked `packages/summary/dist/src/worker.js` (1,595 other tests passed, 25 skipped).
- **Correction / remaining risk:** Used the documented Node binary and PATH, installed the lockfile offline with scripts disabled, and retried the authorized formatter and targeted tests with worktree write approval. Did not rerun the unrelated worker test. None for the requested changes.
