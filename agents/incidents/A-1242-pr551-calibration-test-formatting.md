### A-1242 — 2026-11-28 — ChatGPT — Unformatted calibration test blocked both app CI jobs

- **Agent:** ChatGPT (GPT-6.2, cloud chat)
- **Attribution:** Confirmed self-induced formatting omission in the review correction to PR #551.
- **Evidence:** CI run 46127916227 on 2cd5526b: Windows and macOS both failed the changed-TypeScript Prettier check. Their formatter diff identifies two formatting-only changes in agenda-calibration.test.ts (import wrapping and assertion wrapping); Windows native passed. No new unit test result was obtained.
- **Impact:** Both app jobs stopped before behavioral verification, wasting a CI cycle. No model inference, private data or physical-machine load.
- **Correction:** Apply the exact formatter-produced diff and verify the resulting Git blob against the CI diff's expected blob ID before publishing. Do not change test logic, scorer settings, workflows or bars.
- **Remaining risk:** Exact-head CI must still execute the new tests and register check. The local dependency tree is unavailable. Independent re-review pending; N3–N5 remain held.
