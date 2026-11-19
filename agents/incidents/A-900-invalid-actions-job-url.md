### A-900 — 2026-11-19 — Unsupported GitHub Actions job URL requested during CI diagnosis

- **Classification:** Self-induced read-only tool-call error, not a Scribe application, test or GitHub Actions runner defect.
- **Event:** To inspect why Mac job `135719507651` was cancelled before any step, the coordinator passed `https://api.github.com/repos/raisinbran/scrb/actions/jobs/135719507651` to the generic GitHub `fetch` action. That action rejected the unsupported URL with `INVALID_ARGUMENT` / HTTP 400 before performing the read.
- **Impact:** One unnecessary failed connector call; no repository mutation, code change, device execution, CI rerun or data exposure. Quota impact cannot be isolated.
- **Correction:** Stopped probing unsupported API routes, used the supported `fetch_workflow_run_jobs` and `fetch_workflow_job_logs` actions. The canceled job had zero steps and no accessible log blob; this is insufficient to prove its root cause. One separately documented and scope-limited Mac-only retry at unchanged #371 head succeeded. Do not attribute the original cancellation to the bad URL.
- **Evidence:** PR #371 [CI recovery checkpoint](https://github.com/raisinbran/scrb/pull/371#issuecomment-7016421322), successful [CI run 44569261618](https://github.com/raisinbran/scrb/actions/runs/44569261618), and `agents/usage-log/2026-11-19-pr370-371-ci-recovery.md`.
- **Publication:** Provisional coordinator work branch only, not main. Identifier checked against public main and visible open PR files; unpublished local reservations remain unknown. Reconcile before any reviewed merge via issue #358.

- **Collision reconciliation:** Originally reserved as A-854 on this unmerged coordinator branch; renumbered provisionally to A-900 after W10 machine locally reserved A-854 for a different incident. Preserve Git history and do not overwrite machine evidence. Verify unpublished local reservations before a reviewed merge.
