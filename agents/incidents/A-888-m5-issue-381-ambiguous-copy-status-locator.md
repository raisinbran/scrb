### A-888 — 2026-11-20 — Codex Desktop — Packaged Copy regression used an ambiguous status locator

- **Status / attribution:** Confirmed test-author error; no application change or recording impact.
- **What failed:** The packaged clipboard test selected every `role=status` element, but the app also displays a separate “Models needed” status. Playwright rejected the ambiguous locator before clipboard comparison.
- **Impact:** One failed test attempt.
- **Correction / remaining risk:** Scoped the assertion to the exact “Transcript copied.” message. The packaged app then passed with all 80 invented lines, including the final line. Low.
