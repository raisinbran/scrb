### A-887 — 2026-11-20 — W10 — read-only review assignment omitted its required usage row

- **Status / attribution:** Confirmed task-instruction/reporting error by the coordinating agent; no application defect.
- **What failed:** The independent reviewer was explicitly told not to edit files. The coordinator did not separately arrange the required one-row accounting record for that read-only review, despite the project rule requiring a usage row for every assigned task.
- **Impact:** The review completed with its accounting only in its final message; the required repository usage row was not initially created or published.
- **Correction / remaining risk:** The coordinator created a one-row review record from the reviewer-reported start/end readings and included it in the authorized PR correction. Reporting remains incomplete until the correction passes CI and receives independent review.
- **Publication:** Included in PR #376's current reporting-correction commit; unmerged.

