### A-1065 — 2026-11-22 — Documentation rejection inventory exceeded connector batch limit

- **Status and attribution:** Confirmed self-induced cloud tool orchestration error during the separate PR #415/#417/#421/#409 documentation correction task; not an app, GitHub PR, CI or runner defect.
- **Observed failure:** An initial GitHub connector batch attempted 21 parallel PR metadata/file/review calls and was rejected with `Code Mode exceeded the maximum number of tool calls`. No repository files or PR states were changed by that unsuccessful read batch.
- **Effect:** One unnecessary read-only tool request and avoidable analysis overhead. Task-specific time/credits are not measurable from this client; no exact cost is claimed.
- **Correction:** Resumed the same inventory with bounded batches of three or fewer PR metadata/review calls, followed by focused file reads. Completed docs-only corrections without duplicating previous code reviews or app tests. No repeated unsupported large-batch call.
- **Prevention:** Keep connector orchestration within the available call ceiling; inspect a small response first and then fetch only missing, task-relevant files or review bodies.
- **Publication/reconciliation:** A-1065 absent from the current main incident inventory and all 46 then-open PR changed-file inventories checked. Unpublished local reservations cannot be certified clear; reconcile a distinct later-discovered event through issue #358.
