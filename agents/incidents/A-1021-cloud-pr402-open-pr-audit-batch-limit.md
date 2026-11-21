### A-1021 — 2026-11-21 — cloud GitHub — overlarge all-open-PR incident audit request rejected

- **Failure and attribution:** A Code Mode invocation tried to retrieve all open PR changed-file lists in a single parallel tool call while reconciling the incident register. The orchestration layer rejected the batch with "Code Mode exceeded the maximum number of tool calls." This was preventable request sizing, not a GitHub repository error.
- **Observed effect:** One rejected read-only audit expression; no Git data, PRs, workflows, models, recordings, CI or host state was mutated. The attempt consumed an additional tool invocation; exact quota cost is unavailable.
- **Correction:** Queried the open PR list and main incident inventory first, then fetched PR filenames in bounded batches. The completed scan found A-1018 on #403 and A-1016/A-1017 on #402; at the observed snapshot A-1019/A-1020/A-1021 were not assigned to different published events.
- **Prevention:** Partition broad repository fan-out into small, bounded tool calls, preserving partial results and avoiding automatic full repeats.
- **Remaining risk:** Newly disclosed unpublished local reservations may conflict before merge; recheck before publication. No incorrect repository outcome was claimed from the rejected call.
