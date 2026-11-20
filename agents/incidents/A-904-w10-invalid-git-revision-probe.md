### A-904 — 2026-11-20 — W10 — malformed Git revision existence probe

- **What failed:** I passed a PowerShell-sensitive revision expression to git cat-file -e; Git interpreted the resulting argument as an unknown option and printed usage text.
- **Impact:** The revision-presence check did not run. No Git or repository state changed.
- **Correction / remaining risk:** Use a quoting form that preserves the revision expression literally or verify it through a read-only GitHub commit lookup. Low.
- **Publication:** Included in the Windows M1 reporting update; pending normal PR review.
