### A-597 — Workflow-run query used an unverified commit SHA

- **Status / attribution:** Confirmed agent tool-call error; no repository effect.
- **What failed:** The first workflow-run query used an incomplete guessed SHA and returned an empty run list. The current local HEAD was then read and the query using the exact SHA found the queued CI run.
- **Agent-controlled cause:** I queried before verifying the newly pushed commit SHA.
- **Impact:** One misleading empty read-only result and one extra tool call; no GitHub state changed.
- **Evidence:** Local `git rev-parse HEAD` and the successful workflow-run query for `f4ab2a048597bb98090ff60310790785b7d1ded6`.
- **Correction / prevention:** Resolve exact `HEAD` before querying commit-associated workflow runs.
