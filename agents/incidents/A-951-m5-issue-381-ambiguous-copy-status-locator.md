### A-951 — 2026-11-20 — Codex Desktop — Packaged Copy regression used an ambiguous status locator

- **Status / attribution:** Confirmed test-author error; no application change or recording impact.
- **What failed:** The packaged clipboard test selected every `role=status` element, but the app also displays a separate “Models needed” status. Playwright rejected the ambiguous locator before clipboard comparison.
- **Impact:** One failed test attempt.
- **Correction / remaining risk:** Scoped the assertion to the exact “Transcript copied.” message. The packaged app then passed with all 80 invented lines, including the final line. Low.

- **Incident-ID correction (2026-11-20):** Former provisional A-888 was reassigned to A-951 because open PRs #376/#377 independently reserve A-886–A-893 for different Windows events. The original evidence remains in the PR's commit history; the underlying mistake and attribution are unchanged.
