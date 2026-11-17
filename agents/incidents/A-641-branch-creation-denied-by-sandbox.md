### A-641 — 2026-11-16 — Codex desktop — initial task branch creation denied by sandbox
- **Status / attribution:** Confirmed environment/tooling failure; no product defect.
- **What failed:** The initial `git switch -c` could not create `.git/index.lock` because repository metadata was read-only in the default sandbox.
- **Impact:** One failed branch command; no source files changed.
- **Correction / remaining risk:** Created the approved branch with the authorized escalated Git command. Low.
