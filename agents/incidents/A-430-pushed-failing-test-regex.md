### A-430 — 2026-11-15 — Claude Code (Sonnet 5.5) / BCHEN-W10 — failing test committed and pushed after its failure was shown
- **Status / attribution:** Confirmed agent error. Fixed in the next commit of the same PR before review. No product defect.
- **What failed:** A new test in `packaged-setup.test.ts` had a broken regular expression (a `/` unescaped by a shell-written edit, then reformatted by Prettier). The test run printed one failure, but the same command chain committed and pushed regardless.
- **Impact:** One commit on PR #306 (model download slice 1 backend) carried a failing test; the following commit fixed it. No merge was affected.
- **Source evidence:** `ReferenceError: LOCALAPPDATA is not defined` from `packaged-setup.test.ts`; commit `ed9c38f6` and its successor on `cuc/model-download-slice1-backend`.
- **Correction / remaining risk:** Regex corrected and the file re-run (14 passed). Low risk. Do not chain commit and push after a test command whose result has not been read.
