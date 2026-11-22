### A-1094 — 2026-11-22 — independent PR review — unsupported workflow-run collection lookup

- **Event / attribution:** While auditing PRs #445 and #446, a review-side GitHub read used a workflow-file run-collection URL through the generic fetch action. The connector rejected that URL with an INVALID_ARGUMENT / 400 unsupported-endpoint error. The collection path had not been checked against that action's supported URL forms before use.
- **Impact:** One unnecessary rejected read and minor review delay. No repository mutation, GitHub Actions workflow dispatch, rerun, CI job, uploaded artifact, owner device, application, or user audio was affected.
- **Correction:** Continued with the supported exact-run API and verified existing issue comments, PR heads, CI jobs, workflow source, and prior run-artifact inventory. Did not retry the disallowed collection URL.
- **Prevention:** Inspect connector action URL constraints first, and prefer authorized exact-run lookups or named workflow-run actions when collection endpoints are not supported. Do not confuse inability to query a run collection with proof that no new run exists.
- **Incident ID:** A-1094 was not found by default-branch code search and did not appear in inspected contemporary #442–#447 PR incident filenames; unenumerated private reservations were not independently validated.
