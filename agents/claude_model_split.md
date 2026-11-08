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
| Choose next routine test/task; write specific test instructions | Sonnet, medium effort |
| Larger, well-defined multi-file work | Opus planning then Sonnet execution, optionally `opusplan`, **only if substantial execution justifies the model-switch cache miss** |
| Narrow exploration and log inspection | Sonnet or Haiku subagents with explicit model/effort when useful |
| Independent QA | Sonnet for routine changes, Opus for high-risk changes, with a reviewer other than the author |

**High-risk** means a change requiring an approved plan under the Development Process: audio capture, chunk writing/recovery, pause/resume, formats or index upgrades, correction precedence/frozen spans, deletion/auto-delete, security or IPC. Escalate other demonstrated recording/data-loss or security risks to the owner rather than assuming the list is exhaustive.

**Stop rule:** After **two failures of the same acceptance test without a new useful diagnosis**, stop and reassess the approach, effort, or model using the failed command, output, diff, and attempted fixes. This is a maximum trigger for reassessment, **not permission for automatic reruns** and not an automatic switch to Opus. Stricter test-duration, one-diagnostic-cycle, and owner-approval rules still apply.

## Test strategy and switching cost

- **Bounded work:** When Claude is assigned and an approved plan or established failure defines the task, use Sonnet medium to select the next test/task and write exact preflight, steps, acceptance, abort conditions, and evidence to preserve.
- **Ambiguous test strategy:** Consider Opus medium for competing diagnoses or uncertain acceptance evidence when an incorrect choice could repeat an inconclusive test. These optional reasoning triggers are **in addition to** the high-risk, plan-required list above. A test planned to exceed 20 minutes or a previously documented high-cost failure warrants particular scrutiny; 20 minutes is an owner-approval threshold, **not the only definition of cost**. Model choice never authorizes running or repeating a test, changing a plan, or bypassing approval. If Opus already has the context, let it finish a short set of instructions without switching.
- **Model switching:** Claude Code's `/model` retains the session history, but each model has a separate prompt cache. The first request on a new model rereads the conversation without that model's previous cache. Avoid repeated changes; the `opusplan` transition has the same tradeoff. See [Claude Code settings](https://code.claude.com/docs/en/settings).
- **Effort switching:** At the Anthropic **API** level, changing *top-level* thinking/effort settings invalidates message-cache prefixes and can also invalidate system/tool caches on some models. Claude Code's `/effort` implementation and the exact effect may depend on its version and settings; don't claim they are identical. Keep effort stable for a cohesive task unless the reasoning benefit warrants a possible cache rebuild. See [thinking and caching](https://platform.claude.com/docs/en/build-with-claude/thinking) and [Claude Code model configuration](https://code.claude.com/docs/en/model-config).
- **Transfers and instructions:** Weigh context reconstruction, source rereading, duplicate diagnostics/tests, and owner time before transferring work. **Required independent review is never waived to conserve credits.** A worthwhile handoff names its base commit, verified evidence, uncertainty, next test, and stop conditions; avoid dumping long logs. `CLAUDE.md` imports `AGENTS.md`, so its short visible length does not mean the imported instructions are free of context cost. Keep detailed guidance here instead of adding another import. Check `/context all` for context and `/usage` for account/cache information when supported. See [Claude Code memory](https://code.claude.com/docs/en/memory), [slash commands](https://code.claude.com/docs/en/commands), and [Claude Code costs](https://code.claude.com/docs/en/costs).

## Measure results before changing defaults

Record model and effort for each phase (plan, execution, review), retries, final acceptance, both quota bars and reset times, known overlapping use, and any observed model/effort/session transfer or cache miss in [the tracker](agent_task_allocation.md). Include project-related Claude chat planning/review: it may affect the same quota as Claude Code. Use one short phase breakdown only for hybrid work; link to existing PRs/handoffs for details.

Compare naturally occurring, similarly scoped tasks by **observed quota change per accepted task**, including failed attempts, planning, QA and rework, plus elapsed time and acceptance quality. Rounded readings, reset windows, and concurrent sessions make individual task costs uncertain. Do not sum overlapping account-level deltas, invent an exact quota multiplier, or run duplicate implementations just to collect data.
