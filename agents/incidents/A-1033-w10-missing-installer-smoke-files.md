### A-1033 — 2026-11-20 — W10 — local checkout lacked installer-smoke files

- **What failed:** I attempted to read PR #376 installer-smoke files from the PR #377 based local checkout; those files are not present in that checkout, so PowerShell stopped at the first missing path.
- **Impact:** The local file review did not run and no repository or GitHub state changed.
- **Correction / remaining risk:** Read the exact PR #376 files through the connected GitHub integration before preparing a bounded update. Low.
- **Publication:** Included in the Windows M1 reporting update; pending normal PR review.

- **Incident-ID reconciliation (2026-11-21, cloud):** Originally published on draft W10 PR #376 as provisional A-907. Renumbered to A-1033 because open Mac PR #378 independently owns A-907 for a different event. Original event, date, attribution and prior Git history remain preserved; this change is administrative, not product remediation. Device-local unpublished future ID reservations are not independently verifiable from this cloud session.
