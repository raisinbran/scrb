### A-1175 — 2026-11-25 — Claude Code (Sonnet 5.5) — V-b0 usage row misreported deltas and start time

- **Effect:** the PR #498 usage row recorded allowance deltas "5 / 9" (those were the 5-hour used-percent readings) instead of remaining-percentage changes 4 / 1, and gave a start time of 09:40 PST that was not read from a clock.
- **Evidence:** get_usage at start (5% / 54% used) and end (9% / 55% used); independent review of head fedf6b50 flagged the mismatch.
- **Agent:** Claude
- **Attribution:** Claude Code, self-induced (row written hastily, time estimated from a test log).
- **Correction:** row rewritten with 4 / 1 and "unavailable — start clock was not captured".
- **Remaining risk:** none beyond account-wide delta ambiguity already noted.
