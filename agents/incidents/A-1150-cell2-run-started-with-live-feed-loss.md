### A-1150 — 2026-11-24 — Claude Code (Sonnet 5.5) / Mac — final RC cell 2: measured run started although exploration showed live-feed loss

- **Agent:** Claude (Sonnet 5.5, Mac desktop app)
- **What failed:** Two exploratory Playwright launches already showed an empty meeting meter and large `inputLostFrames` in the log; I did not check those counters before the one approved measured run. The run then lost about 80% of live input frames, so cell 2 is NOT VERIFIED.
- **Impact:** The single approved cell 2 run produced no valid measurement; about 8 minutes of the 35-minute budget.
- **Correction / remaining risk:** Reported as setup-invalid, not a product FAIL. Cause of the frame loss under Playwright launch not found; a valid cell 2 needs a new owner-approved run.
