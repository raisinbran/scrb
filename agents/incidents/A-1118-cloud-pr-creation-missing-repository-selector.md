### A-1118 — 2026-11-23 — ChatGPT cloud GitHub — rejected draft-PR creation argument

- **Observed failure:** The first attempt to create the owner-requested M1/V1 productivity handoff draft PR omitted the required repository_full_name field. The connector rejected it during schema validation with a required-property error.
- **Evidence:** The rejected tool call occurred immediately after handoff commit b4fe952017faf1fb028d2790c76cb26b156acb93 on branch rosmont/m1-v1-productivity-handoff-20261123. File verification had already succeeded; **no PR was created by the rejected attempt**.
- **Attribution:** Self-induced incorrect tool argument; not a repository defect, owner-host limitation or GH permission error.
- **Impact:** One rejected write request and avoidable delay; no code, private-data, CI, branch or other repository mutation from the rejected operation.
- **Correction:** Inspect the action's required schema and pass repository_full_name explicitly on the next draft-PR submission. Do not repeat the full research, rebase or recreate the committed file.
- **Residual risk:** Any later GitHub operation needs its own required-field check; no downstream data-integrity issue is known.
