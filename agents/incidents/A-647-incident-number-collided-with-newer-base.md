### A-647 — 2026-11-16 — Codex desktop — incident numbers were selected from a stale checkout
- **Status / attribution:** Confirmed agent error; no product defect.
- **What failed:** I assigned A-512 through A-519 from the older local `main` view without first checking the newer `origin/main` incident list. Register validation found that those numbers were already present there.
- **Impact:** The first register check failed; no change was published.
- **Correction / remaining risk:** Renumbered this task's incidents after the latest existing entry (A-638) and reran validation. Low.
