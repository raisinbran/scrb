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
| Choose next routine test/task; write specific test instructions | Prefer ChatGPT Chat or the executor with verified context; if Claude is assigned, Sonnet medium |
| Larger, well-defined multi-file work | Opus planning then Sonnet execution, optionally `opusplan`, **only if substantial execution justifies the model-switch cache miss** |
| Narrow exploration and log inspection | Sonnet or Haiku subagents with explicit model/effort when useful |
| Independent QA | Sonnet for routine changes, Opus for high-risk changes, with a reviewer other than the author |

**High-risk** means a change requiring an approved plan under the Development Process: audio capture, chunk writing/recovery, pause/resume, formats or index upgrades, correction precedence/frozen spans, deletion/auto-delete, security or IPC. Escalate other demonstrated recording/data-loss or security risks to the owner rather than assuming the list is exhaustive.

**Stop rule:** After **two failures of the same acceptance test without a new useful diagnosis**, stop and reassess the approach, effort, or model using the failed command, output, diff, and attempted fixes. This is a maximum trigger for reassessment, **not permission for automatic reruns** and not an automatic switch to Opus. Stricter test-duration, one-diagnostic-cycle, and owner-approval rules still apply.

## Next-test decisions, switching cost, and context

**Test selection and instructions:** For an approved plan or established failure, use Sonnet medium to choose the next bounded task/test and specify preflight, exact steps, acceptance and abort criteria, and evidence to preserve. Prefer ChatGPT Chat or the already-informed executor when they have the verified context and physical access is not needed for planning. Use Opus medium **from the start** for competing explanations, uncertain acceptance evidence, risky data/recording behavior, or a likely costly/inconclusive run. A model already doing complex planning should finish a short instruction set rather than switch models just for the final few lines.

**Model and effort changes are supported, but can be costly.** `/model` keeps the conversation in the same Claude Code session, yet each model has its own prompt cache: its first request after switching rereads the conversation uncached. Changing top-level `/effort` or thinking settings invalidates cached conversation prefixes, sometimes including system/tool context. Prefer **one model and effort level per cohesive task**; don't alternate models or effort just to answer small follow-ups. Switch at a natural phase boundary (preferably after a useful compaction), or when better reasoning/lengthy subsequent work warrants the cache rebuild. The automatic Opus-to-Sonnet transition in `opusplan` has this tradeoff too. These are caching costs, not lost conversation history. See [Claude Code settings](https://code.claude.com/docs/en/settings), [thinking and caching](https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost), and [model configuration](https://code.claude.com/docs/en/model-config).

**Transfer overhead and instruction footprint:** Before changing agents, sessions, or models, weigh context reconstruction, source rereading, duplicate diagnostics/tests, independent review, and owner time. When a transfer is worthwhile, give a concise handoff with the baseline commit, established evidence, remaining uncertainty, next test and stop conditions; don't dump long logs. `CLAUDE.md` imports the shared `AGENTS.md`, so its small visible size **does not exclude the imported instructions from context**. Keep root instructions lean and this specialized guidance in a separately referenced file, not another automatic import. Inspect `/context all` or `/usage` when useful; `/usage` on supported versions can show main-session cache misses. See [instruction sizing](https://code.claude.com/docs/en/memory) and [Claude Code costs](https://code.claude.com/docs/en/costs).

## Measure results before changing defaults

Record model and effort for each phase (plan, execution, review), retries, final acceptance, both quota bars and reset times, known overlapping use, and any observed model/effort/session transfer or cache miss in [the tracker](agent_task_allocation.md). Include project-related Claude chat planning/review: it may affect the same quota as Claude Code. Use one short phase breakdown only for hybrid work; link to existing PRs/handoffs for details.

Compare naturally occurring, similarly scoped tasks by **observed quota change per accepted task**, including failed attempts, planning, QA and rework, plus elapsed time and acceptance quality. Rounded readings, reset windows, and concurrent sessions make individual task costs uncertain. Do not sum overlapping account-level deltas, invent an exact quota multiplier, or run duplicate implementations just to collect data.
