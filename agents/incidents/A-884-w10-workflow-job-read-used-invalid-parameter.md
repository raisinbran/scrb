### A-884 — 2026-11-20 — W10 — workflow-job read used an invalid tool parameter

- **Status / attribution:** Confirmed tool-call argument error; no repository or GitHub state changed.
- **What failed:** A GitHub Actions job-status read used `repository_full_name`, while that tool requires `repo_full_name`. The connector rejected the call before reading the job.
- **Impact:** One failed status lookup and a brief delay; no rerun, workflow mutation, or data change.
- **Correction / remaining risk:** Read the tool schema and repeated the read with `repo_full_name`; the Windows job log exposed the actual failure. Low.
- **Publication:** Included in the W10 smoke-test correction PR; local and unpublished until that PR update is reviewed and merged.

