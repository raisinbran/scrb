### A-1042 — 2026-11-21 — Cloud PR #402 restack inspection exceeded the connector batch limit

- **Status / attribution:** Confirmed self-induced read-only orchestration error, not an application or CI defect.
- **Observed failure:** An initial Code Mode inspection attempted to retrieve 26 old child-commit file inventories within one invocation. The tool stopped with "Code Mode exceeded the maximum number of tool calls" after the first 18 read calls succeeded.
- **Effect:** One avoidable rejected continuation of a read-only batch; no code file, Git ref, installer, private data, CI run, or recording was altered by that error. Exclusive account usage cannot be measured.
- **Correction:** Read the remaining eight commits separately, preserved all 26 original SHA/file inventories, and reconstructed the restack on a separate staging branch. Did not repeat any successful commit-file retrieval unnecessarily.
- **Prevention:** Limit future connected-tool batches to ten calls or fewer per invocation; distinguish a connector-budget error from a product failure.
- **Remaining risk:** None from this inspection error. The actual restack and its independent CI/review gates are recorded separately on PR #402.
- **Accounting checkpoint:** 11/21/2026, 22:27:26 PT; quota balances unavailable on the current cloud conversation surface.
