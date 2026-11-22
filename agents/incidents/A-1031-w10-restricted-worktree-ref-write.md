### A-1031 — 2026-11-20 — W10 — local branch creation denied in managed worktree

- **What failed:** I attempted to create a local branch from a separately managed worktree whose shared Git metadata is outside the writable workspace; Windows denied the ref write.
- **Impact:** No branch ref or project file changed. The task could not use that worktree for local commits.
- **Correction / remaining risk:** Continue edits only in the authorized writable checkout and publish through the normal GitHub PR branch workflow. Low.
- **Publication:** Included in the Windows M1 reporting update; pending normal PR review.

- **Incident-ID reconciliation (2026-11-21, cloud):** Originally published on draft W10 PR #376 as provisional A-905. Renumbered to A-1031 because open Mac PR #378 independently owns A-905 for a different event. Original event, date, attribution and prior Git history remain preserved; this change is administrative, not product remediation. Device-local unpublished future ID reservations are not independently verifiable from this cloud session.
