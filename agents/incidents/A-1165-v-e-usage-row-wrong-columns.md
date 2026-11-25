### A-1165 — 2026-11-25 — Mac — V-e usage row written in the wrong columns

- **Agent:** Claude
- **Attribution:** Confirmed self-induced. The row `agents/usage-log/2026-11-25-v-e-drift-diagnosis.md` was modelled on the newest per-file row instead of the header in `agents/usage-log.md`, so the cells held quota text and UTC times in the wrong columns.
- **Evidence:** Independent review at aaca4490 rejected the row; the header has PT start and end times, "a% -> b%" for 5h and week left, and a decrease column.
- **Impact:** One review round; no data lost.
- **Correction:** Row rewritten to the header's columns (PT times, 67% -> 54%, 50% -> 48%, 13 / 2).
- **Remaining risk:** Low; copy the column order from the header, not from an earlier row.
