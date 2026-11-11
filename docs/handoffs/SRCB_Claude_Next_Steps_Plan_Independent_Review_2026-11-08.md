# SRCB - Independent Review of Claude's Next-Steps Plan

**Review date:** November 8, 2026  
**Verdict:** **REVISE BEFORE EXECUTION**

Claude's overall direction is reasonable, but I would change the task order and remove unnecessary work. Several assumptions are outdated, and the plan overlooks the completed Windows retest protocol.

## 1. Corrections to Claude's Status Report

I checked the relevant GitHub pull requests.

| Item | Verified status | Assessment |
| --- | --- | --- |
| macOS Gate 3 | **APPROVED**, recorded in merged [PR #47](https://github.com/raisinbran/scrb/pull/47) | Claude is incorrect that Gate 3 remains open on both platforms. |
| Windows Gate 3 | **NOT APPROVED** | Correct. |
| [PR #67](https://github.com/raisinbran/scrb/pull/67) | Open, draft; head `553dd90` | The diagnostics correction is now incorporated into its branch. |
| [PR #69](https://github.com/raisinbran/scrb/pull/69) | **Merged into PR #67** | A separate PR #69 merge decision is no longer needed. |
| [PR #70](https://github.com/raisinbran/scrb/pull/70) | **Merged into `main`** | Serial storage tests are implemented, but the intermittent Windows CI defect is not proven eliminated. |
| [PRs #71](https://github.com/raisinbran/scrb/pull/71) and [#72](https://github.com/raisinbran/scrb/pull/72) | Both merged into `main` | Agent-allocation recommendations should use the updated policies. |

The historical Windows result must remain unchanged: **73/77 (94.8%)** is the optimistic bound under the original frozen rule. Any additional candidate identified afterward belongs in a separate sensitivity or diagnostic analysis, not in a revised frozen result.

## 2. Main Problems with the Proposed Sequence

### The prospective scoring protocol is already complete

We independently reviewed and closed the **Windows Gate 3 Diagnostic Retest Protocol v3**. A new endpoint/reference policy would duplicate that work. What remains is preparing its reference files, observer, analysis scripts, and freeze manifest.

### PR B should not automatically precede the next test

PR #67 already provides upstream tracing through supervisor delivery. The approved protocol pairs that with an external UI observer. That combination may be sufficient to localize the failure. Building PR B before examining the evidence risks adding complexity without knowing which stage needs more instrumentation.

### The historical failure has not been localized

November 7 established missing timely DOM publication, but not whether speech was lost at VAD, recognition, supervisor delivery, or a downstream stage. Claude's statement that worker health looks fine is stronger than the evidence supports.

### PR #67 does not contain PR #70's storage-test mitigation

PR #67 still uses the older storage-test configuration; it does **not** contain `fileParallelism: false`, which was merged separately into `main`. Nevertheless, PR #67's current Windows/macOS CI passed. Do not unnecessarily backport PR #70 without a specific reason.

- [PR #67 current-head CI: Windows/macOS PASS](https://github.com/raisinbran/scrb/actions/runs/42513079724)

## 3. Recommended Revised Order

1. **Close PR #67's review and integration.** PR #69 already received independent QA with no blocking findings before merging. Perform only a final integrated-head readiness check on `553dd90`, account for existing reviews, and obtain owner authorization before merging PR #67 into its parent branch, PR #42.
2. **Operationalize the approved v3 retest protocol.** Prepare and verify the two-track source files, short-utterance annotations, read-only Live-screen observer, clock alignment, and analysis scripts. Complete the freeze manifest without initiating the main physical recording.
3. **Obtain authorization, then execute one Windows diagnostic retest.** Use the frozen candidate and scoring rules. Request approval for the planned 30-minute duration and preserve all original evidence. No automatic retry.
4. **Decide whether PR B is justified from the results.** If upstream processing and delivery are confirmed but visible output is absent, consider a targeted downstream instrumentation plan with independent review and owner approval. Otherwise investigate the earliest supported anomaly instead.
5. **Resolve housekeeping separately.** Reconcile outstanding agent-usage and incident records. Do not automatically commit the local Claude model-research note; first check whether merged PRs #71/#72 already cover its useful content. Keep macOS Gate 3 closed unless a new shared-code change requires targeted regression.

## 4. Agent Allocation

Claude's proposed assignments need adjustment under the November 8 policies.

| Agent | Recommended assignment |
| --- | --- |
| ChatGPT Chat | Final PR #67 readiness assessment, protocol coordination, and independent planning QA. |
| Windows Codex | Physical preflight, frozen test setup, and authorized Windows recording. |
| Claude Code | High-value independent review where needed; PR B planning only if diagnostics justify it. |
| Mac agent | Continue approved Phase 4/5 work; do not reopen macOS Gate 3 by default. |

The newer [agent allocation policy](https://github.com/raisinbran/scrb/blob/main/agents/agent_task_allocation.md) and [Claude model guidance](https://github.com/raisinbran/scrb/blob/main/agents/claude_model_split.md) emphasize avoiding unnecessary transfers and context rebuilding. Opus at medium effort remains reasonable for a genuinely difficult PR B architecture plan, but there is no reason to incur that expense yet.

## 5. What Claude Should Do Next

Of Claude's two proposed immediate choices, **I would choose neither as written**. The endpoint policy is complete, and PR #69 does not need another independent review.

The useful next action is a narrowly scoped final PR #67 readiness check. If Claude performs it, use these instructions:

### Copy-ready Instructions for Claude

> **SRCB - Final PR #67 integrated-head readiness check**
>
> Review PR #67 at current head `553dd9080f452f8a54ccff5cd5fea8d6937438ae`, stacked on PR #42.
>
> PR #69 has already merged and received independent QA. Windows/macOS CI passed at run 42513079724. Do not duplicate those reviews or rerun passing tests without a specific evidence gap.
>
> Confirm:
> - The paired-complete-but-no-processing analyzer correction is present and its regression remains intact.
> - The final integrated diff introduces no new unreviewed risk.
> - Existing independent review and CI evidence support a final merge recommendation.
> - The PR description and handoff reflect the actual current head.
> - Any outstanding quota/usage reporting is clearly identified.
>
> Post the final assessment directly to PR #67 as a formal GitHub review comment, distinguishing technical approval from owner merge authorization.
>
> Do not merge, launch a recording, modify production code, reopen macOS Gate 3, write a new endpoint protocol, or begin PR B.
>
> Record both five-hour and weekly quota readings before and after the task, with model/effort and any overlapping usage.

## Overall Recommendation

Approve Claude's general direction **only with the revised sequence above**. The priority is to finish PR #67 and prepare the already-approved diagnostic test, **not** restart protocol planning or expand the instrumentation scope.

**No additional physical testing or PR B implementation is authorized by this review.**
