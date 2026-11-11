# Claude Code Pro: Opus/Sonnet split research

**Compiled:** November 8, 2026  
**Contents:** The full original user prompt (including the Claude-supplied preliminary research), followed by the assistant's consolidated findings and direct citations.

---

# Original user prompt (verbatim)

````text
Research online (Reddit, Anthropic docs and pricing pages, Claude Code docs, developer blogs and forums) how best to split work between Opus and Sonnet in Claude Code when credits are limited. Weigh the two competing claims: (1) Opus should do the complex coding itself, because Sonnet loops and wastes credits on hard tasks; (2) Opus should plan and write the instructions while the cheaper Sonnet carries them out. Cover: how much each model's usage draws on Pro-plan 5-hour and weekly limits; Claude Code features that support a split (the `opusplan` model setting, subagent `model` frontmatter, effort levels, /model switching); and evidence on retry/looping costs. Prefer recent, dated sources and label anecdote versus measurement. Done means a short recommendation in chat with cited links: which setup to use for which task type (planning, complex backend/native work, routine edits, QA/review), and what to measure to confirm it in this repo's usage tracker. Write no files and change no settings.





Below are Claude's findings on this same task. You may supplement, disagree, revise as needed. Your final result should be the combined findings:



# Opus/Sonnet split for scrb on a Pro plan

**Recommendation:** run Sonnet 5.5 as the default, use Opus 5.5 for planning, hard backend and native work, and final review, and use `opusplan` only for large tasks where the plan is expensive to get wrong. The research can't settle which model is cheaper per accepted task, so your tracker data should settle it.

I wrote no files and changed no settings. I did not read the sibling notes folder, which was empty.

## What the sources support

