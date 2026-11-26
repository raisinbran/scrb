### A-1200 — 2026-11-26 — Codex — changed-file Prettier gate missed

- **Agent:** Codex (model unavailable; Mac Codex desktop; Medium requested)
- **Status / attribution:** Confirmed agent QA error; no application defect.
- **What failed:** The #521 follow-up commit changed `App.test.tsx` without running the changed-file Prettier gate before pushing. Exact-head Windows CI run 45896463130 stopped at that gate and skipped typecheck and tests. The first local Prettier write also hit `EPERM` in the worktree; applying the formatter with authorized file access succeeded.
- **Impact:** PR #521 remained red at head `8db7305aac400bf92afd34cb2cdcffe830bbfdcf`; the privacy assertion on that head was not evaluated by CI. No source data or test results were lost.
- **Correction / remaining risk:** Prettier has now formatted `apps/desktop/src/ui/App.test.tsx`. Run `npm run check`, `npm run check:register`, and the changed-file formatter gate before pushing. The next exact-head CI run must confirm the test and platform checks. Low.
