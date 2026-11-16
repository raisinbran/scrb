### A-564 — 2026-11-16 — Codex / model and effort unavailable / Mac desktop — PopupBanner className prop type

- **Status / attribution:** Confirmed implementation typing error; no runtime defect.
- **What failed:** The full check found that `styles.processingBanner` is typed `string | undefined`, while the new optional `PopupBanner.className` prop accepted only `string` under `exactOptionalPropertyTypes`.
- **Impact:** `npm run check` stopped during desktop typechecking before lint or tests.
- **Correction / remaining risk:** The prop now explicitly permits `undefined`; the escalated full check passed typechecking, lint, 2,046 tests, boundary check, and register check. Low.
