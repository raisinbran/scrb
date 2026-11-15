### A-398 — 2026-11-14 — Claude Code (Sonnet 5.5) / Windows desktop (REGIURN) — launch-check script ignored the first-run dialog
- **Status / attribution:** Confirmed agent error in a throwaway test script; no application defect.
- **What failed:** My Playwright script clicked the nav buttons on a fresh profile without handling the first-run location dialog, whose backdrop intercepted clicks. Two runs timed out at 30 s before I set the location through the bridge as `packaged.spec.ts` already does. I had read the spec but not applied that step.
- **Impact:** Two wasted launches, about two minutes. No product code or evidence affected.
- **Correction / remaining risk:** Script now sets the location first. None.
