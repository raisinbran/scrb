### A-1239 — 2026-11-28 — ChatGPT — unsupported workflow-list lookup

- **Agent:** ChatGPT (GPT-6.2, cloud repository work).
- **Effect:** One unnecessary workflow-list API request for main was rejected by the connected repository interface. No repository mutation or test dispatch resulted.
- **Cause:** Used an unsupported workflow-specific listing endpoint rather than the available commit-specific check endpoint.
- **Correction:** Diagnosed the existing failed Windows job from its recorded steps and log, then inspected current UI/test sources. Did not retry the rejected endpoint.
- **Remaining risk:** The observed 88 px alignment discrepancy matches the responsive sidebar width change, but the proposed test synchronization is not yet verified by fresh Windows CI. The unrelated smoke failure is not attributed to this task or the Gate 8 plan.
- **Accounting:** agents/usage-log/2026-11-28-pr550-smoke-ci-followup.md. A-1239 was absent from main and indexed open PRs when checked; unpublished reservations remain unknown.
