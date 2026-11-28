### A-1141 — 2026-11-24 — Claude Code (Sonnet 5.5) / Mac — main install task: usage not read at start

- **Agent:** Claude (Sonnet 5.5, Mac desktop app)
- **What failed:** I did not call `get_usage` before starting the build and install task, against the measure-at-start rule. The end reading shows the 5-hour allowance at 100% used.
- **Impact:** No start figure for this task; the shared 5-hour window was already near its limit after B0 run 2, so the task cost cannot be separated.
- **Correction / remaining risk:** Logged as unavailable. Low.
