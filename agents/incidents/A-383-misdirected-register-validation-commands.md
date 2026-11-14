### A-383 — 2026-11-14 — Codex — Register validation commands used the wrong setup

- **Status / attribution:** Confirmed agent error; no application defect.
- **What failed:** I launched `npm run check:register` without adding the required Node directory to `PATH`, and paired a check for a PR #232 usage file with PR #235's worktree.
- **Impact:** The validation commands failed before checking the intended records; no repository or user-data effect.
- **Correction / remaining risk:** Re-ran each focused check with the required Node path and in its matching worktree. None.
