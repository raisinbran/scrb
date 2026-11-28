### A-767 — 2026-11-17 — Codex / MacBook Air M5 — recursive app-bundle diff encountered framework symlink loops

- **Status / attribution:** Confirmed comparison-command limitation; no app defect.
- **What failed:** `diff -qr` followed framework directory symlinks in the two app bundles and reported directory loops, so that command did not establish equivalence.
- **Impact:** The initial comparison was inconclusive.
- **Correction / remaining risk:** Replaced it with a symlink-aware SHA-256 manifest comparison that did not follow directory links. It found 304 entries in each bundle and no content, mode, or symlink-target differences. Low.
