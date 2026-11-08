# Claude Code: Opus vs Sonnet split (research, 2026-11-08)

Claude credits are scarce (Pro plan). Evidence is mostly anecdote and vendor blogs; the per-task tracker in `agent_task_allocation.md` is the real test. Log **Model / effort** and **Retries** (extra attempts at the same acceptance test) for every Claude task.

## Facts
- API price per million tokens: Opus 5.5 $4/$20, Sonnet 5.5 $2/$10, Haiku 5.5 $0.10/$0.50 ([pricing](https://claude.com/pricing)). Anthropic publishes no Pro-plan multiplier for 5-hour or weekly draw; Opus's extra thinking tokens likely widen the gap on hard tasks ([Layer3 Labs](https://www.layer3labs.io/comparisons/claude-sonnet-5-token-usage-vs-opus-5), vendor blog). One guide says Opus and Sonnet share one weekly pool on Pro ([Hora de Codar](https://horadecodar.com.br/limites-claude-opus-5/)); unverified.
- Features ([docs](https://code.claude.com/docs/en/model-config)): `/model opusplan` = Opus in plan mode, Sonnet to execute; subagents inherit the main model unless `model` is set in their definition; Opus/Sonnet/Haiku 5.5 default to `medium` effort (`low`..`max`); `/model` switches at once (`s` = this session only).
- Retry evidence is weak. Opus wins only if it uses under roughly 40-50% of Sonnet's tokens including retries; about two or more average Sonnet retries per patch flips it (Layer3). Anecdotes: [Opus cheaper on complex one-shot tasks](https://reddit.sentinel-team.org/posts/1ss78xu/snapshots/2026-04-25T02%3A30%3A13.962987Z); [Sonnet ~5.5x cheaper on smoke tests, same pass rate](https://reddit.sentinel-team.org/posts/1snoazr/snapshots/2026-04-18T01%3A10%3A06.838236Z).

## Default setup (until the tracker says otherwise)
| Task | Setup |
| --- | --- |
| Planning; plans for risky changes (IPC, security, recovery) | Opus, medium, plan mode; plan names files, tests, "done" |
| Complex backend/native work | Opus directly |
| Routine edits, UI, docs, mechanical fixes with a clear plan | Sonnet medium; `opusplan` for larger multi-file tasks |
| Exploration, test runs | Haiku/Sonnet subagents (`model` in frontmatter) |
| QA/review | Sonnet first pass; Opus for high-risk diffs; reviewer differs from author |

Stop rule: if Sonnet fails the same acceptance test twice, switch to Opus with the failure output.

## How to confirm
Compute 5-hour points per **accepted** task (retries included; split planning from execution), compare same-type tasks across models, and check weekly points too. If Sonnet is under half of Opus per accepted task, keep it as default; if its retries average 2+, move that task type to Opus. Aim for about 5 routine Sonnet tasks plus a few hard tasks on each model before deciding.
