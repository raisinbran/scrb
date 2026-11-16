### A-596 — Combined-status query used the wrong parameter name

- **Status / attribution:** Confirmed agent tool-call error; no repository effect.
- **What failed:** The first GitHub combined-status query supplied `ref` where the connector requires `commit_sha`; schema validation rejected the read-only call.
- **Agent-controlled cause:** The connector schema was not inspected before the first query.
- **Impact:** One failed read-only call; no external state changed.
- **Evidence:** Tool schema error and subsequent successful query using the exact commit SHA.
- **Correction / prevention:** Inspect the connected-tool schema before calling it; corrected the query and received an empty status while CI started.
