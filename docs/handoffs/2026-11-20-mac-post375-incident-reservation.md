# Mac M5 post-#375 incident and usage reconciliation — November 20, 2026

## Purpose

This **separate reporting branch** preserves the exact-head independently reviewed Mac build documentation in [PR #375](https://github.com/raisinbran/scrb/pull/375) at `aadebd526001a56181636ac589bff2993b44c589`. It does not modify the Scribe application, the original Mac build candidate, or PR #375. The branch is based on the unchanged frozen candidate source `73e899d0a45234617b9fbc81cf8f599747ec652b`.

The Mac agent has now transferred **the original three previously unpublished incident accounts**, its prior task's corrected 12-column usage row, the separate transfer-task usage row, and the additional transfer-task incident, directly to this branch. The source transfer was verified against branch commit `9f52b29f109e2df7d99a0f983b9a02a699bc3be9`.

## Incident identity and publication status

| Source-local identifier | Unique staging identifier | Explanation |
|---|---|---|
| A-883 (historically A-881) | A-905 | Invalid CI retry approval-prompt argument; A-881→A-883→A-905 chain preserved in A-906 |
| A-884 | A-906 | Local incident identifier collision with updated W10 reservations |
| A-885 | A-907 | Draft usage count overstated rejected tool calls |
| Newly observed on transfer task | A-908 | Transfer task's start time and initial quotas not captured; deliberately left unavailable |

The Mac agent confirmed from its local reservation inventory that A-905–A-907 were unused before transfer. Cloud review checked `main`, the open PR file lists, and the cloud coordination branch for A-905–A-908 collisions. W10 [PR #376](https://github.com/raisinbran/scrb/pull/376) owns different A-881–A-890 incidents, and Mac PR #375 owns A-875–A-880. A distinct earlier cloud event was temporarily called A-908 but has now been **renumbered A-910 in the separate unreviewed coordination branch**, with its task usage reference corrected. It is not the Mac's missing-start event.

Original incident text, the owner-observed timestamps, five-hour/weekly allowance readings, unavailable start-field explanations, and the separate task accounting were retained. The Nov 20 rows correctly leave **exact model variant and effort unavailable**; the owner's assumption for older Nov 15–19 Codex sessions was not applied retrospectively to Nov 20. Shared-account changes are not attributed solely to the task.

## Evidence and safeguards

- `agents/incidents/A-905-mac-retry-approval-prompt-schema.md`
- `agents/incidents/A-906-mac-local-incident-id-collided-with-w10.md`
- `agents/incidents/A-907-mac-usage-row-overcounted-rejected-calls.md`
- `agents/incidents/A-908-mac-post375-branch-transfer-missing-start-reading.md`
- `agents/usage-log/2026-11-20-mac-pr375-incident-reconciliation.md`
- `agents/usage-log/2026-11-20-mac-post375-branch-transfer.md`

Both usage entries retain 12 columns. The transfer-task row has an **unrecoverable start timestamp and starting quota readings**, a precise end at 09:08:59 PT, and end-observed five-hour 98%, weekly 55%; no start-to-end consumption or reset crossing is inferred. Original PR #375 CI and formal review are not reused as CI/review of this follow-on PR.

## Merge and validation gates

This is documentation/accounting-only work. After publishing as a **separate draft PR**, require its own exact-head Windows/macOS CI and an independent formal review after the checks pass; keep the PR draft/unmerged pending explicit owner merge authorization. Do not change or rebuild the Scribe source, package, audio, installed app or private user library merely to resolve reporting. Do not request more manual owner shell work.
