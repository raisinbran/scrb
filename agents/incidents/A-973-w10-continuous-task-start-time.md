### A-973 — 2026-11-20 — W10 — Continuous task start time was reported as a short follow-up

- **Status / attribution:** Confirmed W10 accounting error; no application code or test evidence changed.
- **What failed:** I treated the final CI check as a separate short task and reported a 20:42 PT start. The user confirmed this was continuous work on the single W10 assignment, which began at 16:09 PT; the existing task row records 16:09:37 PT.
- **Impact:** The published usage row materially understated the task duration and gave an incorrect start time.
- **Correction / remaining risk:** Left the original row intact and added a correction row with the original 16:09:37 PT start and the later final-accounting checkpoint. The five-hour readings cross the 18:58:34 PT reset and are not comparable; weekly remaining changed from 52% to 48%. Low after correction.
