### A-804 — 2026-11-18 — Codex Desktop / MacBook Air M5 — provenance probe expected the wrong llama-server version text

- **Status / attribution:** Confirmed verification-script expectation error; no application defect.
- **What failed:** The first packaging pass built the candidate, but the provenance verifier expected `llama.cpp` in `llama-server --version` output. The actual output reports `version: 0.8.0-dev (build 1, commit 369dcf3)` and exits successfully.
- **Impact:** Provenance generation stopped and the outer app signature was not produced. The candidate remained only in the isolated worktree; `/Applications` and the preserved backup were untouched.
- **Correction / remaining risk:** Match the observed version and pinned commit prefix, then perform one corrected build and verification pass. Low; the failure was in the check's expected text.

- **Publication ID reconciliation:** Published here as A-804; the original local candidate record A-794 remains unchanged. The original identifier overlapped the open incident set for PR #368.
