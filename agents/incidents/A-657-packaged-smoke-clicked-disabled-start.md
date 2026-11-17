### A-657 — 2026-11-16 — Codex / BCHEN-W10 — Packaged smoke tried to click a disabled Start button

- **Observed effect:** The packaged-app Playwright test timed out trying to click Start when the clean temporary profile correctly had no speech models and the button was disabled.
- **Evidence:** `apps/desktop/build/packaged-smoke-slice2.log` records the disabled button title, `Download the speech models first`; prior assertions in that same test confirmed setup incomplete and `startRecording` returned the packaged app's refusal.
- **Attribution:** Agent-run QA exposed a stale test interaction assumption; no recording started and no app defect is established.
- **Correction:** Update the focused smoke assertion to verify the disabled Start state and retain the direct refusal assertion.
- **Remaining risk:** Repeat the one packaged smoke after the narrow test correction; no physical recording is involved.
