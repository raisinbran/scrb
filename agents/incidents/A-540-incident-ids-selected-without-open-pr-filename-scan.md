### A-540 — 2026-11-16 — Codex / BCHEN-W10 — incident IDs selected without scanning open PR filenames

- **Status / attribution:** Confirmed agent error; no application defect.
- **What failed:** I assigned A-532–A-535 to PR #324 after checking the merged main register and issue-text search, but did not inspect open PR changed filenames. Open PR #322 already reserves A-532/A-533 and #318 reserves A-534/A-535.
- **Impact:** PR #324 was briefly pushed and CI started with four incident-number collisions. Independent review detected the collisions before merge; no merge occurred.
- **Correction / remaining risk:** Rechecked current main and every open PR's incident filenames. Main ends at A-531; A-532–A-535 are occupied by #322/#318; A-536–A-539 are the next collision-free block. Renumbered PR #324's four records to A-536–A-539 and updated usage references before pushing. Low.
