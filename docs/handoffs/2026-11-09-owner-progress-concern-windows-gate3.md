# Owner concern: apparent lack of Windows Gate 3 progress (2026-11-09)

Recorded at the owner's request. Source of the figures below: the 2026-11-08 project handover, agent reports through 2026-11-09, and the owner's statement. The quota percentages are the owner's own and were not independently verified.

## Owner input (verbatim)

> While the agents have no lack of new solutions, tasks, and tests to work on for windows gate 3, to the user it is impossible to avoid the negative perception that the project has made 0 progress after using 250% of codex's 1-week limit (inc 2 user-initiated account resets that are nonrenewable) and, so far, 130% of claude's 1-week limit. What progress has been made toward Windows Gate 3 since 11/1/2026? The outsider perception is 0% progress.

## Answer: what is and is not different since 2026-11-01

**Gate verdict: unchanged.** Windows Gate 3 is not approved. No new live-latency measurement against the gate target (median 3 s, 95% within 6 s) has been produced since the frozen 2026-11-07 analysis (73/77 = 94.8% under the detector-end bound; 74/77 not proven under the acoustic-end bound; target 95%). On that measure the outsider view is correct.

**Product code: unchanged.** Nothing since 11-01 changes live transcription speed or accuracy. PR #67 adds diagnostics only (disabled by default) and is unmerged.

**What did advance** (from the 11-08 handover and later reports):

| Item | State |
| --- | --- |
| Final-pass accuracy on a physical Windows AMI test | Live 47.82% WER, final 24.58% WER, 48.6% relative reduction against the 15% target (PR #54) |
| About 60-minute real recording | Recovered and finalized; 7,360 mic and 7,607 meeting words. Completion proven; GPU-speed target not |
| Imports | 21/21 across seven formats on an ancestor with matching importer code. Cancel/failure cleanup not yet audited |
| UI responsiveness | Record acknowledged in 23-41 ms, Stop in about 12.7 ms (target 200 ms, a UI-response criterion) |
| Failure analysis | The miss narrowed to a handful of late or unattributed units (4 of 77) in one time window, not a broad failure |
| Retest design | Protocol v3 accepted as a design baseline by the owner on 11-08. Execution not authorized |
| Measurement tooling (11-08 to 11-09, unmerged branch) | Scoring pipeline, timing and clock evidence, observer validation, annotation draft, dry run on a retained recording. 318 Python tests pass; about ten review rounds found and fixed real false-PASS and false-FAIL paths |
| Process | Failure register (A-001 to A-065), usage tracking, evidence-retention rule |

**Honest reading.** The effort since 11-07 went into making the next measurement trustworthy, not into improving the product or into producing the result itself. That work found real defects (for example, scoring that could credit late words, or report a late word where timing was merely unknown), so it was not empty. It is still preparation. The scored retest has not run, and a clean result is not guaranteed: a dry run on a retained recording identified about 94% of units outside scripted scrolling, which sits at the 95% line again.

**Cost versus value.** The 11-07 miss was 4 units out of 77. The preparation to adjudicate it has consumed far more review effort than that margin suggests. This is a legitimate concern, and some of the cost came from agent errors (logged in `agents/agent_self_induced_failures.md`).

## Decision options for the owner (not yet chosen)

1. **Stop adding rounds; freeze and run once.** After the two remaining targeted fixes and a single narrow review, finalize the manifest, get the owner's plain-language approvals, and run the one scored 30-minute test when speakers are available. Accept the result either way.
2. **Owner decision on the existing evidence** (waiver, partial approval, or deferral of the Windows live-latency criterion), instead of a new run. This is the owner's call and needs a written risk statement.
3. **Pause Windows Gate 3** and spend allowance elsewhere (macOS Phase 4/5 is allowed to proceed in parallel).

Recommended stopping rule for any path: no further review round unless it finds a concrete false-PASS or false-FAIL path in the scoring code.

## Owner follow-up input (verbatim, same day)

> until the last few days, agent effort was not closely tracked by you. Codex legitimately went through 1 or 2 user-initiated, nonrenewable, manual refreshes as well as a standard 1-week refresh since nov 1, 2026 or oct 31, 2026. That meant Codex would've had to completely exhaust its 1-week usage at least 2 times, as it is noted codex was recently at near-0% weekly usage left. For ~250% codex effort, windows gate 3 has continued to languish while mac sailed through gate 3 easily, a week ago.
>
> How does making this the last review round improve progress to gate 3? If it does, why wasn't this done before?
>
> How much longer will Windows Gate 3 take to accomplish? Does mac progress really have to stand still while windows gate 3 bogs down the whole project?

### Answer recorded

- **A stopping rule does not itself speed up Gate 3; it caps cost.** Review rounds kept being authorized one at a time with no stopping rule or effort budget, and agent effort was not tracked closely until recently. That is a coordination failure by the planning role, in addition to the agent errors in the failure register.
- **Remaining chain (estimates, not promises):** final narrow ChatGPT confirmation (about 10 min), manifest finalization from a clean checkout by a fresh session (30-60 min), independent manifest audit (10-20 min), owner plain-language approvals, separate owner authorization of the scored run (needs the speakers; return date unknown), then scoring (1-2 hours). Best case 1-2 calendar days. The outcome is not guaranteed: the dry run sat near 94% against the 95% target.
- **Mac does not have to wait.** The owner allowed Mac Phase 4/5 in parallel on 2026-11-08 and nothing in the code couples the two; the coupling is shared allowance. Pending Mac items from the 11-08 handover: PR #58 CI (storage tests; PR #70 later made them serial) and its native Mac verification, and the hands-on QA hold on PR #64. The owner chooses what starts.
