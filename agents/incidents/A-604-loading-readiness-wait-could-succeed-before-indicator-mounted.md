### A-604 — 2026-11-16 — Codex / Mac desktop — loading-readiness wait could pass before indicator mounted

- **Status / attribution:** Confirmed test reliability gap identified by independent review; no production defect.
- **What failed:** The Electron probe waited only for the transcript loading status to detach. That wait can succeed immediately if the status has not mounted yet, allowing timed jumps to begin while later transcript pages are unavailable.
- **Agent-controlled cause:** I assumed the status was already attached after the Transcript tab became visible, without asserting its lifecycle.
- **Impact:** The acceptance probe could be flaky or exercise an incomplete transcript. The independent reviewer identified the gap before any review approval.
- **Evidence:** Read-only review of PR #332 at `95e6d541b1a812589a8d866bd6ae1cbedb6a007d`.
- **Correction / prevention:** Wait for the loading status to attach and then detach before timing; local TypeScript, ESLint, Prettier, and diff checks passed. Exact-head CI is needed to confirm.
