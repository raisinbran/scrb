### A-833 — 2026-11-18 — W2 usage row end snapshot preceded final CI closeout

- **Status / attribution:** Confirmed agent reporting omission; no product defect.
- **What failed:** The committed W2 usage row records the 19:24:35 PT closeout sample (84% five-hour, 62% weekly), but I continued monitoring final-head CI and did not refresh the row before the actual task-end sample at 19:36:21 PT (82% five-hour, 61% weekly).
- **Impact:** The usage row's end sample is earlier than the task's final completion. The final response reports the later observed account readings and their shared-account limitation.
- **Correction / remaining risk:** Preserved the earlier row as a historical snapshot and published a separate correction row with the supported 19:36:21 PT final reading, old-head CI failure, and corrected-head Windows/macOS PASS at `d982aaab` / run `44464161671`. Low.
