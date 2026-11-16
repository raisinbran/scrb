### A-618 — 2026-11-16 — Codex / model variant and effort unavailable / Mac desktop — accessibility guard rejected circular focus ring

- The first exact-head Windows CI run rejected the scoped `.info:focus-visible { outline: none }` rule in `accessibility.test.tsx`, whose guard allowed only the existing heading exception. The new circular `box-shadow` preserves a visible focus indicator, but the guard had not been updated to recognize it.
- Narrowed the exception to `.info:focus-visible` only when the same rule declares the focus-token circular shadow. The focused accessibility suite passes 4/4 tests.
- The corrected guard and info-button regression passed exact-head Mac/Windows CI run 43968324993 on `d80e01f7f717d5b92dafae4d5f136d9967ac4532`; independent re-review found no actionable issues. The pending-status wording in this incident entry was corrected in A-619.
