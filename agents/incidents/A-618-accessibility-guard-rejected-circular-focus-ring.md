### A-618 — 2026-11-16 — Codex / model variant and effort unavailable / Mac desktop — accessibility guard rejected circular focus ring

- The first exact-head Windows CI run rejected the scoped `.info:focus-visible { outline: none }` rule in `accessibility.test.tsx`, whose guard allowed only the existing heading exception. The new circular `box-shadow` preserves a visible focus indicator, but the guard had not been updated to recognize it.
- Narrowed the exception to `.info:focus-visible` only when the same rule declares the focus-token circular shadow. The focused accessibility suite passes 4/4 tests.
- Remaining risk: the corrected guard and info-button regression await exact-head Mac/Windows CI and independent review.
