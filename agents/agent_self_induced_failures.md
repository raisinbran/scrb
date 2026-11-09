# SRCB — ChatGPT and Codex self-induced failure register

**Owner decision:** 2026-11-03 (Pacific). **Applies to:** ChatGPT Chat, Codex on Windows/macOS, and their test scripts, instructions, QA, handoffs, and workflow actions. Record incidents **even when production code is unaffected**. This supplements [agent allocation and usage](agent_task_allocation.md), not Gate 3 acceptance evidence.

## Logging policy

- **Record every identifiable agent-caused failure promptly**, including incorrect instructions or QA, flawed test fixtures/harnesses, misleading claims of work completed, unnecessary repetitions, owner time lost, and credit waste. Document both failures caught before launch and failures that reached the owner.
- Use one stable ID per distinct failure. State **what was observed, the agent-controlled mistake, actual effect, evidence, corrective action/status, and any known usage impact**. Retain failed attempts and subsequent corrections; amend entries rather than erasing history.
- Separate **agent/test-infrastructure errors** from **application defects**, user/device behavior, and **unattributed incidents**. When causation is incomplete, say so; do not blame Codex for an environment variable it did not demonstrably create.
- Mark entries **confirmed** when supported by an artifact, owner-supplied output or agent admission; mark **provisional** when based on a prior-session report that still needs provenance. Do not convert provisional reports into factual root-cause claims.
- Cite a public PR/commit where possible. Private recordings, owner session logs, transcript text, account identifiers, and secret values stay outside Git. A private conversation or local handoff may be named as provenance without quoting its contents.
- Log failures **even if eventually corrected**; closure means a corrective step was demonstrated, not that the incident never happened. Link to the [task usage tracker](agent_task_allocation.md) when quota observations exist; account-wide percentage-point movement is not proof of exclusive per-task cost.
- Tests **planned** to exceed 20 minutes in total need prior explicit owner approval. A test planned for <=20 minutes is not automatically interrupted for a slight unforeseen overrun. No automatic repeat; preserve evidence and request approval for any separately planned long test.
- This register is an **initial retrospective backfill of incidents substantiated by records currently available to ChatGPT**, not a claim that every historical session has already been audited. Future agents must add older confirmed incidents when discovered.

## Confirmed incidents

