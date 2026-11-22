### A-1079 — 2026-11-22 — Cloud GitHub inventory — oversized PR incident-read batch

- **Observed failure:** An attempt to examine all currently open PR incident filenames in one source-inspection orchestration returned `Code Mode exceeded the maximum number of tool calls`.
- **Attribution / cause:** Confirmed agent-caused read-only batching error. The attempted number of connected GitHub calls exceeded the orchestration tool's permitted batch size; it was not an SCRB or CI failure.
- **Effect:** One aborted inventory invocation before any Git write, workflow dispatch, product change, host-device operation or private-data access.
- **Correction:** Repeated only the incomplete read-only inventory, partitioned into four bounded groups; independently checked the current main incident tree and searched issue references. A-1078 was absent from the accessible published inventory; unpublished reservations were not globally attested clear.
- **Prevention:** Keep connector batches within demonstrated call limits. Reuse completed source evidence; never repeat a passing long test to handle an inventory-tool limit.
- **Remaining risk:** Machine-local or otherwise unpublished incident reservations are inaccessible; final merge must recheck newly published IDs.
