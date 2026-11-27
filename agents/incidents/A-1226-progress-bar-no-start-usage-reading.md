### A-1226 — 2026-11-27 — progress bar task: usage meter not read at task start

- **Status/attribution:** Confirmed minor self-induced omission, same kind as A-1204.
- **What happened:** The usage meter was first read after the code and tests were done, so start percentages are unavailable.
- **Impact:** The usage row has `unavailable` start figures; the task cost cannot be measured.
- **Correction:** End readings recorded as read. Start figures not invented.
- **Preventive step:** Read `get_usage` in the first tool batch.
