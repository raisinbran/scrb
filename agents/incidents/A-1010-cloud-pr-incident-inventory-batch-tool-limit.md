### A-1010 — 2026-11-20 — Cloud — Oversized GitHub incident inventory batch rejected by connector orchestration

- **Status/attribution:** Confirmed self-induced read-only orchestration error, corrected in the same task.
- **What happened:** A single Code Mode script attempted 40 parallel GitHub changed-filename reads for the open-PR incident collision audit. The orchestration layer rejected it with "Code Mode exceeded the maximum number of tool calls."
- **Impact:** No branch, source, PR or CI state was changed by the failed call; it consumed one avoidable attempt and prevented that first batch from returning evidence. No private local incident contents were requested.
- **Correction:** Repeated the audit in bounded 12-PR batches, then the final four, covering all 40 open PRs. These batches identified the A-978 collision between PR #350 and PR #401; the proposed unpublished M5/W10 renumbering can be assessed only with a subsequent fresh host check.
- **Preventive step:** Keep composite connector fanout below supported per-script limits and emit concise aggregates. Do not claim a rejected batch completed successfully.
- **Publication/remaining uncertainty:** This record is on the separate draft accounting branch. The A-1010 number was checked against current main/open-PR public incident inventories and reported M5/W10 draft ranges; unpublished reservations from other sessions remain unknown and require recheck before merge.
