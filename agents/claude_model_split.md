# Claude Code model routing (provisional, 2026-11-08)

This guidance selects a Claude model **when Claude Code is assigned the work**. It does not reassign Codex work, authorize spending beyond `agents/agent_task_allocation.md`, replace required owner-approved plans, or count model switching as independent review.

## Evidence and configuration

- Claude and Claude Code can share five-hour and weekly subscription usage. Anthropic publishes no universal Opus-to-Sonnet **Pro quota** multiplier; API token prices are not subscription quota conversion rates. See [Anthropic usage guidance](https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work) and [API pricing](https://platform.claude.com/docs/en/about-claude/pricing).
- Anthropic's coding measurements favor Opus accuracy on some hard tasks, but not the lowest cost per accepted task on every benchmark. Independent routine-task measurements are small. Treat model-loop anecdotes and exact price break-even claims as hypotheses, not SRCB measurements. See [Anthropic cost/effort research](https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence) and [AutoRouter routine-task measurements](https://autorouter.com/blog/claude-code-task-costs-measured).
- Claude Code supports `/model opusplan` (Opus planning and Sonnet execution), `/model` switching, effort levels, and subagent `model`/effort overrides. Verify actual versions and settings in the session. See [model configuration](https://code.claude.com/docs/en/model-config) and [subagents](https://code.claude.com/docs/en/sub-agents).

## Starting choices

| Work | Preferred starting configuration |
| --- | --- |
| Risky architecture/implementation planning | Opus, medium effort, plan mode; require named files, failure modes, tests, and acceptance |
| Difficult native/backend diagnosis or implementation | Opus, medium initially; increase effort selectively when needed |
| Routine UI, docs, mechanical edits, and bounded tests | Sonnet, medium effort |
| Larger, well-defined multi-file work | Opus plan then Sonnet execution, optionally using `opusplan`, **only when planning will likely reduce rework** |
| Narrow exploration and log inspection | Sonnet or Haiku subagents with explicit model/effort when useful |
| Independent QA | Sonnet for routine changes, Opus for high-risk changes, with a reviewer other than the author |

**High-risk** means a change requiring an approved plan under the Development Process: audio capture, chunk writing/recovery, pause/resume, formats or index upgrades, correction precedence/frozen spans, deletion/auto-delete, security or IPC. Escalate other demonstrated recording/data-loss or security risks to the owner rather than assuming the list is exhaustive.

**Stop rule:** After **two failures of the same acceptance test without a new useful diagnosis**, stop and reassess the approach, effort, or model using the failed command, output, diff, and attempted fixes. This is a maximum trigger for reassessment, **not permission for automatic reruns** and not an automatic switch to Opus. Stricter test-duration, one-diagnostic-cycle, and owner-approval rules still apply.

## Measure results before changing defaults

Record model and effort for each phase (plan, execution, review), retries, final acceptance, both quota bars and reset times, and known overlapping use in [the tracker](agent_task_allocation.md). Include project-related Claude chat planning/review: it may affect the same quota as Claude Code. Use one short phase breakdown only for hybrid work; link to existing PRs/handoffs for details.

Compare naturally occurring, similarly scoped tasks by **observed quota change per accepted task**, including failed attempts, planning, QA and rework, plus elapsed time and acceptance quality. Rounded readings, reset windows, and concurrent sessions make individual task costs uncertain. Do not sum overlapping account-level deltas, invent an exact quota multiplier, or run duplicate implementations just to collect data.
