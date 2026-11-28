### A-1227 — 2026-11-27 — Claude — V-b1: usage meter not read at task start

- **Agent:** Claude (Sonnet 5.5, Windows desktop)
- **Status/attribution:** Confirmed minor self-induced omission, repeat of A-1204 and A-1226.
- **What happened:** The usage meter was first read about an hour into the task, after the filter, wrapper and synthetic runs were done.
- **Impact:** The usage row has `unavailable` start figures; the task cost cannot be measured.
- **Correction:** End readings recorded as read. Start figures not invented.
- **Preventive step:** Read `get_usage` in the first tool batch.
