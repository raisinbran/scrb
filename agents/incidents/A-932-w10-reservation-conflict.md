### A-932 — 2026-11-20 — W10 — Duplicate incident ID reservation

- **Status / attribution:** Confirmed reporting error; no repository state changed.
- **What failed:** The initial incident allocation included A-924, already reserved by PR #378; a first local incident draft also paired a filename ID with the wrong heading ID.
- **Impact:** Those drafts could not safely enter a PR as written.
- **Correction / remaining risk:** Excluded A-924, removed the mismatched draft, and verified the remaining filenames/headings before publication. No existing record was edited. Low.