**Pro-plan draw is not published.** Pro has a rolling 5-hour limit and a weekly cap. Pricing lists Opus, Sonnet and Haiku as available on Pro ([pricing](https://claude.com/pricing)). I found no official multiplier for how fast Opus drains those limits compared with Sonnet.

- Per token, Opus 5.5 is 2x Sonnet 5.5 on the API: $4/$20 against $2/$10 per million input/output tokens. Haiku 5.5 is $0.10/$0.50. Pro's drain rate is likely proportional but unconfirmed.
- Opus's adaptive thinking adds output tokens, so on hard tasks the real gap is larger than 2x ([Layer3 Labs, updated 2026-10-27](https://www.layer3labs.io/comparisons/claude-sonnet-5-token-usage-vs-opus-5)). That is a vendor blog, not a measurement.
- Anecdote: one user reports about 15–20% of weekly limit per 5-hour Opus session against about 5% on Sonnet. A Brazilian guide says Opus and Sonnet share one weekly pool on Pro ([Hora de Codar](https://horadecodar.com.br/limites-claude-opus-5/)). Both predate or differ from your model generation, so treat them as unverified.

**Claude Code features** ([model-config docs](https://code.claude.com/docs/en/model-config)):

- **`opusplan`:** Opus in plan mode, Sonnet for execution. Set it with `/model opusplan`.
- **Effort levels:** Opus 5.5, Sonnet 5.5 and Haiku 5.5 all default to `medium`, with `low` through `max` available.
- **Subagents:** they inherit the main model unless the subagent's definition sets `model`. For example, Haiku or Sonnet for read-only exploration.
- **`/model`:** switches immediately. `s` in the picker switches for the current session only. Enter saves it as your default.

**Retry and looping evidence is weak.**

- Claim (1), that Sonnet loops on hard tasks, rests on anecdotes and a [Reddit-mirror post](https://reddit.sentinel-team.org/posts/1ss78xu/snapshots/2026-04-25T02%3A30%3A13.962987Z) saying Opus can be cheaper overall on complex one-shot tasks.
- Claim (2), plan with Opus and execute with Sonnet, is Anthropic's own design for `opusplan`. No independent measurement showed it saves credits.
- The break-even logic is sound. Opus wins only if it needs under roughly 40–50% of Sonnet's tokens, including retries. Layer3 puts the flip point at about two or more average Sonnet retries per patch.
- A [Reddit-mirror post](https://reddit.sentinel-team.org/posts/1snoazr/snapshots/2026-04-18T01%3A10%3A06.838236Z) reports Sonnet about 5.5x cheaper on browser smoke tests with the same pass rate. That is a single anecdote.
- The [Roo Code blog](https://roo-code-website-3lbno5tr4-roo-code.vercel.app/blog/the-opus-cost-paradox-expensive-models-can-be-cheaper) argues for measuring cost per completed task, but its page returned 404, so I couldn't check it.

## Which setup for which task

| Task type                                                          | Setup                                                                                                                                         |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Planning, and plans for risky changes (IPC, security, recovery)    | Opus 5.5 at medium effort, in plan mode, with a written plan that names the files, the tests and "done"                                       |
| Complex backend or native work (capture, recovery, state machines) | Opus 5.5 directly. Restarting with a better prompt is cheaper than letting Sonnet retry.                                                      |
| Routine edits, UI work, docs, mechanical fixes with a clear plan   | Sonnet 5.5 at medium effort, or `opusplan` for larger multi-file tasks                                                                        |
| Exploration and test runs                                          | Haiku or Sonnet subagents with `model` set in the frontmatter                                                                                 |
| QA and review                                                      | Sonnet for first-pass checks. Opus only for high-risk diffs. Keep a different agent from the author, as your decision order already requires. |

A stop rule helps with looping. If Sonnet fails the same acceptance test twice, switch to Opus with the failure output instead of letting it retry. This matches your "stop inconclusive loops" safeguard.

## What to measure in the tracker

Your tracker already records start and end percentages for both limits. Add two columns: model and effort, and retry count (extra attempts at the same acceptance test).

1. Compute **5-hour points per accepted task**, not per session. Include retries, and split Opus planning from Sonnet execution.
2. Compare tasks of the same type across models. Today's baseline is Opus at medium, two tasks for about 8 five-hour points and 1–2 weekly points.
3. Run about 5 routine tasks on Sonnet and a few hard ones on each model. The Layer3 page suggests about 20 for the API.
4. If Sonnet's points per accepted task are under half of Opus's, keep Sonnet as the default. If Sonnet's retries average two or more, move that task type to Opus.
5. Check the weekly points too, since Opus and Sonnet may share one pool. The 5-hour reading alone can mislead.

Sources: [model-config docs](https://code.claude.com/docs/en/model-config), [pricing](https://claude.com/pricing), [Layer3 Labs](https://www.layer3labs.io/comparisons/claude-sonnet-5-token-usage-vs-opus-5), [Hora de Codar](https://horadecodar.com.br/limites-claude-opus-5/), [Reddit mirror 1](https://reddit.sentinel-team.org/posts/1ss78xu/snapshots/2026-04-25T02%3A30%3A13.962987Z), [Reddit mirror 2](https://reddit.sentinel-team.org/posts/1snoazr/snapshots/2026-04-18T01%3A10%3A06.838236Z).
````

---

# Consolidated research findings and recommendation

**Research date:** November 8, 2026  
**Scope:** Claude Code, especially Pro-plan users with constrained five-hour and weekly usage allowances.  
**Evidence classifications:** *Official documentation*, *vendor measurement*, *independent published measurement*, *anecdote*, and *recommendation/inference*. The original prompt and Claude's preliminary notes are reproduced above, rather than silently treated as verified facts.

## Executive recommendation

**Default to Sonnet 5.5 for clearly scoped implementation. Use Opus 5.5 for architectural planning, difficult backend/native implementation, and review of high-risk diffs. Use `/model opusplan` selectively for substantial but well-defined changes where stronger planning can reduce execution mistakes.**

Neither proposed rule is universally cheaper:

1. **"Opus should code the hard parts directly."** Reasonable when the problem requires difficult diagnosis, nonlinear reasoning, or complex state management and Sonnet is demonstrably failing. Benchmarks support higher Opus success rates on demanding repository tasks. They do **not** prove Opus consumes fewer Pro percentage points on every complex task.
2. **"Opus should plan and Sonnet should execute."** Supported as a built-in Claude Code workflow (`opusplan`) and appropriate when the task can be expressed as a precise, testable plan. It is **not** proven to save usage on every task, and orchestrating a second model has overhead.

The preferred decision criterion is **five-hour and weekly usage percentage points per accepted task, including planning, failed attempts, retries, QA, and rework**, rather than price per token or number of requests alone.

## 1. Pro usage limits versus API token prices

**Official documentation**

- Claude Pro includes Claude Code and has both five-hour and weekly usage allowances. How quickly a user reaches limits depends on model, session length, and other factors. Claude Code and other eligible Claude use can affect the subscription allowance. Anthropic does not publish a universal conversion factor such as "Opus uses 2x Sonnet's Pro quota" or fixed Pro quota percentages per request.
- `/usage` displays subscribers' plan usage bars and breakdowns, as well as local session token/cost estimates. The dollar figure is not a Pro billing charge. For comparisons across tasks, read the *five-hour* and *weekly* bars and preserve reset timestamps.
- **API token prices are not Pro quota conversion rates.** The currently listed base prices are:

| Model | Input per million tokens | Output per million tokens | Notes |
|---|---:|---:|---|
| Claude Opus 5.5 | $4 | $20 | Double Sonnet's listed base token prices |
| Claude Sonnet 5.5 | $2 | $10 | Lower base token prices |
| Claude Haiku 5.5 | $0.10 | $0.50 | Prices quoted for prompts up to 100,000 tokens; higher tier for longer prompts |

At comparable input/output and caching patterns, a 2:1 price ratio is a useful **API-equivalent** back-of-envelope starting point, **not** a verified Pro-quota multiplier. Different reasoning output, context growth, cached reads/writes, and tool loops can overturn a simple per-token comparison.

The preliminary Claude notes mention an unverified user anecdote of roughly 15-20% of weekly allowance for an Opus session versus 5% for Sonnet, and a site saying both share a weekly pool. Neither figure establishes a general model-specific Pro drain rate. The claim that Opus's adaptive thinking necessarily makes the real ratio greater than 2x also cannot be assumed: actual token and cache consumption must be measured.

Sources: [Claude plan pricing](https://claude.com/pricing); [Pro plan help](https://support.claude.com/en/articles/8325606-what-is-the-pro-plan); [Claude Code models, usage and limits](https://support.claude.com/en/articles/14552983-models-usage-and-limits-in-claude-code); [Claude API pricing](https://platform.claude.com/docs/en/about-claude/pricing); [Claude Code cost management and `/usage`](https://code.claude.com/docs/en/costs).

## 2. Empirical evidence on quality, retries, and costs

The data below are **not** measured Pro percentages. All reported US-dollar costs refer to API-equivalent, list-price, or benchmark token costs. Differences in effort and evaluation harness matter.

| Evidence and date | Comparison and finding | Classification and limitation |
|---|---|---|
| Anthropic internal agentic-coding tasks, **Sep. 19-24, 2026**, 370 repository tasks | Opus 5.5 at **medium**: **86.6%** solved at **$0.84 per attempt**. Sonnet 5.5 at **high**: **77.8%** at **$0.33 per attempt**; Sonnet at medium: **62.7%** at **$0.16 per attempt**. | **Vendor measurement.** The published Sonnet baseline uses its API default `high`, not Claude Code's default `medium`. Opus bought more reliability but at higher cost per attempt. |
| Anthropic SWE-bench Pro subset, **Sep. 2026**, 478 problems | Opus 5.5 medium: **92.8%** solved at **$0.22 per solved task**; Sonnet 5.5 high: **87.6%** at **$0.11 per solved task**. | **Vendor measurement.** Different benchmark from the 370-task study. Shows greater Opus pass rate but approximately double Sonnet's cost per solved task on this comparison. |
| AutoRouter, **Oct. 28, 2026**, 45 runs of five routine coding tasks | Every run passed automated checks. Mean list-price task cost: **Opus $0.110**, **Sonnet $0.049**, **Haiku $0.0044**. | **Independent published measurement by a model-routing vendor.** Small, easy test set; vendor has commercial interests. These results do not test hard native/backend work. |
| Anthropic Opus 5.5 effort escalation, **2026** SWE-bench Pro subset | Opus **low**, then **high only on failures**: about **97%** solved at **$0.17 per task** versus **95.3%** and **$0.29** if everything runs at high. Failure costs are included. | **Vendor measurement.** Evidence for selective escalation when an objective failure signal exists. It does not prove "switch to Opus after exactly two Sonnet retries." |
| Anthropic large-corpus planted-defect experiment, **Oct. 27-Nov. 3, 2026** | Opus 5.5 orchestrator with Sonnet 5.5 subagents: about **$139 per run**, versus **$200** for Opus 5.5 medium alone, with similar measured quality (F1 **0.831** versus **0.827**, with overlapping ranges). | **Vendor measurement.** Work spanned about **22 million tokens** and was highly divisible; this is **not** a controlled `opusplan` coding comparison. |

Primary sources: [Anthropic, *Optimizing for cost and intelligence*](https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence) (see *Compare models*, *Tune effort*, *Re-run failures*, *Orchestrator strategy*, and measurement references); [AutoRouter, *What common Claude Code tasks cost, measured on each model*, Oct. 28, 2026](https://autorouter.com/blog/claude-code-task-costs-measured); [AutoRouter research and datasets](https://autorouter.com/research).

**Interpreting loops and retries**

- Claim (1) captures a real possibility: a cheaper model can be more expensive per *accepted* change if it repeatedly produces incorrect patches, expands context, or requires human-guided rework. Evidence for the exact prevalence of Sonnet loops in this repository is currently **anecdotal**, not a measured fact.
- Claim (2) captures another real possibility: a strong plan can lower a cheaper executor's error rate. However, the plan consumes Opus allowance, and any back-and-forth is part of the total task cost. The `opusplan` feature is official product support for this workflow, not proof that it always wins.
- A simple theoretical break-even illustration: if Opus costs roughly twice per similarly priced token, it can be cheaper than Sonnet **only if the end-to-end work and caching mix compensate**. Approximately half as much similarly priced token work would be a rough break-even, **not** a Pro quota rule. Sonnet's retries and Opus's planning overhead must both be counted.
- A **practical stop rule**, rather than an evidenced universal threshold: after **two failures against the same acceptance test without a useful new diagnosis**, stop repeating the patch and escalate with the full error output and context. Do not treat "two retries" as a measured cross-model price threshold.
- Anthropic's measurements also show that optimizing *effort on the same model* can sometimes outperform changing models. An objective test or verifier is needed to know which cheap attempts failed.

**Anecdotes and lower-confidence sources from the supplied preliminary notes**

- [Reddit mirror, Apr. 25, 2026](https://reddit.sentinel-team.org/posts/1ss78xu/snapshots/2026-04-25T02%3A30%3A13.962987Z): argues Opus may be cheaper on hard one-shot work. **Anecdote**, not a controlled experiment.
- [Reddit mirror, Apr. 18, 2026](https://reddit.sentinel-team.org/posts/1snoazr/snapshots/2026-04-18T01%3A10%3A06.838236Z): claims Sonnet approximately 5.5x cheaper on browser smoke tests with similar pass results. **Single-user anecdote**, not generalized.
- [Reddit, Oct. 2026, usage-limit discussion](https://www.reddit.com/r/ClaudeCode/comments/1x7ifnd/i_went_from_exhausting_claude_codes_weekly_limits/): describes improvement from Opus planning/Sonnet execution. **Anecdote** with uncontrolled workflow changes.
- [Reddit, Nov. 2026, coding-workflow discussion](https://www.reddit.com/r/ClaudeCode/comments/1xmh85s/how_do_you_guys_code_with_ai/): describes checking and coordination overhead. **Anecdote**.
- [Layer3 Labs, updated Oct. 27, 2026](https://www.layer3labs.io/comparisons/claude-sonnet-5-token-usage-vs-opus-5): vendor interpretation of token-cost tradeoffs. **Commentary, not a controlled comparative measurement**.
- [Hora de Codar](https://horadecodar.com.br/limites-claude-opus-5/): plan-limit descriptions noted by Claude. **Secondary guidance, not an official conversion factor**.
- [Roo Code blog link supplied by Claude](https://roo-code-website-3lbno5tr4-roo-code.vercel.app/blog/the-opus-cost-paradox-expensive-models-can-be-cheaper): the earlier researcher reported a **404**; therefore no substantive claim here relies on its contents.

## 3. Claude Code features for splitting work

**Official Claude Code documentation**

- **`/model opusplan`**: uses Opus in *plan mode* and switches to Sonnet for *execution*. This is the simplest native hybrid for a bounded plan-first job. It is not equivalent to an arbitrary Opus architect managing independent workers on every turn.
- **`/model`**: select or switch the active model. In supported versions of the interactive picker, pressing **`s`** applies a choice to the *current session only*, while Enter saves the choice. Check the active model in the session rather than assuming all subagents inherit the choice.
- **Subagent frontmatter**: a reusable agent can specify `model: sonnet`, `model: haiku`, or `model: opus` and can specify `effort`. Without an override, it generally inherits the parent model. Subagents have isolated contexts and can keep long logs, source searches, and test output from bloating the main context. **They still send requests and draw against the same allowance.**
- **Effort**: Claude Code's default for Opus 5.5, Sonnet 5.5 and Haiku 5.5 is **`medium`**. Available levels include `low`, `medium`, `high`, `xhigh`, and `max`, subject to model and version restrictions. Higher effort can improve hard-task verification but increase token usage. The Opus/Sonnet **API benchmark defaults differ** from Claude Code defaults, so do not directly transplant pass rates into a medium-effort Code session.
- **`/usage`**: use the plan limit bars and history breakdown to audit five-hour and weekly consumption. The session dollar estimate is not the subscription charge. In recent versions, `/usage` can surface expensive task loops and local per-model usage; local records can omit web and other-device usage.

Documentation: [Model configuration](https://code.claude.com/docs/en/model-config); [Create custom subagents](https://code.claude.com/docs/en/sub-agents); [Manage costs effectively](https://code.claude.com/docs/en/costs).

## 4. Recommended routing by task type

| Task type | Starting configuration | Reason and escalation rule |
|---|---|---|
| **Architecture and risky planning** (security, IPC, recovery, interfaces) | **Opus 5.5, medium**, plan mode. Require file list, invariants, interfaces, test plan and explicit acceptance criteria. | Strong model performs ambiguity reduction before edits. Only move implementation to Sonnet if the plan is specific enough. |
| **Complex backend/native work** (capture, concurrency, platform integration, state machines, subtle recovery) | **Opus 5.5 directly**, medium initially; high selectively for especially hard diagnosis. | Higher reliability can offset price when retries are costly. Verify with tests rather than letting a repeated patch loop continue. |
| **Routine edits / UI / docs / mechanical fixes** | **Sonnet 5.5, medium**. | Small routine-task measurement strongly favors lower-cost execution. Use a precise prompt and acceptance tests. |
| **Larger but well-understood multi-file implementation** | **`/model opusplan`**, or manually use Opus for the plan and Sonnet for the approved execution. | Useful if the front-loaded plan is likely to prevent rework. Include Opus planning usage in the task total. |
| **Exploration, search, log inspection, standard test runs** | **Sonnet or Haiku subagents** with explicit model and effort in frontmatter where practical. | Isolate verbose material in a separate context. Benchmark quality on your actual work; low unit price does not guarantee lowest completed-task cost. |
| **QA and independent review** | **Sonnet** for first pass and straightforward diffs; **Opus** for critical/high-risk changes. Prefer reviewer independence from the author. | Spend highest capability where the cost of a missed defect is high. QA acceptance remains evidence-based, not model-based. |

For every task, stop when acceptance criteria pass. On repeated failures, provide Opus with the precise failing command, test output, diff, and attempted remedies rather than rerunning an unchanged Sonnet prompt indefinitely.

## 5. What to record in this repository's usage tracker

The preliminary notes state that the tracker already records start/end readings for the **five-hour** and **weekly** limit bars, and mention an Opus-medium baseline of **two tasks for about 8 five-hour percentage points and 1-2 weekly points**. This baseline is **user-supplied**, not independently inspected in this chat.

Recommended fields for each task:

1. **Task identity and type:** task ID, short description, task class, risk/complexity rating, and predeclared acceptance tests.
2. **Model routing:** model and effort for each phase, plan/execution/review agent, subagent models, and whether `opusplan` was used.
3. **Quota:** five-hour start/end percentage and reset time; weekly start/end percentage and reset time. Avoid a comparison spanning a reset.
4. **Work:** number of turns/attempts, retries on the same acceptance test, test outcomes, human interventions, and elapsed wall time.
5. **Quality:** first-pass acceptance, final acceptance, defects discovered in QA, rework required, and substantive human-review time.
6. **Diagnostic only:** input/output/cache tokens and API-equivalent dollar estimates where available. Do not treat these estimates as billed Pro credits.

**Primary metrics:**

`5-hour percentage points per accepted task = total five-hour limit points consumed across planning + implementation + retries + review / accepted tasks`

`Weekly percentage points per accepted task = total weekly limit points consumed across those same phases / accepted tasks`

Also calculate **first-pass acceptance rate**, **mean retries before acceptance**, **share of tasks escalated to Opus**, and **total time per accepted task**. If a task crosses a quota reset, exclude or separately account for it rather than interpreting a negative percentage change as low consumption. Record unrelated Claude use if the quota is shared.

**Small, practical comparison:** test at least a handful of routine Sonnet tasks, several hard Opus tasks, and, where comparable, matched task types with `opusplan`. A sample this small is directional rather than statistically decisive. Expand once there are enough similar tasks to separate model choice from task difficulty and context size.

**Decision rule:** preserve Sonnet as the default for categories where it completes reliably at lower quota per accepted task. Move a category to Opus when higher acceptance and lower rework consistently offset its greater quota use. Reserve `opusplan` for categories where measured planning benefits exceed its extra plan-phase consumption. **Do not set a universal Sonnet-to-Opus threshold from API price ratios or individual Reddit reports.**

## 6. Evidence limitations and conclusion

- No official, universal Opus-versus-Sonnet **Pro-plan quota multiplier** was established.
- The published benchmarks are strong evidence about **token-price economics and task accuracy** in their own harnesses, not direct measurements of this repository or its five-hour/weekly quota readings.
- The most compelling independent routine-task measurement has only **45 attempts on five tasks**. It does not measure complex native/backend work.
- Anthropic's hybrid orchestration measurement is **not a controlled `opusplan` experiment**.
- Reddit and developer-blog arguments about Sonnet loops or Opus one-shot efficiency are useful hypotheses, not transferable measurements.

**Final recommendation:** Sonnet for routine implementation and routine QA; Opus for architectural planning, hard native/backend coding, and high-risk review; `opusplan` for substantial, well-specified implementation. Optimize for **accepted tasks per five-hour and weekly percentage point**, not the cheapest individual response.

No repository was inspected and no Claude Code settings were changed. This Markdown report was the only file created to fulfill the follow-up request.

