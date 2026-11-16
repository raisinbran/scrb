### A-529 — 2026-11-15 — Codex / GPT-6 series / Mac desktop — rollover regression fixture crossed the drift limit

- **Status / attribution:** Confirmed test-fixture error; no application defect.
- **What failed:** The first escalated focused Vitest run passed 11 of 12 cases. The 24 kHz rollover-outlier fixture shortened one chunk by 50 ms without representing the corresponding marked gap, so its microphone timeline also crossed the unchanged 50 ms drift limit and the report returned FAIL instead of the intended INCONCLUSIVE sample-evidence result.
- **Impact:** One focused regression assertion failed after test collection. No production behavior, acceptance limit, original report, recording, evidence, primary checkout, or recovery stash changed.
- **Correction / remaining risk:** Keep the per-rate count outlier span-consistent and include the fixture's corresponding small helper-marked gap, isolating the sample-count result while keeping drift and gap totals within existing limits. Low.
