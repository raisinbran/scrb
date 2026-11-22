### A-1026 — 2026-11-21 — ChatGPT cloud — conflated first observed tool time with earlier task receipt

- Attribution: Preventable reporting-timestamp mistake during PR #402 usage accounting.
- What failed: The first usage row called approximately 08:38 PT the owner-request/context timestamp even though the task request was received at 01:28 PT in the session's local-time metadata.
- Impact: Mischaracterized start-of-task accountability; the interval between receipt and first observable tool activity is not attributable or measured. Quota consumption remains unavailable, not zero.
- Correction: This same scoped PR revises the start field to 01:28 PT for request receipt, explicitly identifies ~08:38 PT as first observable active work and does not assign intervening usage. The 08:55:21 PT end field remains a documented implementation/accounting checkpoint, not the final owner-facing report time.
- Prevention: Distinguish message arrival time, tool activity evidence, and task-closeout observation; never infer elapsed active work or quota from a difference between these timestamps.
- No product code, installer, model, tests or private data was affected.
