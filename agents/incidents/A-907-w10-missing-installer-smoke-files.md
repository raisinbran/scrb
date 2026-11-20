### A-907 — 2026-11-20 — W10 — local checkout lacked installer-smoke files

- **What failed:** I attempted to read PR #376 installer-smoke files from the PR #377 based local checkout; those files are not present in that checkout, so PowerShell stopped at the first missing path.
- **Impact:** The local file review did not run and no repository or GitHub state changed.
- **Correction / remaining risk:** Read the exact PR #376 files through the connected GitHub integration before preparing a bounded update. Low.
- **Publication:** Included in the Windows M1 reporting update; pending normal PR review.
