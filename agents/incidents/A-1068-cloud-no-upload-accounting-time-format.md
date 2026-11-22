### A-1068 — 2026-11-22 — cloud #419 single-runner source — timestamp formatter omitted clock fields

- **Observed error:** The first new task-usage row was published with a malformed end/checkpoint timestamp (`11/22/2026, 49 PT`) instead of an hour/minute/second reading.
- **Cause:** The reporting date formatter selected year/month/day/seconds but omitted hour and minute. It displayed seconds alone and incorrectly looked like a time.
- **Effect:** One incorrect initial accounting checkpoint (no engineering operation, test result, model input, installer action or user data affected).
- **Correction:** Read the actual current timestamp in America/Los_Angeles with explicit hour/minute/second fields, 02:54:57 PT, and amended the same row without changing its original 02:49 task-receipt observation.
- **Remaining risk:** Later task-end time and plan quota meters remain unavailable; the row remains a checkpoint and should not be treated as final accounting.
