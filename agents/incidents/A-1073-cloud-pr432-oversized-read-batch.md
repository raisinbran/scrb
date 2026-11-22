### A-1073 — 2026-11-22 — Cloud source-read audit — oversized read-only GitHub tool batch

- **Observed failure:** An inventory read submitted the full current-open-PR changed-file sweep plus main tree and search calls in a single orchestration invocation; the tool returned "Code Mode exceeded the maximum number of tool calls."
- **Cause / attribution:** The reviewer batched more connector calls into one request than the connector orchestration limit permits; this is a confirmed source-audit tooling mistake, not a repository or Windows failure.
- **Effect:** One aborted read-only aggregation before source changes, with no Git mutation, owner device access, GUI invocation, production-data read, CI dispatch or test execution.
- **Correction:** Reissued the necessary checks in smaller bounded groups, inspected the main incident tree and the open-PR incident filenames, and used searchable issue references to assess A-1071/A-1072 availability. No completed expensive test was repeated.
- **Remaining risk:** Unpublished machine-local incident reservations were not accessible and cannot be claimed globally clear.
