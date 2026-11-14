### A-360 — 2026-11-14 — Codex — PR attachment call omitted required artifact type

- **Status / attribution:** Confirmed agent error; no application defect.
- **What failed:** My first pull-request attachment call supplied the URL but omitted the required `artifact_type` argument, so the call returned an input error.
- **Impact:** One failed tool call; the draft PR was open and unchanged.
- **Correction / remaining risk:** Read the tool schema and attached the pull request successfully with `artifact_type: pull_request`. None.
