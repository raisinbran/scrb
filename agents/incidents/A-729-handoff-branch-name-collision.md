### A-729 — 2026-11-17 — ChatGPT Chat — Handoff branch-name collision caused avoidable failed API request

- **Observed effect:** The initial `create_branch` attempt for `rosmont/planner-m1-v1-handoff-20261117` failed with HTTP 422, `Reference already exists`. This spent an unnecessary tool call while preparing the November 17 handoff.
- **Cause and attribution:** The author selected a plausible branch name without checking its existing ref first; the mistake was in the handoff authoring workflow, not SRCB product code or local device permissions.
- **Correction:** Verified that the existing ref pointed to `aea9432e`, left it untouched, and created a uniquely named new branch `rosmont/m1-v1-handoff-20261117-0115-pt`. No work or files were overwritten.
- **Remaining risk:** No product-code effect. Before merger, independently check that A-729 is still unique across `main`, active PRs and unpublished local evidence.
- **Evidence:** GitHub `create_branch` returned `422 Reference already exists`; verified `refs/heads/rosmont/planner-m1-v1-handoff-20261117` existed, then branch creation succeeded for the distinct handoff name.
