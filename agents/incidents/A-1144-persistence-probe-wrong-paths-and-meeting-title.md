### A-1144 — 2026-11-24 — Claude Code — Persistence probe failed three times on avoidable setup errors

- **Agent:** Claude Code (Sonnet 5.5).
- **Attribution:** Confirmed self-induced. I used `timeout` (not on macOS), wrote the Playwright script to a scratchpad path of another session, and looked for the meeting by a title that the app does not show (the list shows "20261124 Meeting" with a time, not the folder name).
- **Evidence:** `timeout: command not found`, `MODULE_NOT_FOUND` for the script, and a 30 s locator timeout.
- **Impact:** Three wasted launches of the isolated app inside the bounded attempt; no owner time and no change to the owner library.
- **Correction:** Used the session scratchpad, no `timeout`, and selected the meeting by its listed time.
- **Remaining risk:** None for the evidence; the result was read from the final run only.
