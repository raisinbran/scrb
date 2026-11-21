### A-863 — 2026-11-19 — W10 — GitHub issue-comment query returned an unfiltered oversized result

- **Status / attribution:** Confirmed avoidable query-output error during W10 accounting reconciliation; no repository or GitHub state changed.
- **What failed:** A combined fetch of issue #358 and #340 comments was serialized before filtering, producing a very large output that was truncated. The requested collision and instruction evidence was still retrieved, but most of the returned comment bodies were unnecessary for the immediate check.
- **Impact:** Extra output and avoidable usage; no CI retry, code change, publication, installation, or recording resulted from the query.
- **Correction / remaining risk:** Reused the already identified comment evidence and switched to compact ID/path filters. Low.
- **Publication:** This incident and its task row are included in the separate W10 accounting draft PR branch; not on `main` pending exact-head CI and independent review.
