### A-531 — 2026-11-15 — Codex / GPT-6 series / Mac desktop — unused rate property in regression callback

- **Status / attribution:** Confirmed author test-code error; no production defect.
- **What failed:** Independent review identified that the parameterized test callback destructured `rate` for its title interpolation even though Vitest obtains `$rate` from the case object. ESLint therefore reports an unused variable. The callback body also needed indentation correction.
- **Impact:** The issue would fail lint and exact-head CI if left in place. It was found before commit, push, or PR creation; the rate-aware verifier logic and acceptance behavior were unaffected.
- **Correction / remaining risk:** Remove `rate` from the callback destructuring, correct indentation, and rerun focused tests, ESLint on both changed source files, and the register check. Low.
