### A-738 — 2026-11-17 — Codex / BCHEN-W10 — feature-branch creation first ran without repository-metadata access

- **What failed:** The first `git switch -c` attempt could not write the shared Git metadata under the managed filesystem restrictions.
- **Impact:** The branch was not created by the first command; no refs or worktree files changed.
- **Agent-controlled cause:** I did not request the required reviewed repository-metadata access on the initial attempt.
- **Correction / remaining risk:** I retried the same owner-authorized branch creation with reviewed access; the requested `rosmont/w10-issue349-warning-notice-20261117` branch was created. Low.
