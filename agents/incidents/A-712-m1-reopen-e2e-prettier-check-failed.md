### A-712 — 2026-11-16 — Cloud GitHub implementation — M1 restart E2E formatting failed exact-head CI

- **Severity/status/attribution:** Low; confirmed self-induced formatting mistake in the new regression test, not an application defect.
- **Observed failure:** On PR #345 head `f7d1c838`, macOS CI run [44027735360](https://github.com/raisinbran/scrb/actions/runs/44027735360) failed `Check Prettier on changed TypeScript` before typecheck or E2E execution. The changed `openMeeting` destructuring needed the multiline wrapping shown in the CI formatter diff.
- **Impact:** One failed CI job and a required corrective commit/new-head CI; no application behavior, private recordings or data were affected. Windows results for that earlier head do not qualify for the corrected head.
- **Correction:** Apply the exact Prettier-produced replacement to the test declaration, preserving its behavior. Recheck both platform CI jobs at the new commit before independent review.
- **Remaining risk:** Test execution and final acceptance remain pending until exact-head CI passes; no local Electron run was available.
