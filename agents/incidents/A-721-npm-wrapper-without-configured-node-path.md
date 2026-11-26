### A-721 — 2026-11-17 — Codex / Mac — npm wrapper invoked without configured Node path
- **Status / attribution:** Confirmed agent error; no product defect.
- **What failed:** A read-only environment probe invoked the configured `npm` wrapper by absolute path without adding its sibling Node directory to `PATH`; the wrapper's `env node` shebang could not resolve Node.
- **Impact:** One failed version probe; no install or application command ran.
- **Correction / remaining risk:** Added the configured Node directory to `PATH`; Node 22.23.4 and npm 10.9.9 resolved. Low.
