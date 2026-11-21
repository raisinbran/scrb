### A-1011 — 2026-11-21 — Cloud — Overlarge parallel GitHub read batch during approved-PR merge audit

- **Attribution:** Confirmed self-induced tooling error in this cloud GitHub task, not an application defect.
- **Failure:** Two read-only GitHub review/CI inventory scripts requested more connector calls per Code Mode execution than the orchestration limit; the service returned "Code Mode exceeded the maximum number of tool calls." First calls had partially emitted results, but the failing execution was not treated as a completed audit.
- **Correction:** Re-ran in smaller groups and verified PR heads, formal exact-head review, CI and mergeability before any write. Merged only #394, #397, #398 and #399, each with squash and an expected-head SHA lease; all four GitHub merge results confirmed success.
- **Impact:** Avoidable inspection/tool overhead; no lost files, failed source build or incorrect merge was established. No unauthorized physical device use or private audio exposure.
- **Prevention:** Bound per-script parallel connector calls; re-query GitHub's fresh REST mergeability when the normalized PR snapshot is stale or a mergeability recalculation is pending. Never override GitHub merge guards on unknown state.
- **Scope / publication:** Draft PR #396 accounting branch, not yet main. A-1011 checked against known cloud public reservations and prior M5/W10 provisional map (A-992–A-1009); cross-host unpublished reservations still require a fresh check before publication.