| ID | Date (PT) / agent | Agent-caused failure and actual impact | Correction / status | Supporting evidence |
| --- | --- | --- | --- | --- |
| A-001 | Nov 3 / ChatGPT | Treated ~787–1,211 ms **recording activation** as a likely failure of the 200 ms **UI-response** requirement; overstated a Windows Gate 3 blocker. | **Corrected:** measure visible Record/Pause/Stop response separately from activation under load. | [Gate 3 correction / triage](https://github.com/raisinbran/scrb/pull/42#issuecomment-6624082261); owner discussion |
| A-002 | Nov 3 / Codex | AMI test launcher prompted the owner although Electron had exited in Node mode. It did not verify the effective child environment or an alive, responsive application window, producing a failed launch and no test data. **Who introduced the empty-but-present `ELECTRON_RUN_AS_NODE` value is unknown**. | **Corrected in launcher** to remove/check variable and confirm window; first failed attempt retained. Not a Meeting Scribe transcription failure. | [PR #54 launcher diagnosis](https://github.com/raisinbran/scrb/pull/54) |
| A-003 | Nov 3 / Codex | `score.py` hardcoded `attempt` after the corrected launcher placed valid evidence in `attempt-02`. The owner's score command threw `FileNotFoundError`; the actual audio/transcripts were intact. | **Corrected:** owner ran `score-attempt-02.py` successfully; 48.61% relative WER reduction. Test-script error, not an application defect. | [PR #54 WER follow-up](https://github.com/raisinbran/scrb/pull/54); [Gate 3 comment](https://github.com/raisinbran/scrb/pull/42#issuecomment-6624005658) |
| A-004 | Nov 3 / ChatGPT | Described an audio alignment/completeness *review* without clearly saying there was no separate local review artifact. Codex searched beside the test files and had to request the review's location/text. | **Corrected:** explicitly identified the review as the section in PR #54 and stated its sampled-audio scope; no standalone local report was claimed. | [PR #54, audio coverage section](https://github.com/raisinbran/scrb/pull/54); owner/Codex handoff |
| A-005 | Nov 3 / ChatGPT | Emphasized **48.61% relative improvement** before adequately explaining that **24.58% final WER** is poor for an unreviewed business transcript. Conflated an engineering threshold with product readiness. | **Corrected:** retain numerical Gate 3 criterion separately from the longer-term absolute-quality concern; no retroactive gate change. | [Recorded score](https://github.com/raisinbran/scrb/pull/54); owner discussion |
| A-006 | Nov 3 / ChatGPT | Issued a Windows latency assignment without explicitly ruling out `real-live-run.spec.ts` as proof of calibrated, first-rendered DOM delay. Also used p95 shorthand rather than requesting the **count/percentage of eligible segments within 6 s**, including missing speech, and omitted full runtime configuration. This risked another inconclusive test. | **Amended before the next acceptance run:** require native-audio-to-DOM matching, calibrated clocks, per-track denominator and actual model/threads/`audioContext`. | [Existing inadequate harness](https://github.com/raisinbran/scrb/blob/e85eefed98298221cf921ba62f9b2e3e325a54bd/apps/desktop/e2e/real-live-run.spec.ts); [Development Plan](https://github.com/raisinbran/scrb/blob/main/dev-plan/Meeting%20Scribe%20-%20Development%20Plan%20%28v2.0%29.md) |
| A-007 | Nov 3 / ChatGPT | Rejected the owner's longstanding **approval for planned tests over 20 minutes** merely because it was not located in the repository; later wrongly framed the threshold as requiring permission or stopping upon a slight unexpected overrun. | **Corrected:** advance approval applies to tests *planned* over 20 minutes; safe minor unplanned overrun is not an automatic stop. Owner decision has priority over missing repo documentation. | Owner's explicit corrections in ChatGPT conversation |
| A-008 | Nov 3 / Codex | Preflight omitted an explicit microphone-unmute/input validation before starting cues. First ~24 s of saved microphone audio was essentially silent, making the attempted setup invalid. **Not proven to be an application defect.** | **Corrected preflight instructions and guards**; no claimed physical acceptance from that invalid attempt. | Owner-supplied Windows Codex session transcript (Nov 3, ~10:31 PM PT) |
| A-009 | Nov 3 / Codex | Microphone check actually passed, but the test controller's acceptance guard **falsely rejected** the preserved evidence, stopped recording, and prevented the planned two-track acceptance run. | **Offline correction/validation reported**, but the corrected full controller path was not yet physically proven; retain all failed-attempt evidence. | Owner-supplied Windows Codex session transcript (Nov 3, ~10:55 PM PT) |
| A-010 | Nov 3 / Codex | After editing the failed mic-check guard, Codex did not initially make clear that the already-running controller had entered its rejection/shutdown path. The owner encountered another `Run stopped` error despite a passing mic check. | **Clarified:** a file edit does not resume a controller already stopped; replay complete saved decision/shutdown path offline before another physical run. | Owner-supplied Windows Codex session transcript (Nov 3, ~11:02–11:03 PM PT) |
| A-011 | Nov 3 / Codex | After the false-rejection episode, Codex did not provide a concrete next owner action until prompted; the owner had to ask whether it was functioning. | **Corrected:** later identified the four-minute acceptance recording as the prospective next step, subject to authorization and controller validation. | Owner-supplied Windows Codex session transcript (Nov 3, ~11:03–11:04 PM PT) |
| A-012 | Nov 3 / ChatGPT | Recommended advancing to another physical acceptance recording based on a partial offline guard correction **before requiring replay of the full launch/decision/shutdown workflow**. Risked repeating the same harness failure and spending further credits. | **Recommendation withdrawn:** stop physical retries until complete offline-controller validation; budget before another Codex assignment. | Owner discussion and Codex false-rejection record (A-009/A-010) |

### A-027 — 2026-11-08 — Codex / Windows Desktop

- **Status / attribution:** Confirmed agent implementation mistake, caught in author self-review before testing or publication; not an application defect.
- **What failed:** The initial offline clock adapter mapped annotation times into harness time, which would move units relative to the existing analyzer's fixed 170–245 s recurrence window.
- **Agent-controlled cause:** Chose the wrong direction for clock conversion while leaving the analyzer's window in recording time.
- **Impact:** Short-lived uncommitted implementation replaced before use. No real audio, gate result, recording, source or threshold affected. No measured separate credit cost; see the occurrence-matcher task usage row proposed in its handoff.
- **Evidence:** This task's local edit history and author admission; `test_recording_clock_mapping` and `test_cli_clock_integration` cover the corrected direction with a 100 s offset.
- **Correction / remaining risk:** Map observer publication intervals into the unchanged annotation recording clock; propagate uncertainty. Synthetic regression checks passed. Physical clock/observer validation and independent code review remain pending.
- **Owner approval:** No physical or over-20-minute test started; no merge or gate approval requested.

### A-028 — 2026-11-08 — Codex / Windows Desktop

- **Status / attribution:** Confirmed agent CLI import error, not an application defect.
- **What failed / evidence:** `test_cli_clock_integration` failed with `ModuleNotFoundError: No module named 'marker_clock'` when executing the matcher with `--clock` as a subprocess; 69 other Python tests passed in that run.
- **Agent-controlled cause:** Assumed the script's sibling directory would be available for a bare import in this Python execution environment; initial tests exercised imported functions only.
- **Impact:** One failed synthetic test run and a focused correction; no real recording or evidence changed. Task-level allowance is account-wide, not an isolated retry cost.
- **Correction / remaining risk:** Load the clock helper by its explicit sibling file path, as existing analysis tests do. The corrected Python suite passed all 70 tests, including the CLI subprocess path. Independent review remains pending.
- **Owner approval:** No physical or over-20-minute test, threshold change, source change or merge involved.

### A-029 - 2026-11-08 - Codex / Windows Desktop

- **Status / attribution:** Confirmed initial offline analyzer defects found by ChatGPT's conditional review of `9a4d5a1`; agent implementation/test-coverage errors, not application defects.
- **What failed:** Broad source spans allowed missed-plus-duplicated repeats to get exact credit; boundary detection used nominal time instead of the lower bound; clock conversion lacked track/recording binding and explicit basis enforcement; invalid anchors escaped as ValueError; synthetic scale naming overstated real-track fidelity.
- **Evidence / impact:** Requested before-fix regressions reproduce these defects; see the handoff's before/after table. No real audio, recording, scored gate result, or frozen evidence was affected by this task.
- **Correction / remaining risk:** Require distinguishing provenance, lower-bound boundary classification, explicit clock basis and fit identity, and explicit INCONCLUSIVE reporting. The new regressions and complete 80-test Python suite pass. Physical calibration, observer provenance, comment checker, and follow-up independent review remain pending.
- **Usage / approval:** Usage row proposed in the handoff; intentional red runs are requested reproductions, not accidental retries. No rendering, recording, source/threshold/protocol change, freeze, merge, or planned over-20-minute test.

### A-030 - 2026-11-08 - Codex / Windows Desktop

- **Status / attribution:** Failed agent dependency-setup attempt; insufficient local npm cache is an environment limitation, not an application defect.
- **What failed / evidence:** `npm ci --offline --ignore-scripts --no-audit --no-fund` exited ENOTCACHED for electron-45.2.1.tgz; cleanup also warned EPERM on partial node_modules directories.
- **Agent-controlled cause / impact:** Tried cache-only installation without first establishing complete cache availability. One unsuccessful local install attempt; subsequent root-only dependency copy missed workspace-local modules, so the first npm check failed TS2307 for @vitejs/plugin-react; no network request, dependency/source edit, renderer, recording, or gate evidence affected. Partial node_modules is ignored test infrastructure.
- **Correction / remaining risk:** Copy already-installed root and workspace-local dependencies, excluding junctions, then recreate worktree-local workspace links. The targeted diagnosis found apps/desktop/node_modules and packages/transcription/node_modules; copy both before rerunning the interrupted check. Do not retry network installation. Final checks and setup outcome are recorded in the handoff.
- **Usage / approval:** Owner authorized offline testing; no over-20-minute test planned. Account changes are not isolated setup costs.

### A-031 - 2026-11-08 - Codex / Windows Desktop

- **Status / attribution:** Confirmed agent documentation edit error, corrected before commit.
- **What failed / evidence:** Initial exact-heading replacement silently failed to insert A-029; git status showed no change in the register after the handoff referred to it.
- **Agent-controlled cause / impact:** Used an unchecked replacement against a heading containing a Unicode dash through a shell/stdin script; the same encoding boundary damaged newly inserted dash characters in the handoff. Briefly inconsistent uncommitted documentation; no production or evidence effect.
- **Correction / remaining risk:** Insert using an asserted, unique ASCII heading prefix, repair the handoff characters, and verify both diffs. No pending documentation inconsistency from that edit.
- **Usage / approval:** No external publication, test retry, recording, or merge involved.

### A-032 - 2026-11-08 - Codex / Windows Desktop

- **Status / attribution:** Confirmed prior regression-evidence weakness identified by ChatGPT's PASS re-review of `28e3125`; agent test/documentation issue, not a remaining production defect.
- **What failed / impact:** Broad-provenance regression accepted BOUNDED as well as UNIDENTIFIED and checked only non-reuse of exact credit instead of no exact credit. The strengthened tests passed the new clock_basis keyword, making direct historical replay incompatible without an adapter; the handoff had summarized earlier red runs without attaching their exact output. Evidence was weaker and less reproducible than intended; no real audio, gate outcome, or frozen evidence affected.
- **Correction / evidence:** Require both occurrences exactly UNIDENTIFIED and exact-credit list empty. Add test-only `check_matcher_regressions.py`, loading the pinned `9a4d5a1` matcher and calling its original three-argument API while reusing the current fixtures/assertions. Attached historical red output shows two assertion failures, not TypeError; attached current output shows both tests pass. All 80 Python tests pass.
- **Remaining risk / usage:** Full check outcome and proposed usage row are in the handoff. Expected historical failures are owner-requested reproductions; the subsequent commit-command sequencing mistake is recorded separately as A-033. No production, threshold, protocol, source-audio, freeze, or merge change.

### A-033 - 2026-11-08 - Codex / Windows Desktop

- **Status / attribution:** Confirmed agent verification-command sequencing mistake, corrected before push.
- **What failed / evidence:** Staged diff check flagged a trailing space in the raw unittest red transcript and an extra EOF blank line in the handoff, but the shell continued to the local commit because its exit code was not guarded.
- **Impact:** One unpushed local commit contained whitespace findings; the draft's check-passed wording was temporarily premature. No implementation, test outcome, or external branch was affected.
- **Correction / remaining risk:** Strip trailing transcript whitespace, document that normalization, remove the EOF blank, and explicitly stop if the staged check fails before amending the unpushed commit. No test result or assertion text changes.
- **Usage / approval:** Owner authorized commit/push; no force-push, test rerun, source change, or merge required. Final usage is proposed in the handoff.

### A-034 - 2026-11-09 - Codex / Windows Desktop

- **Status / attribution:** Confirmed agent diagnostic-output mistake.
- **What failed / evidence:** Initial recursive practice-directory inventory included app browser-profile filenames and produced a truncated 329-line tool result. It did not provide a useful bounded audio/log inventory.
- **Agent-controlled cause / impact:** Selected every file rather than restricting inventory to audio manifests, chunks, and relevant logs. Extra filename output and a narrower follow-up inventory were needed; no profile content or confidential meeting audio was read, copied, or committed.
- **Correction / remaining risk:** Constrain subsequent inventory and reads to the owner-authorized synthetic practice audio and specific metadata/logs. All measurement artifacts and hashes stay outside Git. No ongoing data mutation or application defect.
- **Usage / approval:** Proposed task usage row in the practice marker audit handoff. Account usage is shared and not an isolated inventory cost; no recording, playback, render, threshold change, freeze, or merge involved.

### A-035 - 2026-11-09 - Codex / Windows Desktop

- **Status / attribution:** Confirmed agent analysis setup error, not an application defect.
- **What failed / evidence:** Initial reconciliation script assumed Sonnet's generated analysis/practice_cache/microphone.s16 existed and raised FileNotFoundError before measurements. The input directory retained scripts/result.json but no cache.
- **Agent-controlled cause / impact:** Reused a path from the historical script without checking file existence. One failed analysis setup attempt; no input mutation, playback, or false numerical result.
- **Correction / remaining risk:** Preserve failed script externally; reconstruct only the marker windows from original chunks with the documented decoder/placement method outside Git. Marker-region PCM matches the prior independent decode and reproduces both historical feature times. Do not claim a direct comparison to the absent historical cache.
- **Usage / approval:** Usage row proposed in the interior audit handoff. No audio rerun, threshold/protocol change, freeze, or merge.

### A-036 - 2026-11-09 - Codex / Windows Desktop

- **Status / attribution:** Confirmed earlier agent-created analyzer enforcement defect; not a recording defect.
- **What failed / evidence:** fit_clock returned false under the current 100 ms rule, but main ignored validity and emitted Layer A PASS on synthetic frozen endpoints. Missing clock evidence also emitted PASS. External clock-enforcement-before.txt records both actual regression failures.
- **Agent-controlled cause / impact:** Implemented the helper and unit checks without integrating the existing clock rule into the final CLI acceptance path. Could emit unjustified PASS/FAIL when synchronization was invalid. No real practice scoring or gate result was created by the demonstration.
- **Correction / remaining risk:** Gate each CLI track on independent clock evidence and the same existing disagreement/uncertainty limit. Invalid/missing evidence produces INCONCLUSIVE with no acceptance bounds. Valid clock arithmetic stays unchanged. Five focused regressions pass; full checks and independent review status are in the handoff. No amendment exception implemented.
- **Usage / approval:** Owner explicitly authorized this scoped current-rule fix if reproduced. No protocol/threshold/source change, freeze, or merge.

## Additional previously reported ChatGPT errors — provenance to verify

These were acknowledged in prior SRCB conversations but have not been cross-checked against their complete original transcripts in this backfill. They remain visible as **provisional**, not independently established application or process outcomes.

| ID | Date (PT) / agent | Reported agent error | Verification / follow-up |
| --- | --- | --- | --- |
| P-001 | Nov 3 / ChatGPT | Requested an unnecessary Windows preflight and treated an earlier `fb2d96c` test commit as outdated without sufficient justification, contrary to instructions to reuse valid evidence. | Retrieve original candidate/evidence comparison before classifying its cost or effect. |
| P-002 | Nov 3 / ChatGPT | Blurred the distinction between scoped QA recommendation of PR #48 and a formal GitHub PR approval, which the same connected author could not submit. | Confirm exact review attempts and GitHub status; PR remained draft/unmerged in the reported period. |
| P-003 | Nov 3 / ChatGPT | Communication implied that a Windows Codex assignment had been executed when GitHub instructions/comment publication was not a running device session. | Verify original wording; GitHub comment is not evidence that Codex started. |

## Credit and result impact — do not over-attribute

The owner-provided Windows Codex handoff reported **five-hour remaining 100% -> 81% and weekly remaining 31% -> 28%** during the recent closure work, while two-track acceptance remained **NOT PROVEN**. The owner also reported some repeated attempts using approximately 5% of the five-hour allowance each. These observations are **account-level balance changes**, potentially shared or rounded, **not verified per-attempt token costs**; they belong in [the usage tracker](agent_task_allocation.md) when reconciled. The material result was wasted owner interactions and test attempts, not a proven failure of durable recording.

## Explicit exclusions: do not assign blame without evidence

- The AMI scorer's generic `INCONCLUSIVE_PENDING_ALIGNMENT_AUDIO_AND_COMPLETENESS_REVIEW` label is a designed evidence-signoff step, not an SRCB transcription failure; the wrong **path** is logged in A-003.
- A 24.58% final WER is a genuine product-quality concern, not proof an agent caused the recognition errors. Only **how the result was presented** is logged in A-005.
- The earlier ~165 s microphone-text gap was traced to muffled/unintelligible input on the saved track; a transcription/software failure was not demonstrated.
- Interrupted one-hour processing, the Windows FFmpeg/awk build issue, and historic four-hour live failures have not been shown to be **agent-induced** from the evidence reviewed here. Do not count them as self-induced without a documented cause.

## Entry template for next agent

Use the next unused `A-` identifier when adding a confirmed incident; never reuse an ID. Provisional `P-` identifiers are separate.

```markdown
### A-NNN — YYYY-MM-DD — Agent / environment
- **Status / attribution:** Confirmed | Provisional; agent/test tooling vs application vs unknown
- **What failed:** Reproducible observation, not a guess
- **Agent-controlled cause:** Mistake actually established; note uncertainty
- **Impact:** Invalid run, owner actions/time, credits (if genuinely measured), risk/data effects
- **Evidence:** PR/commit, sanitized log identifier, or private source location description
- **Correction / prevention:** Smallest proven fix; tests that did or did not run
- **Owner approval:** Required for any planned >20-minute test, rerun, risky code, or gate change
```

Keep the register updated as incidents are found. It does **not** authorize any retry, merge, gate approval, or evidence deletion.
