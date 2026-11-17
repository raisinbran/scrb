### A-644 — 2026-11-16 — Codex desktop — boundary check skipped on nonstandard branch prefix
- **Status / attribution:** Confirmed agent setup error; no product defect.
- **What failed:** The first boundary-check invocation used a `cuc/` branch name, so the script correctly skipped branches outside `ui/` and `backend/`.
- **Impact:** That invocation did not validate the change boundary.
- **Correction / remaining risk:** Renamed the branch to `backend/manual-correction-word-id-20261116`; the commit-based check passed for 14 files with `CONTRACT_APPROVED=1`. Low.
