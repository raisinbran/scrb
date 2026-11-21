### A-971 — 2026-11-20 — W10 — Reset timestamp converted to Pacific time incorrectly

- **Status / attribution:** Confirmed W10 reporting error; no code, audio, or application behavior was affected.
- **What failed:** A usage row described the 23:59:26 PT five-hour reset as already past at a 20:20:55 PT observation and marked the end percentage unavailable.
- **Evidence:** The Codex meter returned resetsAt 1795247966 (2026-11-21 07:59:26 UTC = 2026-11-20 23:59:26 PT), usedPercent 4 at the 19:53:28 PT start and 6 at the 20:20:55 PT end.
- **Cause:** The UTC reset timestamp was converted to the wrong local hour.
- **Correction:** Added a new correction row instead of editing the published row in place: five-hour remaining was 96% to 94% in the same window, a 2 percentage-point shared-account decrease; weekly remaining was 49% to 49%.
- **Impact / remaining risk:** A prior usage row has an inaccurate reset interpretation and non-comparable label. This entry and the new correction row identify the accurate values; no technical result changed.
