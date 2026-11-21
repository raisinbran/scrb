### A-934 — 2026-11-20 — W10 — PR result was not stored after successful creation

- **Status / attribution:** Confirmed agent orchestration error; PR #392 was successfully created.
- **What failed:** The follow-up script attempted to store a PR number at a nested response field that the connector does not return; its `store` call rejected the resulting undefined value.
- **Impact:** The wrapper reported failure after the external PR creation had succeeded, briefly obscuring the successful result.
- **Correction / remaining risk:** Verified the returned PR number and URL directly from the connector response. No duplicate PR or retry was created. Low.
