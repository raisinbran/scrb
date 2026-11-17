### A-708 — 2026-11-16 — Codex desktop — incident numbers were selected from a stale checkout
- **Status / attribution:** Confirmed agent error; no product defect.
- **What failed:** I assigned A-512 through A-519 from the older local `main` view without first checking the newer `origin/main` incident list. Register validation found that those numbers were already present there.
- **Impact:** The first register check failed; no change was published.
- **Correction / remaining risk:** Renumbered this task's incidents to A-700–A-708 after review found A-639–A-647 overlapped open PR #339. Verified the new range against all open PR diffs, then reran validation. Low.
