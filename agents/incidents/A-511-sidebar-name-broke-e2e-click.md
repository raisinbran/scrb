### A-511 — 2026-11-15 — Claude Code (Sonnet 5.5) / Mac desktop — sidebar label change broke exact-name e2e clicks
- **Status / attribution:** Confirmed agent error. Fixed on the same PR. No product defect shipped.
- **What failed:** A hidden "Processing a recording" label added inside the Recordings button changed its accessible name whenever a mock meeting was in its final pass, so five Playwright tests that click `name: 'Recordings', exact: true` timed out on both platforms.
- **Impact:** PR 286 failed `test:smoke` in CI; one extra commit. Smoke was not run locally because of the owner's quiet-mode request for the Mac recording test.
- **Source evidence:** CI run 43695577955, "waiting for getByRole('button', { name: 'Recordings', exact: true })".
- **Correction / remaining risk:** The text is now a description (`aria-describedby`), not part of the name. Low. Search e2e specs for exact button names before changing a button's content.
