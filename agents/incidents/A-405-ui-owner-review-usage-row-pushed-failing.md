### A-405 — 2026-11-14 — Claude Code (Sonnet 5.5) / Mac desktop — usage row pushed with the wrong column count
- **Status / attribution:** Confirmed agent error. Fixed within the same PR before review. No product defect.
- **What failed:** The usage row for the owner UI review task was committed and pushed with 11 columns instead of 12, and `npm run check` was run only as a grep filter whose output was not read before pushing.
- **Impact:** One commit on PR #269 failed `check:register`; the next commit fixed it. No merge was affected.
- **Source evidence:** `check-register-ids.mjs` output "11 columns, expected 12"; PR #269 commit history.
- **Correction / remaining risk:** Row corrected. Low risk. Read the register check output before pushing.
