### A-365 — 2026-11-14 — Codex / Mac desktop — unsandboxed git restore was needed for lock cleanup
- **Status / attribution:** Confirmed agent tool-use error; no application defect.
- **What failed:** I attempted to restore the transcription package-local lockfile using `git checkout` without escalation; the sandbox denied writing the worktree index.
- **Impact:** The lockfile was not restored by that command.
- **Correction / remaining risk:** Used the approved elevated worktree operation to revert only my own generated lock churn, then reapplied the requested Node typings lock entries narrowly. Low.
