### A-1076 — 2026-11-22 — Independent review — unsupported PR ref and missing-result formatting error

- **What failed:** An attempted read used the label `PR415` as a file ref instead of the exact commit SHA. The fetch returned 404; a formatter then dereferenced the missing result and stopped.
- **Impact:** No repository state changed; no data was exposed or modified.
- **Correction / remaining risk:** Re-fetched the incident using PR #415's exact head SHA and verified PR #432's changed-file list contains no A-1044 path. Low.
