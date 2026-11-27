### A-1199 — 2026-11-26 — Codex — privacy-test CI wait gap

- **Agent:** Codex (model unavailable; Mac Codex desktop; Medium requested)
- **Status / attribution:** Confirmed QA gap in the repair; the test failure is not evidence of a privacy-banner product defect.
- **What failed:** After merging current `main`, the focused privacy test and local full check passed, but exact-head CI run 45894612521 failed the same `App.test.tsx` assertion on Windows and macOS. The test helper clicked Start and returned without waiting for recording state to update, so the subsequent banner query could race ahead of the backend event. The first merge-only correction was insufficient to resolve the cross-platform CI failure.
- **Impact:** PR #521 remained red at head `3c00a4b18dc2bdc333c002362e1bc69bef544082`; the run showed 1 failed test on each platform. No production or privacy behavior was changed by this QA gap.
- **Correction / remaining risk:** The helper now waits for the Stop button before checking the privacy banner, and the test confirms the onboarding location reached settings before starting. The corrected full repository check and fresh exact-head CI are required before calling the issue fixed. The CI failure cause is an inference from the idle-state DOM in the failed run and must be confirmed by the rerun. Low.
