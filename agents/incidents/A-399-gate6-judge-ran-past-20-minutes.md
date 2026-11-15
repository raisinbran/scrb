### A-399 — 2026-11-14 — Claude Code (Sonnet 5.5) / Mac desktop — Gate 6 judged-precision run reached 21 minutes before I checked the pace
- **Status / attribution:** Confirmed agent error (planning); no application defect.
- **What failed:** The task said the judge needs about 10 minutes and the approval was 20. I started all three meetings in one process that prints only after each meeting, without measuring the per-item rate first, then waited on a 20-minute monitor. When I looked at 21.3 minutes the third meeting was still running, so the run could not finish inside the approval.
- **Impact:** About one minute over the approved window before I paused it (SIGSTOP) and asked; the owner then approved 12 more minutes. Total about 24 minutes.
- **Correction / remaining risk:** Paused, not killed, so no work was lost. Future long runs should print progress per item or run one meeting per process, and I should check the rate after the first few minutes.
