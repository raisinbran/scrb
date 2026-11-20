### A-909 — 2026-11-20 — Cloud incident-audit PR-file list exceeded per-call execution limit

- **Classification:** Confirmed tool-orchestration sizing error, not repository or CI failure.
- **What failed:** Attempted a single Code Mode execution covering approximately 30 per-PR file-list calls grouped into promises; execution rejected the batch with a maximum tool calls error.
- **Impact:** No reliable audit result returned from that attempt and no file or GitHub state was modified. The batch was not treated as evidence of a successful scan.
- **Correction / prevention:** Audit open PR changed-file lists in three separately bounded groups (12, 12 and 6 calls) plus inspect `main` and coordination branch incident directories. The bounded calls succeeded and established that provisional Mac IDs A-905–A-907 were absent from the public GitHub sources checked; physically local reservations still need original-source confirmation.
- **Publication:** Cloud coordination branch only, unreviewed, not `main`. Identifier provisionally reserved from the current public registry; local conflicts not ruled out.
