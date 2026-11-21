### A-939 — 2026-11-20 — W10 — Parallel review used an already reserved incident ID

- **Status / attribution:** Confirmed reporting coordination error; no existing record or GitHub branch was overwritten.
- **What failed:** I allocated A-937 to a local review-finding record after the independent reviewer had already reserved that ID in draft PR #393 for a separate review-task incident.
- **Impact:** The local incident draft could not be published with its original number without colliding with #393.
- **Correction / remaining risk:** Retained the reviewer's A-937 and renumbered this event to A-938 after verifying the new ID was unused. Both PRs remain separate. Low.

