### A-1119 — 2026-11-23 — ChatGPT cloud GitHub — task-start quota checkpoint unavailable

- **Observed failure:** The handoff research began without a supported provider usage/remaining-allowance read at the task-start checkpoint. This cloud chat client does not expose an account five-hour/weekly usage meter, reset-time readout, or per-turn effort metadata through the available tools. No later values can establish an earlier balance.
- **Attribution:** Procedural start-check omission is self-induced; continuing lack of quota data is an environment limitation. Do not infer percentage use or a cost difference from GitHub API activity.
- **Impact:** The required task usage row cannot supply measured start/end 5-hour or weekly percentages or a quota delta. The PT task-start minute comes from session context, not a per-agent quota observation.
- **Correction:** Record both balances and reset/overlap as **unavailable with source limitations**; preserve approximate time provenance and avoid retroactive guesses. For subsequent tasks check any supported quota/status view before substantive work.
- **Residual risk:** Actual account-level consumption, overlap and effort remain unmeasured. This does not affect the independently verified commit, PR, CI and gate metrics in the handoff.
