# SRCB — Agent self-induced failure register (all agents)

**Owner decision:** 2026-11-03 (Pacific). **Applies to:** every agent: ChatGPT Chat, Codex on Windows/macOS, Claude Chat, Claude Code (all models), and their test scripts, instructions, QA, handoffs, and workflow actions. Record incidents **even when production code is unaffected**. This supplements [agent allocation and usage](agent_task_allocation.md), not Gate 3 acceptance evidence.

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

### A-037 - 2026-11-09 - Codex / Windows Desktop

- **Status / attribution:** Confirmed minor agent source-lookup mistake.
- **What failed / evidence:** A git show command tried to read the later-added Protocol v3 handoff at candidate 553dd90 and failed because that path did not exist in the older commit.
- **Agent-controlled cause / impact:** Applied the requested capture-code revision to a newer protocol document without checking its history. One failed read-only lookup; no measurement, input, recording, or acceptance result affected.
- **Correction / remaining risk:** Inspect capture/playback code at immutable 553dd90 and current reviewed Protocol v3 separately; document that provenance distinction. Numerical analysis and code snapshots remain outside Git.
- **Usage / approval:** Task usage row proposed in the two-timeline handoff. No source/protocol/threshold change, exception, recording, playback, freeze, or merge.

### A-038 - 2026-11-09 - Codex / Windows Desktop

- **Status / attribution:** Confirmed agent analysis-flag logic error, corrected before final reporting.
- **What failed / evidence:** Initial bracketing flags checked whether a gap started after the numerical long-match start. A step beginning just before that candidate could overlap the long template yet remain unflagged, as with meeting-025's crossing bracket.
- **Agent-controlled cause / impact:** Used point ordering instead of interval overlap over the bracket's expected search/support. Initial derived JSON had incomplete disturbance flags; no scoring, acceptance, source, or recording change.
- **Correction / remaining risk:** Preserve original output and create enriched output using full predicted-support interval overlap. Add the explicitly targeted microphone short/crossing bracket case without replacing spread samples. Final tables flag microphone-020 and meeting-025. Numerical maxima and wide sensitivity estimates are not accepted timing evidence; crossing acoustic integrity remains unresolved.
- **Usage / approval:** Task row proposed in the feasibility handoff. No correlation cutoff, amendment, threshold/protocol/capture change, recording, playback, freeze, or merge.

### A-039 - 2026-11-09 - Codex / Windows Desktop — v3a implementation tooling

- **Status / attribution:** Confirmed agent inspection, test-helper and CLI/setup errors; no application or recording failure.
- **What failed / evidence:** Initial reads assumed nonexistent `test_analyze_bounds.py` and `testing` paths; PowerShell wildcard paths passed literally to rg failed. Initial Git inspection/fetch lacked the existing worktree ownership exception and Git metadata access. First v3a test run had five duplicate-keyword errors in its invented-unit helper. The first complete Python run exposed an isolated-runtime sibling import error in the new v3a CLI. Initial npm check passed type/lint but Vitest startup could not write `.vite-temp` through the shared desktop dependency junction.
- **Agent-controlled cause / impact:** Incomplete path/runtime/access checks and a faulty helper override. A documentation patch initially failed on cp1252/UTF-8 decoding; an earlier inserted incident entry also used cp1252 for its new punctuation. Restored the original register from Git bytes and inserted the new entry with explicit UTF-8. Minor tool/check time and repeated setup/type/lint work; no physical attempt, owner audio use, invalid gate finding or evidence modification. Quota impact cannot be isolated from the shared account.
- **Correction / verification:** Locate files with rg, use scoped Git access and an isolated worktree; merge helper overrides before calling make_unit; explicitly add the CLI sibling path, and cover direct/isolated entry points. Complete npm check with the dependency-cache filesystem access resolved; no failed application tests were rerun. Full Python and npm results are in the v3a handoff. No new dependency or product change.
- **Independent-review findings and correction:** The first implementation trusted an ineligibility-basis label rather than reconciling scored IDs/eligibility with the frozen source inventory; reviewer reproduced an excluded crossing unit producing PASS with denominator 19 instead of 20. The implementation also replaced the original measured marker report with a generic placeholder on count inconsistency. Both were caught before publication. Reconcile the complete identity-bound source inventory, retain its denominator on mismatch, and preserve the original legacy-adapter marker check separately from invalid v3a views. Focused regressions cover the label bypass, missing/duplicate units, and original measured disagreement retention. These were agent scoring/reporting errors, not application defects; no actual recording was scored or gate credited.
- **Remaining risk / approval:** Exact-PCM long matching is intentionally restricted; noisy/ambiguous or unequal-rate practice evidence remains INCONCLUSIVE. Independent review and owner acceptance are separate. Owner authorized offline implementation/checks/normal push only; no capture, recording, playback, rendering, freeze or merge.

### A-040 - 2026-11-09 - Codex / Windows Desktop - noisy-step regression launcher

- **Status / attribution:** Confirmed agent test-harness setup error; no application, detector or practice replay failure.
- **What failed / evidence:** The new absent-fixture skip regression launched `python -m unittest test_long_correlation...` from the sibling directory. This host's isolated Python omits the working directory from imports, so that subprocess failed before running its target test. First full run: 128 tests, 127 passed and one launcher assertion failed; private `practice-d2-v3a-noisy-step-20261109/python-suite.txt` preserves it.
- **Agent-controlled cause / effect:** Assumed CWD importability despite the previously observed isolated runtime. Minor check/context time and one corrected offline suite invocation; no audio playback/recording/render, evidence modification, failed acoustic detection, denominator change or acceptance credit.
- **Correction / verification:** Use unittest discovery with an explicit sibling search directory and a single-test filter. The focused skip check then passed with the explicit absent-fixture reason. Final corrected suite and independent review are recorded in the noisy-step handoff; preserve the original failed log.
- **Usage / remaining risk:** Shared account usage is in the task tracker; exact incident cost is unavailable. Existing interior-audit quality thresholds and method-sensitivity uncertainty are reused unchanged, not calibrated confidence limits. No new physical test, threshold tuning, freeze or merge was authorized or performed.

### A-041 - 2026-11-09 - Codex / Windows Desktop - noisy-step integration and fixture checks

- **Status / attribution:** Confirmed agent integration/test-coverage errors found by independent review before publication; not capture/application defects.
- **Coverage failure:** Reused full-span exact-match coverage checks with narrower 3.018 s correlation templates. Complete first/last long units could consequently be rejected as uncovered. Bind each measured edge support by exact ID to its independently adjudicated full-unit continuous interval, require support plus/minus uncertainty inside that interval, and use those independent unit bounds only for coverage. No source-span extrapolation or endpoint correction is allowed. Step locations retain measured supports. Complete two-long-unit and missing/misbound/nonfinite/outside-support regressions verify the correction.
- **Fixture failure:** The external fixture regression originally skipped on any absent file before hashing the files present, potentially hiding a corrupted present artifact in a partial fixture. Hash every present file before considering absence; a partial-missing/corrupt regression now must fail. No actual fixture hash mismatch or private-evidence modification occurred.
- **Effect / verification:** Both errors were found before any latency acceptance or publication; original matching/practice numeric results were unaffected. Final targeted/full-suite and reviewer follow-up results are in the noisy-step handoff. Additional offline check time is shared account usage, not an isolated metered incident cost. No physical test, recording, playback, rendering, freeze, capture change or merge occurred.

### A-042 - 2026-11-09 - Codex / Windows Desktop - persistent timing and raw-reader validation gaps

- **Status / attribution:** Confirmed earlier agent analyzer/test-design defects identified in the owner's conditional independent review of 11d93b5; not application/capture failures.
- **Persistent-offset error:** prepare_units stopped symmetric widening at the next anchor but kept later units on the old fixed schedule. A persistent negative 80 ms shift could falsely credit a 5.98 s old-schedule publication whose true latency is 6.06 s. Carry each unit's nearest preceding long-anchor offset and measured uncertainty forward; widen both directions only within unresolved step brackets. Updated the old next-anchor test and added both-sign six-second regressions. No short-word matching or recording-clock correction.
- **Raw-reader validation gap:** Previous practice regressions used retained continuous WAVs and did not exercise the original chunk reader. Its exact count equality and overlap prohibition would reject preserved microphone evidence. Reproduce the prior audit's timestamped legacy windows, retain every continuous sample, represent bounded ordered overlaps, and allow only the exact audited 168-sample overrun bound to source/index hashes, track, sequence, rate and counts. Unknown count errors still fail. The raw CLI/native fixture regression verifies this path and original marker-result retention; no original evidence changes.
- **Verification / impact:** Targeted conditional tests pass; full results and independent follow-up are in the conditional-fixes handoff. Early execution of the old v3a expected-bound tests produced four assertions because they omitted the newly required 1 ms anchor uncertainty; expectations were updated to the specified arithmetic. No actual latency acceptance, freeze or false gate credit resulted. Quota changes are shared-account observations, not exact incident costs.

### A-043 - 2026-11-09 - Codex / Windows Desktop - native timing diagnostic assumptions

- **Status / attribution:** Confirmed agent diagnostic setup/ordering mistakes, not a decoder/capture defect.
- **What failed / evidence:** First raw timing diagnostic passed native gap/marker checks and 39 long matches, then assumed all 65 source units had preceding long anchors. microphone-000 is an initial short before the first long and correctly raised No preceding long anchor. A dependent fixture-manifest edit was then attempted despite that failed diagnostic and raised KeyError for the not-yet-written raw_microphone entry; it changed no file. An initial native metadata dump was also broader than needed and truncated; subsequent inspection used compact count/overlap summaries.
- **Correction / remaining risk:** Construct/pin the raw manifest independently. The regression retains all 65 units, explicitly reports the unbounded initial short and checks preparation of the 64 supported units only as diagnostics, never as a reduced acceptance denominator. The native reader/clock is valid; full-track acceptance remains blocked by that separate missing-anchor condition. The diagnostic count field was also renamed from frozen_denominator to source_denominator with the original annotation status retained, so its label cannot imply a freeze; earlier JSONs remain preserved. No future-anchor borrowing, short-word matching, setup credit, artificial freeze or publication integration was introduced. Failed diagnostics generated no audio and modified no preserved input; a successful complete diagnostic JSON is retained externally. Remaining first-short timing needs a separate owner decision, not an unrequested policy change.

### A-044 - 2026-11-09 - Codex / Windows Desktop - right-anchor prefix uncertainty

- **Status / attribution:** Confirmed agent timing-model defect in the first persistent-offset correction, caught by independent review before publication.
- **What failed:** Taking the right anchor's measured offset at its whole source utterance start excluded its unexamined 100 ms prefix from symmetric step widening. Reviewer reproduced a negative 80 ms step: source word start 10.01 s, template begins 10.1 s, nominal interval 9.929–9.931 s, publication 9.98 s incorrectly credited despite potentially preceding actual speech.
- **Correction / verification:** Keep persistent offset placement, but determine bracket uncertainty separately for each source endpoint against measured template supports. The right-anchor prefix keeps both-sided uncertainty; later measured endpoints retain only anchor uncertainty. Both-sign prefix/pre-speech regressions pass through the actual bounds entry point. Include every gap crossed by the complete endpoint uncertainty interval, rather than looking up only its nominal point; a near-gap start regression protects that guard. Final reviewed suite and follow-up disposition are in the conditional handoff.
- **Impact / remaining risk:** No actual recording acceptance or gate credit resulted. The earlier diagnostic JSON is retained and a reviewed JSON is generated separately; no original evidence changes. Source prefix timing is not certified by matching later template support. Shared quota changes cannot be assigned as an exact incident cost. No recording, playback, rendering, capture change, freeze, observer integration or merge.

## Claude Code (Sonnet 5.5) incidents

Per-session detail for Claude Code also lives in `agents/claude-session-failures/`; the entries below are the ones found by independent review.

### A-045 - 2026-11-09 - Claude Code / Windows Desktop - observer-to-session conversion widened only one side
- **Status / attribution:** Confirmed agent defect in `observer_session_map.py` (commit 3ed4d32), found by ChatGPT's independent review before any scored run.
- **What failed:** The conversion uncertainty was added to `u` only. The scorer reads a publication as lying in [observed - u, observed], so a symmetric +/- e error left the latest possible appearance unchanged; a nominal 5.995 s latency with e = 10 ms still counted as on time.
- **Agent-controlled cause:** I did not check which end of the interval the scorer treats as fixed before choosing where to add the error.
- **Impact:** No scored run or gate credit; the integration branch carried an optimistic conversion.
- **Evidence:** `analyze-bounds.py` `analyze_unit` (conservative uses `observed`, best uses `observed - u`); regression in `test_lead_and_session_map.py`.
- **Correction / prevention:** `observed = nominal + e`, `u = polling_u + 2e`; regression for the 5.995 s / 10 ms case. Offline tests only.
- **Owner approval:** Not required (offline); no gate change.

### A-046 - 2026-11-09 - Claude Code / Windows Desktop - overlap and overrun placement missed by my end-to-end check
- **Status / attribution:** Confirmed defect in Codex's `placement_interval` (it used only cumulative positive gaps); my end-to-end regression and my report ("no defect in Codex's code") did not exercise overlaps or audited overruns, so the claim was too strong.
- **What failed:** With chunk 2 timestamped 200 ms before the end of chunk 1, a word at continuous 10.5 s maps to 10.3 s, outside the returned [10.5, 10.5]; a publication at 16.4 s gave 5.9 s conservative latency instead of 6.1 s.
- **Agent-controlled cause:** My fixtures used gaps only; I reported absence of defects from the cases I had written.
- **Impact:** No scored run; found by review.
- **Evidence:** `gap_map` already recorded `overlap_before_samples` and `timestamp_displacement_samples`; regressions in `test_lead_and_session_map.py`.
- **Correction / prevention:** Earliest placement adds min(0, displacement), latest adds max(cumulative gap, displacement); gap-only tests unchanged. No new numeric threshold. Future "no defect found" statements must list the cases covered.
- **Owner approval:** Not required (offline).

### A-047 - 2026-11-09 - Claude Code / Windows Desktop - clock inputs and lead-marker time taken as arguments
- **Status / attribution:** Confirmed agent design defect in `observer_session_map.py` and the lead-marker path (3ed4d32), found by review.
- **What failed:** The lead-marker source time, the harness origin ticks and the QPC frequency were plain inputs; a wrong marker time shifts early units by the error and could flip their credit. Chunk hashes, session identity and the origin's constancy were not re-verified at the point of conversion.
- **Agent-controlled cause:** I treated values the evidence could supply as caller parameters.
- **Impact:** No scored run.
- **Evidence:** Tests for each mismatch in `test_integration_e2e.py` and `test_lead_and_session_map.py`.
- **Correction / prevention:** Marker source time is detected in the frozen source file (supplied value must equal it) and its detection uncertainty is added; the mapper verifies header, harness log, publication file, chunk rows, hashes, session and origin, and records them in the output. The origin is called the reconstructed effective origin, never a logged `clockOriginNs`.
- **Owner approval:** Not required (offline); the amendment sentence stays a marked proposal.

### A-055 - 2026-11-09 - Claude Code / Windows Desktop - end-chunk-only placement and unbound scored endpoints (c0eb03c)
- **Status / attribution:** Confirmed agent defects in my own fix c0eb03c, found by ChatGPT's independent re-review (conditional, two P1s) before any scored run. This entry was A-051 on its own branch and was renumbered to A-055 when the observer-validation branch was merged (97a904d), because A-051 was already used there.
- **What failed:** (1) The A-046 fix examined only the chunks at the two ends of an uncertain range; with overlaps the displacement is non-monotonic, so for chunks A 0-0.1/0-0.1, B 0.1-0.2 timestamped 0.02-0.12, C 0.2-0.3 and range 0.095-0.205 s the interval [0.095, 0.285] missed continuous 0.105 s, which maps to 0.025 s. (2) The scorer accepted adjudicated endpoints on the "timestamped-capture" label without checking them against the converted file from `observer_session_map.py`.
- **Agent-controlled cause:** (1) I fixed the case I had in front of me (a single overlap at an end chunk) and assumed monotonicity. (2) I verified the conversion step but did not carry that verification into the scorer, so the label was trusted.
- **Impact:** No scored run or gate credit; the integration branch carried a placement and a binding that were not safe.
- **Evidence:** Regression `test_middle_chunk_overlap_is_inside_the_range_interval`; binding regressions in `test_integration_e2e.py` (shifted time, changed u, absent id, mismatched origin, matching case passes).
- **Correction / prevention:** `placement_range` takes the minimum and maximum over every chunk the range intersects; the scorer requires the converted file, raw observer file and harness log, binds every credited endpoint by id, observed time and u (1e-9 s), and records the three SHA-256 values. No threshold changed. Offline tests only.
- **Owner approval:** Not required (offline); the amendment wording stays a marked proposal.

### A-056 - 2026-11-09 - Claude Code / Windows Desktop - conversion allowance floor and file-versus-raw check missing in 2831b67
- **Status / attribution:** Confirmed agent design gaps in my own commit 2831b67, found by ChatGPT's independent re-review before any scored run. This entry was A-052 on its own branch and was renumbered to A-056 at the merge (97a904d). ChatGPT's later review (head 49a1af9) found two further gaps in the regeneration check, logged in A-058.
- **What failed:** (1) The scorer accepted any conversion allowance of at least one counter tick, although the approved v3a procedure is 2 ms. (2) It checked endpoints against the converted publication file but never regenerated that file from the raw observer samples, so changing a word time in both the file and the endpoint passed every check.
- **Agent-controlled cause:** (1) I reused the converter's one-tick sanity floor as the scorer's rule. (2) I bound endpoints to the file and stopped, without asking what binds the file itself to the raw evidence.
- **Impact:** No scored run or gate credit.
- **Evidence:** Regressions in `test_integration_e2e.py`: 1 ms refused, 2 ms and 5 ms accepted; file and endpoint changed together, and a text-only edit, both make the track INCONCLUSIVE.
- **Correction / prevention:** `MIN_CONVERSION_U_S = 0.002` in the scorer (larger documented values stay valid); `regenerate_converted` rebuilds the file from `observer_raw` with the same code and the document's own parameters and requires equality (floats within 1e-9 s). Timing-only tests that invent endpoints skip just that regeneration step through `binding_fixture.without_regeneration`. Offline tests only.
- **Owner approval:** Not required (offline); the amendment wording stays a marked proposal.
### A-048 - 2026-11-09 - Claude Code (Sonnet 5.5) / Windows Desktop - observer validation run: quoting slip and a checklist step that cannot work
- **Status / attribution:** Two items, both confirmed. (a) My mistake: I started the observer with `Start-Process -ArgumentList` as an array, so `Live transcript` split into two arguments and PowerShell refused the parameter before any file was created. Retried once with a quoted command line, a few seconds lost, no output file affected. (b) Defect in the checklist (my earlier draft, `gate-3-windows-live-observer-plan-and-validation-draft.md` step 3): it says to read `origin_qpc` from the first line of `raw.jsonl` while the observer runs, but the observer opens the file with no sharing (`[IO.File]::Open(path, CreateNew)`), so no other process can read it until the observer exits. The overlay cannot be started with the observer's origin as written.
- **Impact:** The unscored validation run was stopped before Record and playback at the owner's rule to stop on a failing step. I killed the observer process (PID 47932) after about 45 s; its partial file is kept.
- **Evidence:** `observer-validation-1\raw.jsonl` (header plus 757 error lines, all "Transcript viewport element not found"), `observer-validation-1\launch-launch.txt`. Private, outside Git.
- **Correction / prevention:** Not fixed here (no code change without approval). Options: open the file with `FileShare.Read`, or print the origin to stdout/a side file. The viewport errors are unattributed: the Live screen may not have been open, or UI Automation may not expose the pane (Chromium accessibility). Not determined. **Follow-up correction (same day):** the Live screen exposes no `Live transcript` element in its "Ready to record" state (UIA tree: Document, Main, nav buttons, Recording controls, Start, status text, no transcript group), so the 757 errors before Record were expected and not evidence that UIA cannot reach the pane; my report implied a possible UIA problem without that check. Also the Meeting Scribe window was behind other windows, so its web content tree was nearly empty (13 elements) until the window was brought forward (50 elements, Chromium document exposed). Whether the pane is reachable once recording is not yet tested.
- **Owner approval:** No rerun without new approval.

### A-049 - 2026-11-09 - Claude Code (Sonnet 5.5) / Windows Desktop - validation run 2 played no audio (variable name clash)
- **Status / attribution:** Confirmed agent mistake in my run-orchestration script (kept in the session scratchpad, not in Git).
- **What failed:** PowerShell variable names are case-insensitive. I set `$a` to the assembly folder and later `$A = [AutomationElement]`, so `$a` became the AutomationElement type and `play-sources.ps1` failed at once (`ReadAllBytes`, path `...\System.Windows.Automation.AutomationElement\microphone.wav`). My script pressed Record anyway and waited on clock steps instead of checking that the playback process was alive, so the app recorded about 320 s of silence while the scripted scrolls ran. I only noticed at the end. The dry run had used a different variable and could not catch it.
- **Impact:** The planned ~15 min validation run produced no speech, no rows and no scrolling or virtualization evidence; about 9 min of owner-visible run time, no audio played, no gate effect. A rerun needs owner approval (repeat of an inconclusive test).
- **Evidence:** `observer-validation-2\playback-stderr.txt`, `actions.log` (play-sources started 19:06:39Z, process exited before the first scroll step), `raw.jsonl`.
- **Correction / prevention:** Use distinct names; abort before pressing Record if the playback process exits or its log folder does not appear within seconds of the ready file. Not rerun.
- **Owner approval:** Required for any rerun.

### A-050 - 2026-11-09 - Claude Code (Sonnet 5.5) / Windows Desktop - commit message heredoc failed
- **Status / attribution:** Confirmed, minor. My first `git commit -F -` with a PowerShell here-string treated the message as a pathspec and committed nothing, and the following `git push` published the unchanged `c0eb03c` as the new branch. Fixed by committing from a message file (`5f1522c`). No effect on content.

### A-051 - 2026-11-09 - Claude Code (Sonnet 5.5) / Windows Desktop - first rerun attempt aborted by my own foregrounding
- **Status / attribution:** Confirmed, minor; agent/test tooling. In the observer-validation-3 orchestrator attempt 1, bringing the app window to the foreground closed the Snipping Tool selection overlay I had opened earlier, so the screen-recording start failed and the script aborted before Record (as designed). No recording or playback had started. Fixed by moving the Snipping New, drag and Start steps into the orchestrator after foregrounding (attempt 2 ran the full 420 s). Log: `actions-attempt1-aborted.log` in the evidence folder.
- **Also noted (not mistakes, limits):** the script frames, not the mp4, were the screen-agreement evidence because the mp4 could not be decoded here and its shell duration (6:45) is shorter than the run (about 7:48); `launch-checkonly.txt` holds one line because of `Select -First 1`. My own wall clock for the task exceeded 20 minutes counting analysis; the run itself was under 15.
- **Correction / prevention:** order steps so foregrounding precedes opening any overlay; verify the recording is live before pressing Record.

### A-052 - 2026-11-09 - Claude Code (Sonnet 5.5) / Windows Desktop - four wrong or incomplete statements in my observer-validation-3 report
- **Status / attribution:** Confirmed; agent analysis errors, no effect on the app. Found when re-reading raw.jsonl and the code in the follow-up task.
- **What was wrong:** (1) I called the bounds "paragraph-level only". The app exposes every word as its own UIA Text element with its own bounds; `bounds_source: element` means that word element (all 1186 publications are single words). The paragraph fallback never applied. (2) I said the virtualization check failed because 165 rows were removed and never returned. `virtualization_evidence` passes or fails on returns and identity, not on never-returned rows: it returned 165 times, 164 with preserved identity and 1 not (`microphone|05:35`: "Copper Basket." came back as a different, longer row under the same track and displayed second). The 165 never-returned keys are rows that aged out of the app's rolling tree (about 18 rows) by the end. (3) I said the session map could not be produced. It can: `v3a_timing.load_views` with the ffmpeg decoder in `gate3-integrated-evidence\decoder` builds the valid gap maps (microphone 90 chunks, meeting 85) and `observer_session_map.py` converts all 1186 words. I had not looked for that loader. (4) I said the mp4 was not decodable; I had no decoder on PATH. Windows Media Foundation opens it (2522x1246, 6:45, H.264 and AAC, moov box complete).
- **Impact:** the owner received a wrong bounds description and a wrong cause for the check failure; one step (session map) was reported as unmet when it was feasible.
- **Correction / prevention:** corrected in the follow-up report and in the plan (proposal bullet). Check what the data actually contains before naming it, and search the repo for an existing loader before declaring a step impossible.

### A-053 - 2026-11-09 - Claude Code (Sonnet 5.5) / Windows Desktop - minor tool slips in the observer fix task
- **Status / attribution:** Confirmed, minor. A wrong COM class id in my volume-reading snippet (first read failed, fixed and read 0.10); a repository-wide grep that exceeded the 120 s limit (stopped, replaced by a scoped search); the first Python test run had the two environment variables unset (3 skips; rerun with both set: 215 tests, no skips). No evidence affected.

### A-054 - 2026-11-09 - Claude Code (Sonnet 5.5) / Windows Desktop - validation-4 and -5 ran on a reused app with the old transcript on screen
- **Status / attribution:** Confirmed; agent/test setup. Both short tests reused the app instance from validation-3, whose Live pane still showed the previous recording's rows. The first sample that found the viewport therefore already held 70 visible words, so under the revised rule both runs are INCONCLUSIVE (`result_status`), and validation-5 is not "the same conditions as the real run" (which uses a fresh profile). I noticed only when the corrected report ran on the data. Interval statistics are unaffected; the tree size and word counts differ from a fresh run.
- **Correction / prevention:** start every validation from a fresh app launch and profile, or confirm the pane is empty before starting the observer, and run the publications report right after the run, not only the interval script. Not repeated automatically; owner approval needed for another test.


> Renumbering note (merge of the observer-validation branch, 2026-11-10): the entries below were A-055 to A-059 on that branch; they became A-081 to A-085 here because A-055 to A-059 were already used on the integration-2 lineage. `docs/gates/gate-3-windows-mic-sample-count-allowance-proposed.md` (a pinned document, not edited) still cites the old numbers A-058 and A-059; read them as A-084 and A-085.

### A-081 - 2026-11-10 - Freeze process / Claude Code (Sonnet 5.5) - approved manifest had no scorer-format frozen inventory
- **Status / attribution:** Confirmed process gap; no individual blamed beyond the evidence. The owner-approved manifest listed only the UNFROZEN assembly annotations (`eligible: null`, pending audit) and the pinned `make-draft-annotations.py`, whose output is `frozen=false` with open decisions D1 to D7. The scorer needs a `frozen: true` inventory with a defined eligibility rule, and no signed eligibility rule existed. The scoring brief assumed a frozen inventory and a signed D1 definition.
- **Effect:** scoring of scored-run-2 stopped twice before any step ran (owner decisions needed); about 15 minutes of agent time and two owner decisions. Inventory was then generated from the pinned tool and flagged on a copy (Deviations 1 and 2 in the scored-run-2 result handoff).
- **Correction / prevention:** before the next freeze, list every scorer input (frozen inventory file, eligibility rule, marker source) in the manifest with its approval.

### A-082 - 2026-11-10 - Planner (owner-side brief) - false claim of an owner-signed D1 eligibility definition
- **Status / attribution:** Confirmed planner error, corrected by the planner the same day. The brief said the sign-off (SHA-256 5a8fb52b...) contained a signed D1 definition of eligible; the file holds only the listen-through statement. Found by Claude Code at step 0 by reading the file and the tool; no result was affected because scoring had not started.
- **Effect:** one extra stop and about 5 minutes of delay. **Correction:** the planner withdrew the premise and authorized Protocol section 2 plus the listen-through as the rule.

### A-083 - 2026-11-10 - Claude Code (Sonnet 5.5) / Windows Desktop - known-class gaps reached the scored run; minor scoring-session errors
- **Status / attribution:** Confirmed process gaps plus minor agent errors. (a) Hyphenated published word: `occurrence_matcher.py` aborts on a publication that is not one word position. The validation-3 dry run hit this and filtered such words in a dry-run-only script (`dry3.py` line 17), but the limitation was not carried into the real-run procedure or manifest; the dry run found it and it should have been caught there as a required step. Rehearsal-1 should not be expected to catch it unless its text had such a word (not verified). (b) Microphone chunk 47 (+648 samples, 13.5 ms): rehearsal-1 was only 60 s (about 12 microphone chunks) and could not expose a mid-run overrun; the pinned allowance is bound to the practice recording's chunk 32 and there is no general rule, a known risk that was not closed before the scored run. Neither rehearsal-1 nor the dry run could have caught chunk 47. (c) Agent errors in this session: a wrong plan hash fragment (fixed before hashing); one verifier invocation via `cmd /c` that ran nothing (retry logged); a wrong prediction that the affected unit would be UNIDENTIFIED (all 75 MATCHED).
- **Effect:** the microphone track is INCONCLUSIVE and the run gives no combined Gate 3 verdict; two owner-decision stops and about 1 hour of agent time. No data was lost.
- **Correction / prevention:** carry matcher limitations from dry runs into the manifest; define a general, pre-approved chunk-count tolerance rule or test a recording of at least full length before the scored run.

## Additional previously reported ChatGPT errors — provenance to verify

These were acknowledged in prior SRCB conversations but have not been cross-checked against their complete original transcripts in this backfill. They remain visible as **provisional**, not independently established application or process outcomes.

| ID | Date (PT) / agent | Reported agent error | Verification / follow-up |
| --- | --- | --- | --- |
| P-001 | Nov 3 / ChatGPT | Requested an unnecessary Windows preflight and treated an earlier `fb2d96c` test commit as outdated without sufficient justification, contrary to instructions to reuse valid evidence. | Retrieve original candidate/evidence comparison before classifying its cost or effect. |
| P-002 | Nov 3 / ChatGPT | Blurred the distinction between scoped QA recommendation of PR #48 and a formal GitHub PR approval, which the same connected author could not submit. | Confirm exact review attempts and GitHub status; PR remained draft/unmerged in the reported period. |
| P-003 | Nov 3 / ChatGPT | Communication implied that a Windows Codex assignment had been executed when GitHub instructions/comment publication was not a running device session. | Verify original wording; GitHub comment is not evidence that Codex started. |

## Credit and result impact — do not over-attribute

The owner-provided Windows Codex handoff reported **five-hour remaining 100% -> 81% and weekly remaining 31% -> 28%** during the recent closure work, while two-track acceptance remained **NOT PROVEN**. The owner also reported some repeated attempts using approximately 5% of the five-hour allowance each. These observations are **account-level balance changes**, potentially shared or rounded, **not verified per-attempt token costs**; they belong in [the usage tracker](agent_task_allocation.md) when reconciled. The material result was wasted owner interactions and test attempts, not a proven failure of durable recording.

## Claude-agent incidents (November 8 backfill; canonical IDs reconciled November 10)

Current main `2f979c8` has IDs through A-091. Historical labels CL-001..CL-007 map respectively to A-092, A-026, A-093, A-094, A-095, A-096 and A-097. A-026 below is the single canonical register entry for the previously proposed r2 rate-projection event; CL-002 is an alias, not a second incident. The first seven entries are confirmed by recorded agent admission or artifacts; the private source histories were not independently re-read and usage costs are not measured.

Session labels are file-local: `review-usage-logging.md:S-01` below abbreviates `2026-11-08-sonnet-5-5-pr74-review-usage-logging.md:S-01`; it is distinct from `2026-11-08-sonnet-5-5-pr74-gate3-r3-pace.md:S-01` (A-026). The review/usage self-audit maps S-01→A-098, S-02→A-094, S-03→A-099, S-04→A-100, S-05→A-101, S-06→A-102 and S-07→A-103. See the [file-scoped audit](claude-session-failures/2026-11-08-sonnet-5-5-pr74-review-usage-logging.md) for each reported cause, effect and evidence limitation.

| ID | Agent | Failure and impact | Status |
| --- | --- | --- | --- |
| A-092 | Claude Code (Opus session) | Reversed the best-case and conservative latency endpoints in spread Option B; caught by ChatGPT QA before the rule took effect. | Corrected in the amendment and tests. |
| A-026 | Claude Code (Opus session) | Pre-flight for the r2 render assumed the `-15%` rate slowed speech linearly (projected 138.9 wpm); measured 127.93 wpm. The owner ran a render that missed the pace band. Canonical A-026 event previously proposed on PR 74; also `2026-11-08-sonnet-5-5-pr74-gate3-r3-pace.md:S-01` and commit `2949d86`. | Corrected by the r3 rate plan; formula now labeled an extrapolation. |
| A-093 | Claude Code (Opus session) | Treated the pre-flight formula as reliable for r3: it projected about 147 wpm for the meeting at `+30%`, measured 164.26. Passed the band, but the formula underestimates large rate changes. | Confirmed projection error; formula limits remain. The later owner r3 listen-through sign-off is recorded in `docs/gates/gate-3-windows-r3-listen-through-signoff-20261108.md`; it does not validate the predictive formula. |
| A-094 | Claude Code (Sonnet, Mac review) | Reported usage as `unavailable` without trying `get_usage`. | Corrected; rule recorded in the usage-measurement memory. |
| A-095 | Claude Code (Sonnet, Windows) | Self-reported: over-broad rate-literal test, wrong test expectation for a clipped unit, a patch-script quoting error, a too-small zero count in a join test, and a re-measure into a new derived folder without being asked. | Fixed in tests or process; no thresholds changed. |
| A-096 | Claude Code (Opus session) | Asserted without evidence that Codex "tends to make more mistakes"; this register is lopsided because only ChatGPT/Codex were required to log. Also read the logging rule too narrowly. | Corrected 2026-11-08 after the owner's challenge; scope widened above. |
| A-097 | Claude Code (Opus session) | Repeated an unverified headphones claim and gave setup advice based on it. **Owner report/correction dated 2026-11-09** says no headphones existed on November 7 or were in use; the Realtek endpoint record establishes the selected audio endpoints, not what the owner wore. Effect: wrong guidance, an unnecessary headphones guard, and owner confusion. | Confirmed. The `play-sources.ps1` guard is fixed: `-HeadphonesWorn` / `-OwnerChoseSpeakers` are absent. The D2 draft correction at line 42 is dated November 9, but its misleading line 50 still lists headphones; that contradiction remains open in `docs/gates/gate-3-windows-d2-capture-equivalence-draft.md`. This task records the status, without changing that draft or the script. |


| A-098 | Nov 8 / Claude Code, Sonnet 5.5, Mac | `review-usage-logging.md:S-01`: skipped the required start usage reading for the PR 74 review; no recoverable start balance or observed decrease, and owner correction was needed. | **Confirmed (agent admission).** End reading taken after challenge; start remains unavailable. Source: file-scoped audit; no private history replay. |
| A-099 | Nov 8 / Claude Code, Sonnet 5.5, Mac | `review-usage-logging.md:S-03`: presented a fresh branch/PR per usage row as necessary, causing an unnecessary branch and owner correction. | **Confirmed (agent admission).** Prior audit reports branch deleted and no PR opened. This does not waive approval: use an authorized branch/PR, or propose an uncommitted row. The original disputed row was committed on main at `agents/agent_task_allocation.md:75` in `2f979c8`. PR #83 corrects that row, now at `agents/agent_task_allocation.md:83`, with provenance retained (A-100). |
| A-100 | Nov 8 / Claude Code, Sonnet 5.5, Mac | `review-usage-logging.md:S-04`: unsupported end time “About 20:33 PT (observed),” effort “default,” retries “0,” and mixed-time allowance readings overstate precision in a row **committed on main**, `agents/agent_task_allocation.md:75` at `2f979c8`. | **Confirmed artifact and agent admission.** PR #83 corrects the original inaccurate cells in the row now at `agents/agent_task_allocation.md:83`: unsupported end time, effort and retries are withdrawn, unobserved values marked unknown, and allowance readings distinguished by observation time. The original error at historical line 75 in `2f979c8` remains recorded here for provenance. |
| A-101 | Nov 8 / Claude Code, Sonnet 5.5, Mac | `review-usage-logging.md:S-05`: `$B:scripts` was interpreted as a zsh substitution modifier; first review command failed, costing one tool call and a short delay. | **Confirmed (agent admission).** Reissued with a quoted/braced path; no data loss reported. |
| A-102 | Nov 8 / Claude Code, Sonnet 5.5, Mac | `review-usage-logging.md:S-06`: “no P1” review report omitted that truncated/unread files were outside coverage. Potential false assurance; no defect in those unread files established. | **Provisional**, based on the prior self-audit, not an independent replay. Limit the conclusion to render/measure/assemble/verify/test_units paths; broader review remains unsubstantiated. |
| A-103 | Nov 8 / Claude Code, Sonnet 5.5, Mac | `review-usage-logging.md:S-07`: claimed another outside-Git memory entry relied on usage numbers without reading that entry; inferred from its index. Possible misleading memory guidance, impact unknown. | **Provisional**, prior self-audit only. Dependency claim remains unverified; do not reproduce private memory contents or silently treat it as confirmed. |
| A-104 | Nov 12 / Codex, GPT-6, Windows | Windows dev-config search excluded directories only by literal names and still enumerated config-like filenames inside `srcb` gate evidence folders. No file contents were opened or changed. | **Confirmed (agent admission).** Stopped searching `srcb`; later searches excluded it. Eligible dev configs remain unlocated. |
| A-105 | Nov 12 / Codex, GPT-6, Windows | During the seeded dev-assets run, Ctrl+C was not issued until after the Qwen model `.part` had grown to 553,898,124 bytes, exceeding the requested few-hundred-MB download stop threshold. | **Confirmed (observed file size).** Interrupted the run and removed only `C:\Users\bchen\scrb-dev-assets\models\llm\Qwen3.5-9B-Q4_K_M.gguf.part`; no source seed or protected folder changed. |
| A-106 | Nov 12 / Codex, GPT-6, Windows | Issued an unintended second invocation of `scripts/dev-assets.sh` while trying to obtain a duration; sandbox denied it immediately, so it made no writes. | **Confirmed (agent admission).** No repeat was made; the original run duration is reported as approximate because its stopwatch process was interrupted. |

## Explicit exclusions: do not assign blame without evidence

- The AMI scorer's generic `INCONCLUSIVE_PENDING_ALIGNMENT_AUDIO_AND_COMPLETENESS_REVIEW` label is a designed evidence-signoff step, not an SRCB transcription failure; the wrong **path** is logged in A-003.
- A 24.58% final WER is a genuine product-quality concern, not proof an agent caused the recognition errors. Only **how the result was presented** is logged in A-005.
- The earlier ~165 s microphone-text gap was traced to muffled/unintelligible input on the saved track; a transcription/software failure was not demonstrated.
- Interrupted one-hour processing, the Windows FFmpeg/awk build issue, and historic four-hour live failures have not been shown to be **agent-induced** from the evidence reviewed here. Do not count them as self-induced without a documented cause.

### A-057 - 2026-11-09 - Claude Code (Sonnet 5.5) / Windows Desktop - integration-2 branch: test and edit mistakes caught before commit
- **Status / attribution:** Confirmed; agent.
- **What failed:** (1) a bulk scripted edit wrote a real newline into a string and broke `test_observer_publications.py` (syntax error); (2) a phases test expectation and two CLI/stop tests ignored the new `other` phase key; (3) a slow-word test hid a repeated sentence, which makes later repeats UNIDENTIFIED; (4) a junk assertion line was left in; (5) my new header-hash test used a header whose origin differed from the publication file, so it failed in the full run.
- **Agent-controlled cause:** Edits made without asserting each landed and without checking the matcher's conservatism or the new dictionary keys first.
- **Impact:** Extra test cycles (the full suite takes about 3 minutes). Nothing reached a commit, a recording or the owner. Credit not measured.
- **Evidence:** Test output of the runs on this branch before the commit.
- **Correction / prevention:** Each fixed and the full suite rerun green. Real-data finding on the observer-validation-3 converted file (old 1 ms allowance, header hash taken from the `load_raw` header) is a property of that older file, handled by hashing only the header fields that exist in the first line.
- **Owner approval:** Not required.

### A-058 - 2026-11-09 - Claude Code (Sonnet 5.5) / Windows Desktop - regeneration ignored the observer's own validity; Speaker labels not mapped (49a1af9 and earlier)
- **Status / attribution:** Confirmed agent defects in my own commits, found by ChatGPT's independent review of 49a1af9 before any scored run.
- **What failed:** (1) `regenerate_converted` rebuilt the publications but never looked at the rebuilt report's `validation_pass`, so a run that was INCONCLUSIVE because words were already visible in the first found sample could still be scored PASS. (2) The observer mapped only the labels You and Meeting; the app labels the meeting track Speaker N or Speaker ? when diarization works, so those rows were silently ignored, and a test even asserted that Speaker 3 is ignored. (3) `interval_statistics["first_observed_words"]` counted observer-published word positions under a name that suggested scored words.
- **Agent-controlled cause:** (1) I made the report decide validity for the observer tool but did not wire that decision into the scorer. (2) I took the labels from the early practice data instead of the app source (`labelFor` in `livePass.ts`), and wrote a test that encoded the assumption. (3) Loose naming.
- **Impact:** No scored run or gate credit; a diarized meeting track would have scored zero publications, and an invalid run could have passed Layer A.
- **Evidence:** New tests that fail on 49a1af9 and pass after: the already-visible first-sample end-to-end test, the Speaker 1 / Speaker ? meeting end-to-end test, the unmapped-label tests, and the label-change-between-samples test. Retained real data (validation-3, -4, -5) only ever showed You and Meeting, so the label gap could not appear there.
- **Correction / prevention:** The scorer rejects the track (INCONCLUSIVE) when the regenerated report's `validation_pass` is false; `track_for_label` is the one place a label becomes a track (You is microphone; Meeting, Speaker ? and Speaker N are meeting); a row with words under any other label is reported (count and labels) and makes the run INCONCLUSIVE; the statistic is now `published_word_positions`, with the scorer reporting `observer_u_summary` for scored endpoints. Offline tests only.
- **Owner approval:** Not required (offline).

### A-059 - 2026-11-09 - Claude Code (Sonnet 5.5) / Windows Desktop - a label word inside a row opened a phantom row (64e3d03)
- **Status / attribution:** Confirmed agent defect in my own commit 64e3d03 (the "one label rule"), found by the owner reading `walk_rows()` and by ChatGPT's review, before any scored run.
- **What failed:** `walk_rows` recognised You, Meeting, Speaker ? and Speaker N anywhere in the element list. In the live tree every word is its own Text element, so a transcript word equal to a label (for example "You are here") started a new row without a time stamp; the following words were dropped and the first-sample visible-word count could read 0 while 3 words were visible. The same flaw hid an unmapped-label row whose words contained "You".
- **Agent-controlled cause:** I unified the label rule in one function but kept recognising labels without header context, and my fixtures were paragraph-level (one element per row of words), not the per-word elements the app really exposes, so no test could hit it.
- **Impact:** None on retained data: validation-3 regenerated with the corrected parser gives word-for-word the same 538 microphone and 648 meeting publications. No scored run or gate credit was affected.
- **Evidence:** `test_observer_publications.RowHeaderContext` (7 of 9 fail on 64e3d03) and the end-to-end `test_already_visible_you_are_here_first_sample_row_is_inconclusive_not_pass` (fails on 64e3d03 with `0 != 3`) pass after the fix. While testing, two of my new test expectations were wrong (an unsplit "Speaker 2" element is split into words; a stray element placed after a row is read as that row's word) and were corrected before commit.
- **Correction / prevention:** A label is a row header only when the next non-empty element is a time stamp (same rule for unmapped-label detection); matching stays case-sensitive; fixtures now use per-word elements with space separators. New report-only `unattributed_text_elements` counts viewport text that belongs to no recognised row. Known limit: an unrecognised word directly before a time-like word inside a row is read as an unmapped header (the run becomes INCONCLUSIVE, the conservative direction).
- **Owner approval:** Not required (offline).

### A-060 - 2026-11-09 - Codex-written matcher tokenizer stopped the track on real displays; found late by Claude Code (Sonnet 5.5)
- **Status / attribution:** Defect in Codex-written `occurrence_matcher.py` (`normalize_words`, `\w+`), found late by me during the validation-3 dry run, not by the earlier matcher tests (invented words only). Also a review gap on my side: I had not run the matcher on real displayed words before.
- **What failed:** (1) A displayed `Lantern's` / `rocket's` normalized to two tokens and the matcher raised, which stops the whole track. (2) A symbol-only element (`>>`, 2 in each of validations 4 and 5) normalized to zero tokens and raised the same way.
- **Impact:** None on a scored result (no scored run). Had the real run shown such a display, that track would have gone INCONCLUSIVE, a systematic non-credit.
- **Evidence:** 4 of 5 new apostrophe tests fail on f06a5c3. Note for the record: the source pack contains no apostrophes (only trailing periods); `Lantern's` and `rocket's` come from the recognizer (source `lanterns`, `rockets`), so under the fix they are one token that does not match the source word and the word is not credited, which is the correct reading.
- **Correction / prevention:** An internal apostrophe (straight or curly) is part of one token on both sides; symbol-only elements are skipped (they stay in the converted file); a display of two or more tokens (hyphen, `3.5`) still raises, now naming the id and text. Not seen in real data (validations 3 to 5). Offline tests only.
- **Owner approval:** Not required (offline).

### A-061 - 2026-11-09 - Scorer ignored the annotation's acoustic-end spread (Codex code); my first classifier passes mislabelled units - Claude Code (Sonnet 5.5)
- **Status / attribution:** (1) Defect in Codex-written `v3a_timing.prepare_units`: it used one nominal endpoint plus the anchor uncertainty and dropped the annotation's earliest/latest end. I reported it as D6 only after the dry run, not when I reviewed the file earlier. (2) My own first versions of `classify-unidentified.py` mislabelled units (row windows too wide, rows of neighbouring units counted); corrected before any figure was reported.
- **Impact:** None on a scored result (no scored run). A real run would have had bounds up to the source spread (5-85 ms) too narrow.
- **Evidence:** New regression fails on a2e8658 (microphone-005 end interval [50.349, 50.351] there, [50.344, 50.356] now; end-to-end test 0.0 != 0.075).
- **Correction / prevention:** Spread now comes from the frozen annotation (`attach_source_spread`), both bounds, fail closed for source-timed units. Classifier rules were rerun on the same raw data until each label matched the row text. Still open: classifier has no repo test.
- **Owner approval:** Not required (offline).

### A-062 - 2026-11-09 - Wrong claim that the unit spreads cover an independent energy rule (D2 handoff) - Claude Code (Sonnet 5.5)
- **Status / attribution:** Confirmed, mine. In the paused handoff I wrote that the annotations' earliest/latest end values "already cover the 10 ms/10% rule except by up to 5 ms on one clip". I had compared the energy ends with the amendment's 100 ms limit, not with each unit's own spread, and I had not tabulated per-unit misses.
- **Impact:** None on a score. It would have led the owner to accept a D2 tolerance rule that the retained spot-check does not satisfy.
- **Evidence:** `spotcheck-energy-ends.py` now prints the per-unit result of the proposed rule: 10 ms/10% passes 0 of 12 (energy end earlier than the annotated end by 10-100 ms, outside spreads of 10-25 ms by up to 95 ms), 20 ms/1% passes 5 of 12, the measurement's own 5 ms/3% rule 12 of 12 (not independent).
- **Correction / prevention:** Handoff sentence corrected in place; the proposal is stated with these counts. Compute the stated rule per unit before describing coverage.
- **Owner approval:** Not required (offline).

### A-063 - 2026-11-09 - D4 document claimed an enforcement that did not exist; D6 binding gap; D2 tolerance overreach - Claude Code (Sonnet 5.5)
- **Status / attribution:** Confirmed, mine, found by ChatGPT's review of a35c4bd (and by me while closing it). (1) The D4 calibration document said a track with a step inside a template "stays INCONCLUSIVE (the current rule)". `long_correlation.py` only checks that three correlation peaks are unique and `v3a_timing.py` gave any such anchor the calibrated uncertainty; nothing enforced it. I had not read the acceptance path before writing the sentence. (2) The D6 endpoint binding I added checked endpoint values against the converted file but not that outcome, identity or assignment came from the matcher. (3) The paused handoff proposed an energy-rule tolerance and called re-measurements "independent"; both were extrapolation from 12 clips. Smaller slips while fixing these, all caught before commit: a draft provenance note had a garbled short commit hash I had typed (removed, full SHA kept), a draft sentence about which utterances drive rule C was unverified (removed), and one new test assumed the gap event sat at the wrong time (test fixed, not the code).
- **Impact:** None on a score (no scored run). A real run would have credited anchors with a template across a dropout (errors of 54-163 ms in simulation against a reported 13-17 ms), and a hand-edited unit list.
- **Evidence:** `test_template_step_free.py`; `test_hand_edited_unit_assignments_that_differ_from_the_matcher_output_are_rejected`; `docs/gates/gate-3-windows-d4-correlation-calibration-proposed.md` section 4; `docs/handoffs/2026-11-09-d6-matcher-binding.md`; `docs/gates/gate-3-windows-d2-energy-rule-sensitivity-20261109.md`.
- **Correction / prevention:** Step-free condition enforced from the chunk-timestamp gap map and detected steps, failing closed, with its blind spots listed; matcher output hash bound and compared; energy-rule results recorded as sensitivity evidence only. Read the code path before stating that a rule is enforced. Renumber at merge if another branch used A-063.
- **Owner approval:** Not required (offline).

### A-064 — 2026-11-09 — Claude Code (Sonnet 5.5) / Windows Desktop
- **Status / attribution:** Confirmed; agent (design of my own earlier rule).
- **What failed:** The step-free rule I added in the previous task (A-063) turned one failed anchor into a whole-track timing INCONCLUSIVE. On the practice meeting track one real 210 ms dropout (inside the template of meeting-024) would have wasted a 30-minute scored run. I stated it as an enforced "fail closed" without checking whether any document required a track-wide failure; none does (code-only, inherited from `step_bounds`). While fixing it, my first track gate (minimum 4 valid anchors) and the new 30 s distance rule broke three existing synthetic-fixture tests, caught by running them before commit; and two inline helper scripts failed on quoting/path handling (no effect on the product).
- **Impact:** None on a score (no scored run). It would have cost a scored run.
- **Evidence:** `v3a_timing.py` (`excluded_anchors`, `track_anchor_gate`, `unexplained_brackets`, `unit_timing_gap`); `test_template_step_free.py` (`TestPerAnchorExclusion`); `docs/gates/gate-3-windows-d4-correlation-calibration-proposed.md` section 5.
- **Correction / prevention:** Per-anchor exclusion with unit-level INCONCLUSIVE for timing; track-level failure kept only for marker disagreement, no lead or trail anchor, unvalidated majority and too few valid anchors. Constants (30 s, 75%, 4) await owner approval. Before calling a rule required or fail-closed, grep the protocol and amendment text for it. Two legacy fixtures were adjusted (anchor moved within 30 s; unexplained-bracket check patched in the step-widening arithmetic test).
- **Owner approval:** Required for the proposed constants before a scored run; not required for the offline code.

### A-065 — 2026-11-09 — Claude Code (Sonnet 5.5) / Windows Desktop
- **Status / attribution:** Confirmed; agent (design of the A-064 follow-up, found by independent review).
- **What failed:** My per-anchor exclusion (A-064) still had defects the ChatGPT review found: TIMING-INCONCLUSIVE units got best = +infinity, so they could make Layer A a definitive FAIL and Layer B FAILURE OBSERVED although a unit with unsupported timing is not a demonstrated late publication; excluding the anchors around an unexplained offset excursion erased the evidence, so agreeing survivors re-credited the units inside it; the first-long-anchor reach check was satisfied by the lead marker; scored words overlapping a recorded gap kept finite intervals; anchors farther than the original neighbour added no uncertainty; the count gates (75%, minimum 4, majority unvalidated) were track-level where unit coverage suffices; and I weakened two existing tests to make my change pass without stating what coverage that lost.
- **Impact:** None on a score (no scored run). Would have misreported Layer A/B on a real run.
- **Evidence:** `analyze-bounds.py` (`analyze_unit`), `v3a_timing.py` (`unexplained_intervals`, `unit_timing_gap`, `capture_event_overlap`, `prepare_units`), `test_timing_coverage.py`, `docs/gates/gate-3-windows-d4-correlation-calibration-proposed.md` section 5, amendment rule 8.
- **Correction / prevention:** Proposed credit rule (best-case credits, conservative does not), interval memory, gap-overlap rule, measured drift bound, count gates removed, scoring-path regressions; edited tests listed with the coverage that changed. When a test must be edited to fit a change, say what it covered before and add an end-to-end replacement. Constants remain proposed, owner approval pending.
- **Owner approval:** Required for the credit rule, the 30 s reach and the drift bound before a scored run.

### A-066 — 2026-11-09 — Claude Code (Sonnet 5.5) / Windows Desktop
- **Status / attribution:** Confirmed; agent (A-065 follow-up defects found by ChatGPT's final review of 9cb5dab, plus my own test-authoring slips).
- **What failed:** (1) `_template_event_ids()`/`_unexplained_pairs()` treated any chunk-timestamp event in an anchor's template as explaining the anchor's offset change, whatever its size, so an -80 ms excursion at an anchor that also held a 5 ms logged gap vanished. (2) I replaced rule 6's "uncredited in both bounds" for gap-overlap units with a best-case credit (TIMING-INCONCLUSIVE) without a recording check. (3) A step in the D4 document had a Python dict printed into it ("75{'drift': ...}hare", a `% s` swallowed by a format call in a heredoc). (4) While writing the regressions: wrong anchor offsets in one test and a missed `gap` argument in `score()`; caught by the first run, before commit.
- **Agent-controlled cause:** Existence-of-event test instead of a size comparison; a departure from the amendment text I had labelled but should have asked about; unreviewed generated doc text.
- **Impact:** None on a score (no scored run). (1) would have credited units inside a real excursion; (2) would have turned an unverified capture limitation into best-case credit.
- **Evidence:** `v3a_timing.py` (`step_event_sizes`, `_explained`, `_unexplained_pairs`, `verify_word_capture`), `analyze-bounds.py` (CAPTURE-LIMITED), `test_timing_coverage.py`, `test_v3a_timing.py` (two tests changed from best-case credit to uncredited), D4 document line 62.
- **Correction / prevention:** Events explain a change only up to measured size plus both anchor uncertainties; rule 6 restored with a decoded-recording check (verified -> rule 8, else CAPTURE-LIMITED, uncredited in both bounds, kept out of FAILURE OBSERVED); regressions for each branch; document line restored and `grep "{'"` over docs found no other corruption. Constants stay proposed, owner approval pending.
- **Owner approval:** Required for the rule 6 check, the credit rules, the 30 s reach and the drift allowance before a scored run.

### A-067 — 2026-11-09 — Claude Code (Sonnet 5.5) / Windows Desktop
- **Status / attribution:** Confirmed; agent (follow-up to A-066, found by ChatGPT's confirmation of 0520f01, plus two slips of mine in the fix and the preflight task).
- **What failed:** (1) My A-066 rule 6 check ran only on units that survived the timing exclusion, so a word crossing a recorded gap during an excursion could still get best-case credit unverified. (2) `verify_word_capture` checked events up to one frame after the measured end. (3) A local variable `evidence` shadowed the function parameter of the same name in `analyze-bounds.py`. (4) While fixing (1) I left a debug `import sys` inside the function, which made `sys` local and raised UnboundLocalError (caught before commit). (5) I ran `npm run check` in parallel with the Python suite; one storage test failed with EBUSY on a temp file and passed on a rerun alone.
- **Agent-controlled cause:** Rule 6 applied after the exclusion step instead of before rule 8; a tolerance not in the rule text; a careless local name; debug code in the scoring function; parallel runs sharing the machine.
- **Impact:** None on a score (no scored run). (1) could have credited unverified words; (5) cost one extra `npm run check` (about 40 s).
- **Evidence:** commits b97fac0 and 01bd9c1; `test_timing_coverage.py::TestExcursionWithRecordedGap`, `test_v3a_timing.py::TestWordCaptureEventBoundary`.
- **Correction / prevention:** Placeable timing-excluded units get the rule 6 check first (unverified -> CAPTURE-LIMITED, verified -> rule 8); events at or after the measured end are skipped, no tolerance; local renamed `capture_evidence`; debug lines removed; checks now run one at a time. Constants stay proposed, owner approval pending.
- **Owner approval:** Required for rule 6, rule 8, the 30 s reach and the drift allowance before a scored run.
### A-084 - 2026-11-10 - Claude Code (Sonnet 5.5) / Windows Desktop - allowance-proposal drafting: wasted search, wrong first method, blindness exposure
- **Status / attribution:** Confirmed; agent.
- **What failed:** (1) Searched four sibling repo copies and issued a whole-filesystem `find /` before the owner stopped it ("STOP WASTING CREDITS"); the work was for this repo only. (2) First sample-count method (Ogg granule positions) reported zero mismatches and did not reproduce the audited chunk 32, so it was discarded and the count rerun with the retained ffmpeg. (3) Tailing `agents/agent_task_allocation.md` displayed the scored-run-2 usage row, exposing the provisional meeting-track outcome and microphone INCONCLUSIVE during a drafting task that required blindness to outcomes.
- **Agent-controlled cause:** Did not read the project path from the instructions before searching; chose a method without checking it against the known audited value first; tailed a file known to contain outcome summaries.
- **Impact:** A few minutes and a modest slice of the 5-hour allowance. No latency, recurrence or per-unit result was seen; the exposure is disclosed in the proposal (section 1).
- **Evidence:** `docs/gates/gate-3-windows-mic-sample-count-allowance-proposed.md` sections 1 and 2.
- **Correction / prevention:** Validate any new measurement against a known value first; avoid reading usage and register tails in blind tasks (use targeted greps of the needed row only).
- **Owner approval:** Not required.

### A-085 - 2026-11-10 - Claude Code (Sonnet 5.5) / Windows Desktop - allowance proposal paired latency bounds the wrong way
- **Status / attribution:** Confirmed; agent (caught by independent review).
- **What failed:** The first draft of the sample-count allowance proposal said an overrun leaves the conservative latency unchanged and lowers best-case latency by up to 13.5 ms. The code (`analyze-bounds.py:29-30`) computes conservative latency from `earliest_acoustic_end_s` (the lower placement bound) and best-case from `latest_acoustic_end_s`, so the reverse holds: conservative latency can rise by up to 13.5 ms and best-case is unchanged.
- **Agent-controlled cause:** Reasoned about which bound feeds which latency instead of reading the pairing in code before writing the arithmetic.
- **Impact:** A wrong favourable-direction claim in a proposal; caught before any approval, pin or rescore. No result affected.
- **Evidence:** earlier commit b3c5f42 of `docs/gates/gate-3-windows-mic-sample-count-allowance-proposed.md`; corrected in the rewrite (section 5).
- **Correction / prevention:** Confirm the endpoint pairing in the consuming code before stating any directional claim; proposal now cites `analyze-bounds.py:29-30`.
- **Owner approval:** Not required.

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

### A-068 — 2026-11-10 — Claude Code (Sonnet 5.5) / Windows Desktop
- **Status / attribution:** Confirmed; agent tooling.
- **What failed:** (1) The commit "docs: D4 table and text ... freeze-surface list gains run-time binding section" (4d41ae1) contained only the D4 change: my Python edit of the freeze-surface list raised a unicode-escape SyntaxError (a Windows path with `\U` inside a normal string) and I ran `git commit` after it without checking, so the message overstated the commit. (2) I began reading files in the session's default worktree, which is not the branch under review (the branch lives in the scrb-scoring-fixes worktree), before noticing. (3) The first `npm run check` failed once with an EPERM temp-folder rename in packages/storage (Windows file lock; unrelated to changed files).
- **Agent-controlled cause:** (1) chained commit after an unchecked failing step; (2) did not check `git worktree list` first; (3) environmental, same family as the earlier EBUSY.
- **Impact:** No wrong content shipped: the freeze-surface edit was redone in d13e9d3, the pin; the misleading message stays in history. A few minutes lost; one npm rerun.
- **Evidence:** commits 4d41ae1 and d13e9d3; npm rerun exit 0 (52 files, 819 tests passed).
- **Correction / prevention:** use `&&` after editing scripts and check the diff before committing; confirm the worktree for the branch first.
- **Owner approval:** not required.

### A-069 — 2026-11-10 — Claude Code (Sonnet 5.5) / Windows Desktop
- **Status / attribution:** Confirmed; agent tooling.
- **What failed:** (1) The same chained-after-failure mistake as A-068 happened again: a Python edit with a Windows path in a normal string raised a unicode-escape SyntaxError, I used `;` before `git commit`, and the commit 9ad8714 contained the runbook without its endpoint-path fix and without the freeze-list change (redone in e27b274, the pin). (2) Earlier in the task my test edits wrote backslash escapes that the shell layer altered, which produced a broken test file (SyntaxError) and a test manifest without newlines; fixed before any commit. (3) I first made the orchestrator wait for the playback to end, which would have made the 60 s rehearsal run 420 s; reverted to validation-5's stop at RecordSeconds before the pin.
- **Agent-controlled cause:** (1) did not apply the A-068 prevention (`&&`, check output); (2) escape handling not checked before writing; (3) changed behaviour without checking the rehearsal case.
- **Impact:** No wrong content in the pin; misleading commit message on 9ad8714 stays in history. Several minutes lost.
- **Evidence:** commits 9ad8714 and e27b274; 346 Python tests OK.
- **Correction / prevention:** write files with the Write/Edit tools instead of inline Python with Windows paths; stop on a failed step before committing; check the diff stat before every commit.
- **Owner approval:** not required.

### A-070 — 2026-11-10 — Claude Code (Sonnet 5.5) / Windows Desktop
- **Status / attribution:** Confirmed; agent tooling.
- **What failed:** In the first draft of the run-scored-run.ps1 edit, a message string contained `$appPid:`, which PowerShell reads as a scope-qualified variable; the parse check failed. Caught by the parse check before any commit. Also read the wrong worktree first (the default one lacks the script) before running `git worktree list`.
- **Agent-controlled cause:** string interpolation not checked while writing; worktree not confirmed first (same as A-068 item 2).
- **Impact:** None shipped; a few minutes.
- **Evidence:** parse check output before commit 528fae3; fix `${appPid}:`.
- **Correction / prevention:** parse every edited .ps1 before committing; run `git worktree list` first.
- **Owner approval:** not required.

### A-071 — 2026-11-10 — Claude Code (Sonnet 5.5) / Windows Desktop
- **Status / attribution:** Confirmed; agent-authored runbook defects found in the rehearsal.
- **What failed:** (1) Runbook step 9 (playback dry run) omits `-OutFolder`, which play-sources.ps1 requires even for a dry run; the command as written throws "-OutFolder is required". (2) Runbook step 18 names the decoder ffmpeg.exe for the first-video-frame check, but that build has no image or rawvideo muxer and cannot extract frames. (3) I did not test either command when writing the runbook. (4) Minor: I created and then removed an empty scratch folder inside the rehearsal evidence folder (no evidence touched).
- **Agent-controlled cause:** runbook commands written without running them.
- **Impact:** none on the rehearsal run itself (workaround: throwaway -OutFolder); the first-video-frame check could not be done with existing tools.
- **Evidence:** rehearsal-1 session, 2026-11-10 11:20 to 11:44 PT.
- **Correction / prevention:** fix both steps in the runbook only after owner direction (pinned file); run every runbook command once before handing it over.
- **Owner approval:** a runbook change touches the pin and needs the owner.

### A-072 — 2026-11-10 — Claude Code (Sonnet 5.5) / Windows Desktop
- **Status / attribution:** Confirmed; agent tooling (repeat of the A-070 prevention step).
- **What failed:** The session started in the default worktree (branch rosmont/windows-gate3-observer-validation-20261109), ran git status and git log there, and only then found with `git branch --contains` and `git worktree list` that the pinned work lives in the scrb-scoring-fixes worktree. A-070 said to run `git worktree list` first.
- **Agent-controlled cause:** the stated prevention was not applied at session start.
- **Impact:** none shipped; a few minutes and some tool output.
- **Evidence:** first four tool calls of the session.
- **Correction / prevention:** all edits, commits and tests ran in the scrb-scoring-fixes worktree; first command of a pinned-branch task is `git worktree list`.
- **Owner approval:** not required.

### A-073 — 2026-11-10 — Claude Code (Sonnet 5.5) / Windows Desktop
- **Status / attribution:** Confirmed; agent analysis slip, caught before it was written into any document.
- **What failed:** In the first pass over rehearsal-1's `actions.log` I computed the overlay's first reading as 2.449 s instead of 0.245 s (2,449,110 ticks divided by 10 million is 0.245 s, not 2.449 s), which made the owner's "about 2 s into the video" look consistent when it was not.
- **Agent-controlled cause:** mental division by the wrong power of ten.
- **Impact:** none; corrected before writing; the rehearsal record states the correct figures.
- **Evidence:** the figures in `gate-3-windows-orchestrator-rehearsal-1-20261110.md` (first-overlay check).
- **Correction / prevention:** compute tick arithmetic with the tool, not by hand; report the formula and the numbers.
- **Owner approval:** not required.

### A-074 — 2026-11-10 — Claude Code (Sonnet 5.5) / Windows Desktop
- **Status / attribution:** Confirmed; agent tooling slip, caught within the task.
- **What failed:** I appended the usage row with .NET `WriteAllText` and a relative path from a PowerShell session whose location was the scrb-scoring-fixes worktree; .NET resolved it against the process directory, so the row landed in the primary scrb checkout's `agents/agent_task_allocation.md` (a different branch) and the worktree file was unchanged. `git diff` in the worktree showed nothing, which exposed it.
- **Agent-controlled cause:** relative path passed to a .NET file API instead of an absolute or PowerShell-resolved path.
- **Impact:** one uncommitted line in the primary checkout, reverted with `git checkout --` (the file was clean before); nothing committed or pushed from it; a few minutes of redo.
- **Evidence:** `git status` in the primary checkout showed ` M agents/agent_task_allocation.md` before the revert.
- **Correction / prevention:** use absolute paths with .NET file APIs; check `git diff` in the intended worktree before committing.
- **Owner approval:** not required.

### A-075 — 2026-11-10 — Claude Code (Sonnet 5.5) / Windows Desktop — false "speakers muted" reading stopped the authorized run for about 25 minutes
- **Status / attribution:** Confirmed; agent tooling error.
- **What failed:** I read the speaker mute state with a hand-written COM interface for IAudioEndpointVolume that had one extra method slot (`j`) before SetMute, so GetMute called a wrong vtable slot and returned `muted=True`. I treated that as a failed precondition and stopped the scored run, asked the owner to authorize unmuting, and reported the speakers as muted. After the owner's reply I fixed the interface (slot order checked against the documented method order) and re-read: volume 10%, muted=False. The speakers were never muted.
- **Agent-controlled cause:** an unverified interface definition; I did not cross-check the single odd reading (for example with a second method or the mixer) before stopping.
- **Impact:** the run started about 25 minutes later than it could have; the owner was asked a question that was not needed; nothing recorded or changed (no mute change was made).
- **Evidence:** the two readings in this session (muted=True, then muted=False after the fix).
- **Correction / prevention:** verify a hand-written COM interface against the documented method order or a known state before relying on it for a stop decision.
- **Owner approval:** not required.

### A-076 — 2026-11-10 — Claude Code (Sonnet 5.5) / Windows Desktop — scored-run-1 orchestrator launched from a hidden background process aborted at once; not noticed for 12 minutes
- **Status / attribution:** Confirmed; agent launch error, no application or protocol fault.
- **What failed:** I started `run-scored-run.ps1` through `Start-Process powershell.exe -WindowStyle Hidden` from the PowerShell 7 tool shell, with output redirected to a scratchpad file. Windows PowerShell 5.1 did not find `Get-FileHash` (the inherited PSModulePath lists the PowerShell 7 module folders first), so the orchestrator threw at its first hash step and wrote `run INVALID: The term 'Get-FileHash' is not recognized` to `scored-run-1\run-record.txt` at 21:01:03 UTC (13:01:03 PT), one second after it started. Earlier foreground `powershell.exe` calls from the same shell had worked, so I did not test the launch method first. I then waited on a notification for about 12 minutes instead of checking the output file within the first minute.
- **Agent-controlled cause:** an untested launch method for the single authorized run; no early check that the run had actually started.
- **Impact:** scored-run-1 is marked INVALID before capture (no Snipping Tool recording, no playback, no audio, no actions.log, nothing scored); the authorization allows one run and no repeat, so I stopped. About 12 minutes of owner-away time lost; the evidence folder name scored-run-1 and the profile scored-run-1-app are now used.
- **Evidence:** `scored-run-1\run-record.txt` (one line); the scratchpad output file `orch-out.txt`.
- **Correction / prevention:** launch the orchestrator the way the runbook shows (a Windows PowerShell window), or with a cleared PSModulePath, and confirm `actions.log` appears within 30 s; do not wait on a long run without an early liveness check.
- **Owner approval:** not required.

### A-077 — 2026-11-10 — Claude Code (Sonnet 5.5) / Windows Desktop — test-file main guard left above the new test class
- **Status / attribution:** Confirmed; agent (caught by independent review).
- **What failed:** When porting the six chunk-47 tests into `scripts/gate3-retest/test_v3a_conditional.py` I appended the new class after the existing `if __name__ == '__main__': unittest.main()` guard, so running the file directly skipped the six new tests (12 tests when fixed, 6 fewer before). Discovery-based runs (350 -> 356) still counted them, which hid the problem.
- **Agent-controlled cause:** Appended to the end of the file without checking for an existing guard.
- **Impact:** None on results; a direct run would have under-reported the new tests. Caught before approval.
- **Evidence:** commit f951a4f; fixed in the following commit.
- **Correction / prevention:** Guard moved to the end of the file; 12 tests now run directly and discovery stays at 356 (3 skipped). Check for a main guard whenever appending a test class.
- **Owner approval:** Not required.

### A-078 — 2026-11-10 — Claude Code (Sonnet 5.5) / Windows Desktop — wrong skipped-test count written into the first draft of the new manifest
- **Status / attribution:** Confirmed; agent (caught by my own check before verification of the final manifest).
- **What failed:** I wrote `skipped: 3, passed: 353` into the new manifest's `test_results` from the owner's "356, 3 skipped" expectation and from my earlier reports, before running the suite with the manifest's own recorded environment (`SCRB_V3A_PRACTICE_ROOT`, `SCRB_MATCHER_DIR`). That run gave 356 tests, OK, with no skips; the 3 skips appear only when those variables are unset (skipUnless/skipTest in test_long_correlation.py, test_observer_publications.py, test_v3a_conditional.py).
- **Agent-controlled cause:** copied a figure instead of measuring it; earlier usage rows (and A-077) say "3 skipped" without naming the environment it applied to.
- **Impact:** None on results; the interim manifest hash was discarded and the manifest regenerated (356 passed, 0 skipped, final SHA-256 b0a00b68...123d) before verification and before the owner sheet named it.
- **Evidence:** suite output "Ran 356 tests ... OK" with the variables set; the manifest's test_results.python.environment.
- **Correction / prevention:** Record counts only from a run under the command and environment the manifest names; say which environment a skip count applies to. Earlier "3 skipped" statements refer to a run without the variables.
- **Owner approval:** Not required.

### A-079 — 2026-11-10 — Claude Code (Sonnet 5.5) / Windows Desktop — incomplete edit of the sensitivity helper caused four failed steps and a rerun
- **Status / attribution:** Confirmed; agent.
- **What failed:** I generalized `mk_sens_mic.py` to several rows by string replacement but the replacement did not match the file's line endings, so the loop was not written and `row` was undefined. The four SENS steps (helper, matcher, assemble, analyze) were run in one command without checking the first exit code; the first raised NameError and the other three failed on the missing file.
- **Agent-controlled cause:** no check of the edited helper (a syntax-only check would not have caught a NameError) and chained steps without stopping on the first non-zero exit.
- **Impact:** None on results: no output file was written by any failed step, the helper was fixed (same logic) and the four steps rerun; about two minutes lost and eight extra log lines. Logged in `scoring-log.md` as an invocation/helper error.
- **Evidence:** `scoring-log.md` steps SENS1 to SENS4 (exit 1, outputs MISSING) and the `-rerun` steps (exit 0).
- **Correction / prevention:** Print the edited helper and stop on the first non-zero exit before running dependent steps.
- **Owner approval:** Not required.

### A-080 — 2026-11-10 — Claude Code (Sonnet 5.5) / Windows Desktop — new filter helper written with an unescaped backslash in its docstring
- **Status / attribution:** Confirmed; agent. Minor.
- **What failed:** `filter_converted.py` had a Windows path with `\c` in a normal (non-raw) docstring; Python printed a SyntaxWarning on every run. I only compile-checked helpers for syntax errors in the earlier session and did not run this one with warnings visible before the step.
- **Impact:** None; the warning is a docstring escape and the helper's output, hashes and the classifier run are unaffected. Noted in the log.
- **Correction / prevention:** Write helper docstrings as raw strings or avoid paths in them.
- **Owner approval:** Not required.

### A-086 — 2026-11-10 — Claude Code (Sonnet 5.5) / Windows Desktop — PR #78 body said everything else was independently reviewed
- **Status / attribution:** Confirmed; agent. Caught by my own re-read about a minute after creation.
- **What failed:** the first PR body ended with "everything else was independently reviewed before merge into this branch", but the scored-run-2 scoring results and the microphone rescore handoff sections are still pending independent review.
- **Impact:** None known; the body was corrected with `gh pr edit` before any reviewer was asked to act on it.
- **Correction / prevention:** State review status per part, from the usage table, when writing a PR body.
- **Owner approval:** Not required.

### A-087 — 2026-11-10 — Claude Code (Sonnet 5.5) / Windows Desktop — draft banner left in the signed decision record
- **Status / attribution:** Confirmed; agent. Found by the independent reviewer (Codex).
- **What failed:** when asked to fix the section 6 heading I changed only that heading and did not search the file for other sentences saying it was unsigned; line 3 still read "DRAFT ... Nothing here is approved or signed".
- **Impact:** None on the decision; the signed record contradicted itself for about 25 minutes on the PR branch (PR #78 CI was running, nobody had merged).
- **Correction / prevention:** banner replaced in the next commit. When fixing status wording, search the whole file for draft/unsigned/pending terms.
- **Owner approval:** Not required.

### A-088 — 2026-11-10 — Codex / Windows Desktop — independent replication stopped by comparing against the wrong log
- **Status / attribution:** Confirmed agent error (Codex), with an ambiguous planner instruction as a contributing cause (see A-089).
- **What failed:** Codex stopped the first independent replication after comparing the regenerated microphone gap map at approved commit `78c9acb` against the superseded first-scoring log under the old pin, instead of the mic-rescore log. It treated a known historical-pin difference as an unreproducible current step.
- **Impact:** One stopped step and an incomplete first replication, an owner correction and a continuation turn. No wrong result; no evidence or application state changed.
- **Evidence:** Codex AGENT-ERROR.md and CONTINUATION-REPORT.md in the private evidence folder (not copied to Git).
- **Correction / prevention:** Continued from the approved pin using the mic-rescore reference hashes. Bind each comparison to its effective approved pin and amended plan before interpreting a mismatch.
- **Remaining risk:** None for the results; not an application defect.
- **Owner approval:** Not required.

### A-089 — 2026-11-10 — Planner — unequal-exposure error comparison and an ambiguous log instruction
- **Status / attribution:** Confirmed planner error, partly contributing to A-088.
- **What failed:** (1) The planner argued about relative model quality from raw error counts across agents with unequal exposure, which is sampling bias. (2) The replication brief was ambiguous about which log governs the microphone steps.
- **Impact:** The second point contributed to A-088 (one stopped step, no wrong result). The first caused no action.
- **Correction / prevention:** Compare agents only on rates over comparable work; name the governing log, pin and amendment in every replication brief.
- **Owner approval:** Not required.

### A-090 — 2026-11-10 — Planner (Claude Code, Mac) — unclear manual-action instructions and unverified model labels
- **Status / attribution:** Confirmed planner error.
- **What failed:** (1) A prompt for the owner to paste dropped the explicit recipient header (session, model, PC, folder, admin), so the owner had to read it closely to find the recipient. (2) Prompts labelled sessions "Sonnet 5.5" without verifying what ran; the drafting sessions ran on Opus 5.5, and the first fix was a per-prompt model self-check that the owner rejected as a waste of usage. (3) The owner asked for clear, consistent instruction on manual PR actions. The planner gave "Squash and merge" for one PR, then a single blanket "merge commit for every PR" rule with contradictory advice on deleting branches, reading "consistent" as "uniform"; the owner corrected it twice. The owner meant an explicit instruction per item.
- **Impact:** Owner time and extra turns, and avoidable usage on the self-check lines. No repository, evidence or merge outcome was affected; both PRs were merged with the stated methods.
- **Correction / prevention:** Every manual action now gets a per-item table (item, exact button, delete branch yes/no, why). Every prompt opens with a "PASTE INTO" header. Model self-check lines are dropped unless there is concrete evidence of a mismatch.
- **Remaining risk:** Session models can still differ from labels; usage rows must say "unverified" when a model is not confirmed.
- **Owner approval:** Not required.

### A-091 — 2026-11-01 to 2026-11-10 — Planning role (ChatGPT/Codex Nov 3–8; Claude planner from Nov 8) — no stopping rule or effort budget for Windows Gate 3 review rounds (Major)
- **Status / attribution:** Confirmed by the owner-recorded [Nov 9 progress-concern handoff](../docs/handoffs/2026-11-09-owner-progress-concern-windows-gate3.md); severity Major per the owner. **Attribution is provisional and shared.** The owner states Claude was unavailable Nov 3–8, so ChatGPT planned (with Codex executing) for that span; the Claude planner (Claude Code, Mac) took over from Nov 8 and continued the same pattern. The records do not apportion the cost between planners.
- **What failed:** The 2026-11-07 Windows live-latency miss was 4 of 77 units (73/77 = 94.8% against 95%) under one endpoint definition, with its cause undiagnosed. Instead of a bounded diagnosis, review rounds on measurement tooling (Protocol v3, scoring, manifests) were authorized one at a time with no stopping rule, no effort budget and no per-round cost tracking until about Nov 8–9. By Nov 9 product code was unchanged. Agent errors recorded elsewhere in this register (for example A-077, A-078, A-085) added rework.
- **Impact:** The owner reported about 250% of Codex's weekly allowance (including two non-renewable owner resets) and about 130% of Claude's weekly allowance by Nov 9; these figures are the owner's and unverified. Windows Gate 3 ended on an owner risk-acceptance decision (signed 2026-11-10), not a measured pass, and the root cause of the Nov 7 misses is still undiagnosed. Mac Gate 3 landing waited behind it.
- **Correction / prevention:** From Nov 9: a stopping rule (no further review round unless it finds a concrete false-PASS or false-FAIL path), forced APPROVE/REJECT with required edits only for concrete defects, and usage recorded at task start and end. Open work: root-cause investigation is not started and needs an owner-approved scope and stop rule (PR #67 diagnostics are a prerequisite).
- **Remaining risk:** Thin Windows microphone margin (62/65) and the unexplained 185.83 s unit remain; reopen conditions are in the signed decision record.
- **Owner approval:** Required to merge this entry.

### A-104 — 2026-11-11 — Codex / Mac — slice 1 inspection and test-harness mistakes
- **Attribution:** Confirmed agent errors during `rosmont/live-diarization-slice1-20261111`; no production-data failure.
- **Observed effects:** An initial Git read ran in the parent evidence directory instead of the checkout. Reading an executable with `cat` produced excessive binary output. The first replay script lived under transcription's TypeScript configuration while importing desktop/storage `.ts` modules and used an unnarrowed generic event payload, producing type errors. The first silent replay passed assertions but failed cleanup by closing the library twice. A new supervisor assertion incorrectly assumed run numbering began at 1 (it begins at 0). A new history assertion initially compared nonexistent `history` properties instead of `undoStack`/`redoStack`.
- **Correction:** Used the verified checkout and bounded source reads; moved the replay to desktop scripts and included it in desktop typechecking, narrowed the event payload; guarded cleanup; derived the expected namespace from the emitted segment; checked the actual history stacks. Preserved first-run evidence separately, with a successful corrected replay and targeted checks.
- **Evidence:** Private local `live-diarization-slice1-evidence-20261111` evidence and task check logs; public test/source corrections are on this branch. Replay repeated once only after the cleanup fix; supervisor test repeated once after its assertion fix. Shared quota impact is not separately attributable.
- **Remaining risk:** Integrated contention and native Windows validation are untested; full sandbox check limitations are documented in the slice handoff. Independent code review and owner merge decision remain pending.

### A-257 — Historical evidence proposal reconciliation

Source: local `option-a-evidence-20261111/unblock-usage-row-proposal.txt` (retained, not uploaded). Attribution and outcome below are the original agent report, not a new independent audit.

for agents/agent_self_induced_failures.md (uncommitted): guessed glob/source filenames caused several read-only lookup errors; corrected by actual file inventory. First direct native build invocation failed126 because script was not executable; bash invocation passed. First decoder build hit sandbox network restriction; owner-approved escalation passed. No product defect inferred and no long-test repeat. Source evidence: turn tool results and retained build logs; exact task credit impact unavailable. No harmful mutation or private recording access.

### A-258 — Historical evidence proposal reconciliation

Source: local `option-a-evidence-20261111/usage-row-proposal.txt` (retained, not uploaded). Attribution and outcome below are the original agent report, not a new independent audit.

(uncommitted): initial worktree creation denied by read-only .git sandbox; authorized escalation succeeded. Two guessed source filenames and an application-support directory did not exist; corrected by inspecting actual config/source. No application fault inferred; no test reruns. Evidence in tool transcript. No exact credit impact available.

### A-259 — Historical evidence proposal reconciliation

Source: local `pr58-abort-evidence-20261110/incident-proposal.txt` (retained, not uploaded). Attribution and outcome below are the original agent report, not a new independent audit.

Uncommitted incident-register proposal (ID to allocate): prior Codex change 715b4cb serialized profile assignment and deletion but omitted AbortSignal-aware waiting on the new shared lock. A queued optional match could therefore make ImportCoordinator.stopForRecording wait for a full deletion scan/save, delaying RecordingController.start despite abort. Narrow independent re-review identified this concrete defect; deterministic regression on 715b4cb returns "still waiting" before the deletion gate releases. Corrected at 331c700: only queued callers reject immediately on abort; their retained queue node checks abort before executing; started persistence remains owned by the shared lock until it finishes. Regression also strengthens an existing delayed-save case by aborting once persistence has started and verifying it does not settle early. Old-code mutation failed as expected; restored fix passed 39 profile tests and 165 affected tests. No test or CI reruns driven by EPERM, no EPERM observed. Attribution: prior agent-introduced responsiveness regression and missing cancellation coverage; no recording loss observed or claimed. Remaining risk: independent follow-up review pending. CI outcome appended after completion; raw logs retained locally. No new task-specific setup mistakes identified.

Final outcome: run 42973395826 on 331c700b78dee2c0124ecef78bf49fb79c49ccb6 passed macOS and Windows on first attempt, including smoke. No claim of independent approval or owner merge permission.

### A-260 — Historical evidence proposal reconciliation

Source: local `pr64-owner-6e7d197-evidence/incident-proposal.txt` (retained, not uploaded). Attribution and outcome below are the original agent report, not a new independent audit.

Uncommitted incident-register proposal: initial worktree creation denied .git metadata write by sandbox; authorized escalation succeeded once. Several exploratory source lookups used wrong filename case/path and failed without mutations; corrected through actual source inspection. Effect: minor setup time, no product/build failures or test reruns. Evidence: current task tool output. No remaining build risk identified from these lookup errors.

Follow-up correction: prior preparation handoff unnecessarily left executable UI checks to owner without checking computer-control access. Existing Electron proved accessible and all four checks executed. Bundle-ID app selection was ambiguous; full known running app path resolved it with no launch. Earlier final wall-clock end was manually stated rather than verified; use artifact timestamps for authoritative preparation end.

### A-261 — Historical evidence proposal reconciliation

Source: local `pr67-main-integration-evidence-20261110/incident-proposal.txt` (retained, not uploaded). Attribution and outcome below are the original agent report, not a new independent audit.

Uncommitted proposal for agents/agent_self_induced_failures.md (allocate ID on authorized logging branch): #67 integration verification ran a loopback-server test in the restricted local sandbox. It reported listen EPERM on 127.0.0.1 and the dispatcher integration case timed out at 30 seconds. Affected suite: 53 passed, 1 failed, 1 unhandled error. Attribution: sandbox/test-environment failure, not established product failure; launching known loopback coverage in the restricted sandbox repeated an environment limitation, but the owner explicitly authorized CI fallback. No local rerun, no test/config changes. Correction: preserve local evidence and use exact-head hosted macOS/Windows CI as authority. Remaining risk: hosted outcome pending when proposal drafted. Evidence: srcb-pr67-affected.log; merge 328bcc4. No other identifiable task-specific agent failure observed; no repository incident changes committed.

Final correction evidence: CI 42967815445 on 328bcc479d25cf1490602003b3b1d2739669328d passed on macOS and Windows, first attempt, including smoke. Local loopback failure was not reproduced on hosted CI. No rerun or product/config workaround applied.

### A-262 — Historical evidence proposal reconciliation

Source: local `review-defect-fixes-evidence-20261110/incident-proposals.txt` (retained, not uploaded). Attribution and outcome below are the original agent report, not a new independent audit.

Uncommitted proposal for agents/agent_self_induced_failures.md; ID to allocate:
#58 race-regression fixture initially returned an obsolete pre-assignment transcript even AFTER the gated write completed. This produced one false failure against the correct shared-lock implementation. Corrected fixture: stale scan snapshot is returned only while the assignment write is blocked; once persisted, the real transcript is read. After correction the profile suite passed 38/38. Old-code mutation then failed BOTH requested race regressions; removing imports.ts's matching call separately failed the successful-import regression. Both temporary mutations were restored in finally blocks. Final broader affected suites passed 164/164. No product defect was inferred from the initial fixture error. Evidence: pr58-fix-tests-initial.log, pr58-fix-tests.log, pr58-race-old-code.log, pr58-import-mutation.log, pr58-fix-affected-final.log. Remaining risk: final independent follow-up review is pending; no merge authorized. One initial read looked for #67-only files in the main checkout and found no files; corrected to the proper worktree, no mutation or test impact. No other identifiable task-specific agent error observed. No local EPERM, broad rerun, or CI rerun performed.

Final CI: #67 d5025f2 run 42971588691 and #58 715b4cb run 42971679222 both passed macOS/Windows, first attempt, including smoke. No local EPERM occurred; no environment-driven reruns.

### A-263 — Historical evidence proposal reconciliation

Source: local `stage2-evidence-20261110/incident-proposal.txt` (retained, not uploaded). Attribution and outcome below are the original agent report, not a new independent audit.

Uncommitted incident-register proposal (ID to allocate): Stage 2 local verification launched in restricted sandbox. Summary-worker localhost listen was denied with EPERM; smoke produced eight Electron launch failures; local check also had helper assertions and one timeout whose causal attribution is unresolved. Author/setup error: failed to account for native test sandbox needs before launch. No rerun performed per repository rule; report raw counts separately from hosted CI. Evidence: srcb-stage2-check.log, srcb-stage2-smoke.log. Correction: preserve evidence and use hosted CI for independent platform results; future native verification should select appropriate permissions before first run. Remaining risk: local failures beyond explicit EPERM have not been diagnosed. Fetch also needed escalation because shared .git is read-only in sandbox; corrected without branch mutation.

### A-264 — Historical evidence proposal reconciliation

Source: local `stage3-evidence-20261110/incident-proposal.txt` (retained, not uploaded). Attribution and outcome below are the original agent report, not a new independent audit.

Uncommitted incident-register proposal; ID to allocate: Stage 3 initial import-cleanup regression test invoked coordinator.shutdown before the import reached create/cleanup, yielding two false failures. Corrected by awaiting importFailed terminal notification before shutdown; affected suite then passed 59/59. Initial typecheck caught incomplete MeetingMeta mock and numeric Array.push callback return after Emit return-type change; corrected with real meeting metadata and void callback. One check was unnecessarily launched before those two compiler errors were fixed, repeating a failed typecheck. No environment-only rerun after the final check. Local sandbox EPERM and smoke Electron launch failures retained separately; hosted CI is platform authority. Tool discovery also mistakenly read a binary wrapper as text and attempted --help on an approval wrapper; no approval or write executed. Evidence: Stage 3 local logs. Attribution: agent test/setup/command mistakes, not application failures. Correction: final affected tests passed; await final CI. Remaining risk: local helper assertions remain undiagnosed.

### A-265 — 2026-11-11 housekeeping setup and lookup errors

Confirmed agent setup/lookup mistakes: attempted two worktree creations before accounting for read-only shared Git metadata; several guessed lookup paths were absent. Corrected by authorized metadata escalation and actual inventories. No application failures or tests resulted; small setup overhead, exact quota impact unavailable. Evidence retained in task tool output. Remaining risk: none identified from these setup errors.

Housekeeping setup follow-up: focused storage invocation loaded all workspace configs and failed before tests because the reused dependency tree lacks @vitejs/plugin-react. Agent selected an incomplete test setup. No assertion failed, no rerun performed; hosted CI pending. A documentation helper also stopped on an incorrect header-line assertion before any writes; corrected by locating the actual table header.

A later whitespace-check command used the evidence parent directory rather than its worktree and reported not-a-repository; corrected checks against both committed diffs passed. No tracked mutation resulted from the failed command. The approval wrapper initially lacked state-directory write access; authorized escalation produced both approval hashes without publishing.

### Slice 2a — 2026-11-11 implementation and command mistakes (ID pending allocation)

Confirmed agent errors: initial Git command used evidence-parent cwd; fetch required escalation for read-only .git; guessed absent file paths; focused Vitest config/root combination duplicated a path (no tests ran); one edit/format invocation used the package cwd with repository-relative paths and made no changes; binary approval wrappers were mistakenly read as text, producing noisy output without executing approval. Corrected using explicit repository/package paths and guarded write invocation. Initial typecheck caught modelMerge:undefined incompatible with exact optional properties; fixed by deleting metadata on manual merges. Independent code review caught recent replacements bypassing protected aliases and separate one-time merge loss during queue overflow; fixed using shared protection checks and separately bounded coalesced queues, with regression tests. A test initially expected both same-source notifications after intentional coalescing; corrected to assert the latest event. These are agent/setup and implementation failures, not successful application validation. Evidence: task tool output and /private/tmp/slice2a-*.log. No environmental failed-test reruns, recording or merge. Shared-account quota impact is not individually measurable. Remaining risk: full-suite 14 unchanged-test failures and unverified native/Windows/model replay; see slice2a handoff.

### A-266 — 2026-11-11 — Planner — conflicting fixture instruction stopped live diarization re-measurement

- **Status / attribution:** Confirmed planner error, corrected by the planner on 2026-11-11. The task brief specified a 100–400 s excerpt that conflicted with the documented full-length method and fixture.
- **Effect:** The first attempt stopped before checkout/pull or measurement and used about seven minutes of owner/agent time; no inference, scoring, repository change, or deletion occurred. Exact usage impact is unavailable.
- **Evidence:** `../../ChatGPT/srcb/live-remeasure-after-96-97-20261111/measurement-stop.txt` records the mismatch, stop, and prior method. The planner correction authorizes the documented full 1,049 s ES2004a fixture and explicitly withdraws the excerpt constraint.
- **Correction / prevention:** Follow the corrected fixture and exact recorded method for this run. Future briefs must preserve the method's matching fixture or explicitly authorize a measured adaptation.
- **Remaining risk:** The corrected task completed the 13 s final-pass rescore, but the live replay launcher was blocked under the sandbox; see A-268.

### A-267 — 2026-11-11 — Codex — zsh reserved variable obscured successful npm ci exit status

- **Status / attribution:** Confirmed command-wrapper mistake. The shell variable name `status` is read-only in zsh; assigning the exit code after `npm ci` returned `zsh: read-only variable: status`.
- **Effect:** The wrapper returned an error even though `npm ci` completed successfully (`added 283 packages in 7s`, postinstall completed, and `node_modules/.package-lock.json` advanced to 18:48:08 PT). No dependency retry or inference rerun was made; no tracked code changed.
- **Evidence:** `../../ChatGPT/srcb/live-remeasure-after-96-97-20261111/npm-ci.log` and task command output.
- **Correction / prevention:** Confirmed install success from npm's retained log and updated lock snapshot; use a non-special variable name if another shell wrapper is needed.
- **Usage impact:** Exact quota impact unavailable. **Remaining risk:** None identified; continue with the planned single measurement.

### A-268 — 2026-11-11 — Codex — tsx CLI startup was blocked by sandbox IPC socket

- **Status / attribution:** Confirmed agent invocation/setup failure under the restricted shell. `npx tsx` attempted to create its local IPC pipe under `/var/folders/.../tsx-501/` and received `listen EPERM` before the replay script began.
- **Effect:** The live replay did not start, so it produced no diarization or score result. The failed output is retained in `../../ChatGPT/srcb/live-remeasure-after-96-97-20261111/live-run.log`. No rerun was attempted, consistent with the task's no-rerun instruction. No application defect is indicated.
- **Correction / prevention:** Preserve the failed log and report the measurement as unavailable; use a launcher that does not require the CLI IPC server only if a separately authorized future run permits it.
- **Usage impact:** Exact quota impact unavailable. **Remaining risk:** Live span DER and persisted-transcript audit were not measured.

### A-269 — 2026-11-11 — Claude Code (planner) — Windows Wave 1 prompt referenced a plan file that exists only on the Mac

- **Status / attribution:** Confirmed planner error. The BCHEN-W10 prompt told Codex to follow "the Wave 1 plan in this clone's evidence folder"; the plan (`wave1-plan.txt`) was only in the Mac `option-a-evidence-20261111` folder, and I did not check that W10 had it or paste its content.
- **Effect:** W10 Codex correctly stopped (tests 2-5 BLOCKED, nothing run, about 2 minutes, weekly usage about 1%). Same class as A-266 (fixture/method mismatch in the Mac re-measure brief) and the earlier slice-2 plan-path mistake.
- **Evidence:** W10 Codex report 2026-11-11 6:45-6:47 PM PT; Mac `wave1-plan.txt`.
- **Correction / prevention:** Plan pasted into a corrected prompt. Rule going forward: a prompt for another machine must be self-contained (inline any plan, criteria or fixture) or name a file verified to exist on that machine; check fixture and method agree before sending.
- **Remaining risk:** The W10 tests are still not run; a further missing input would be a repeat.

### A-270 — 2026-11-11 — Claude Code (planner) — ambiguous "stop" in W10 follow-up prompt skipped an independent test

- **Status / attribution:** Probable planner wording error. Item B of the W10 follow-up said "If it still decodes or fails before staging, record INCONCLUSIVE and stop." Item C (worker-kill, independent of B) was then not attempted because B was inconclusive.
- **Effect:** One extra round trip and Windows test 5 still unrun; no data lost. Also, the Test 2 retry recipe (zeroed WAV header) fails at `stage: queued`, before decoding, so it could not satisfy the plan's "failure after staging begins" requirement; I should have said so before authorizing it.
- **Correction / prevention:** State "stop this item only; continue with the others" in multi-item prompts. Check that a proposed failure recipe can reach the stage the criterion names.
- **Remaining risk:** Test 2 cannot be satisfied as written with a WAV; owner decision pending. Number A-270 may collide with a W10-clone entry of the same number; renumber when registers are merged.

### A-271 — 2026-11-12 — Claude Code (planner) — asked whether Claude was installed on BCHEN-W10 when project history already answered it

- **Status / attribution:** Confirmed planner error. `agents/agent_task_allocation.md` (rows dated 2026-11-08 and 2026-11-09) records many Claude Code / Windows desktop (Code tab) runs on BCHEN-W10 (PR 74 build, scripts, play-sources.ps1, analysis). I asked the owner to confirm an installation the repo already documents, and earlier implied Claude's Windows use was unknown.
- **Effect:** One wasted owner round trip and a weaker recommendation. No data lost.
- **Correction / prevention:** Check the allocation tracker and register before asking the owner what tooling exists on a machine; search project history first.
- **Remaining risk:** Those runs were report/script/build work; the agent did not launch the app or drive the screen, so Claude computer-use on W10 remains unverified.

### A-272 — 2026-11-12 — Claude Code (planner) — planned Windows Wave 1 around screen control without checking the repo's own e2e specs

- **Status / attribution:** Confirmed planner error. `apps/desktop/e2e/real-import-playback.spec.ts`, `real-recording.spec.ts` and `real-live-run.spec.ts` already drive the real Electron app headlessly through Playwright with the real backend (no screen control, no native picker). I built the Windows Wave 1 prompts on Codex screen control and "owner launches", took the plan's owner-hands labels at face value, and did not search the repo for an unattended route. The owner had said earlier that agents had run app tests almost autonomously.
- **Effect:** Four W10 Codex attempts (about 2 hours of elapsed time, roughly 10% of weekly Codex allowance by Codex's rounded readings, not isolated) produced two PASS (tests 1, 3), two inconclusive and two blocked results that the e2e route may close. Owner time and credits were wasted.
- **Correction / prevention:** Before designing any manual or screen-controlled test, search `apps/desktop/e2e`, `scripts/` and prior plans for an existing automated route and state what it cannot cover. A repeated block on the same method is a trigger to search for a different method, not to retry.
- **Remaining risk:** Test 5 (worker kill) has no existing spec; a scratch script is proposed and unverified. Listening evidence is still a loopback substitute.

### A-281 — 2026-11-12 — Claude Code (planner) — told the owner a missing decoder was a "fresh clone" problem without checking, and did not check the repo's own decoder setup first

- **Status / attribution:** Confirmed planner error. I said every fresh Windows clone repeats the missing `ffmpeg`, then the owner pointed out the PC and clone history. The repo documents the cause: `packages/transcription/README.md` says `npm test` needs `.bin/ffmpeg` and `.bin/ffprobe` built with `npm run build:ffmpeg` (a shell script), `.bin` is gitignored and CI never builds it, so the four real-decoder import tests skip silently in CI and on the Mac. I had not read the README or `package.json` before speaking, and I had accepted Test 2 closure evidence that depended on those tests without checking whether they run.
- **Effect:** An extra owner round trip and a wrong explanation; Windows Test 2 closure cost one extra W10 run (about 30 s, 1% five-hour).
- **Correction / prevention:** Before stating why a test dependency is missing, read the package README and scripts. Before accepting an automated test as evidence, confirm in the log that it ran and was not skipped.
- **Remaining risk:** Whether the macOS Gate 3 evidence for cancelled and failed imports used these tests is unverified.

### A-274 — Loopback capture stopped before resume verification

Effect: the agent stopped the measured loopback capture before resuming saved playback, so the requested full Play–Pause–Resume sequence and post-resume audio could not be measured. Evidence: `wave1-tests2-5-followup-results.md`, `test4-pause-loopback-20261111` helper log (opened at 9:39:14 PM PT, stopped at 9:41:52 PM PT), and CUA action timestamps (Pause 9:41:12 PM, Resume 9:42:41 PM). Attribution: agent sequencing error. Correction: recorded Test 4 as inconclusive and did not retry. Remaining risk: silence during Pause and audio after Resume are not fully established by this capture.

### A-275 — Test 5 capture exceeded the requested interval without fixture audio

Effect: the Test 5 native capture ran 4 min 38 s while the agent attempted to start the AMI player, exceeding the requested 60–90-second check; meeting-track levels remained zero, and the worker was not killed. Evidence: `wave1-tests2-5-followup-results.md` timestamps (9:31:17–9:35:55 PM PT) and `owner-app-library\logs\scrb-2026-11-12.log` (`meeting.rms:0`, `meeting.peak:1` during 9:33–9:35 PM PT). Attribution: agent sequencing/time-management error. Correction: stopped capture, marked C blocked, preserved all output, and did not retry. Remaining risk: the saved capture is not valid evidence for the worker-kill acceptance criteria.

### A-276 — Claude Code: Test 4 scratch run never reached import, and a wrong-repo search

Effect: (1) The agent first searched the working-directory repo (`GitHub\scrb`) for `real-import-playback.spec.ts` and the build, concluded both were missing, and only afterwards found them in the clone; no test effect, a few wasted calls. (2) The Test 4 scratch copy (`wave1-claude-20261112\test4\pause-playback.spec.ts`) waited 240 s for an import that never started (no import log event, empty `cache\imports`, no meeting). Cause not established: possible mismatch between the spec's stubbed `dialog.showOpenDialog` flow and the current Import UI, or a fault in the agent's scratch edits (added `cwd` option, userData path, loopback block placed after the import). Per instructions the test was not rerun, so the Pause/Resume check and loopback match were not performed. Evidence: `wave1-claude-20261112\test4\run-output.txt`, `userdata\library\logs`. Attribution: provisional, unresolved. Remaining risk: Test 4 stays unverified. Also: the app was closed right after Stop in Test 5 while the meeting status was `finalPassRunning`, which may leave that scratch meeting needing recovery (evidence kept, nothing deleted).

### A-277 — Claude Code: authorized Test 4 retry spent before diagnosis was complete

Effect: the owner authorized one diagnostic retry after first finding why the import never started. The agent built an instrumented scratch copy and launched the full test as that single run, hoping the instrumentation would diagnose it, instead of first establishing the cause from existing evidence. The instrumented run showed the import did start (dialog stub called once, Import dialog showed meeting.wav 20 MB, import row with Cancel, staging folder and whisper-cli running) but the scratch/original spec's 240 s import wait expired before the 420 s file finished; staging was cleaned when the app closed. The authorized retry is therefore used with no Pause/Resume or loopback result. Root cause of the earlier failure is almost certainly the same 240 s timeout (the first run saved no page state, so this is inferred, not proven). Evidence: wave1-claude-20261112\test4b\timeline.log, run-output.txt. Correction: raise the import wait (needs a new owner-approved run; expected import >4 min, total possibly near or above 20 min). Remaining risk: Test 4 still unverified.

### A-278 — Claude Code: Test 4 final run failed on a spec readiness race the agent did not check

Effect: the owner-approved single run (1:24:36-1:30:21 AM PT) was spent without reaching playback. Raising the import wait to 15 min was not enough: the spec treats "a folder exists under meetings/" as import complete. At 09:30:08.7Z (323.4 s after the confirm click) the app logged meeting-created for source imported; the meeting.json status was still `importing` and `audio\meeting\chunks.json` did not exist, so the spec's readFileSync threw ENOENT. Playwright then closed the app; at 09:30:09.4Z the app logged meeting-deleted (leftCount 0), apparently cleaning up the unfinished import. The agent had read this poll condition earlier and changed only the timeout, without noticing it should wait for status ready. Evidence: wave1-claude-20261112\test4c\timeline.log, run-output.txt, userdata\library\logs. Correction: needs a new owner-approved run polling meeting.json status === 'ready' (final pass time unknown, run may exceed 20 min). Remaining risk: Test 4 unverified; no retry made.

### A-279 — Claude Code: Test 4d excerpt produced one transcript line, below the spec's two-line precondition

Effect: the owner-approved single run (1:44:35-1:46:24 AM PT) imported the 75 s AMI excerpt (ami-meeting-excerpt-30s-75s.wav, from offset 30 s of the verified meeting.wav, sha256 0af82ec3...3ce1) to status ready with chunks.json present in 80.9 s, but the spec's `expect(lines.count()).toBeGreaterThan(1)` failed with 1 "Play from" line, so playback, Pause/Resume and the loopback recorder never started. The agent chose the excerpt without checking how many transcript segments it would give or that the spec requires at least two (it had read that line earlier). Evidence: wave1-claude-20261112\test4d\timeline.log, run-output.txt. Correction: pick a longer or speech-denser excerpt, or relax the precondition, in a new owner-approved run. Remaining risk: Test 4 unverified; no retry made.

### A-279 correction — expected line count checked before test4e; run not launched

Before the approved test4e run, the agent checked the earlier reference data: the owner-library import of the full 420 s AMI meeting.wav (`2026-11-09 meeting.wav`, status ready) has a single transcript segment (795 words, one speaker), and the spec's "Play from" lines are one per segment. A longer excerpt of the same audio is therefore expected to give 1 line, not 3, so a 3-minute excerpt would have repeated the test4d failure. The agent did not launch the run and no app was started. Earlier note: the test4d failure was knowable from this existing data; the agent did not check it then.

### A-280 — Claude Code: scratch timeline logger wrote literal "\n" (test4b-test4e)

Effect: in the scratch specs the `tl()` helper appended the two characters backslash-n instead of a newline, so `timeline.log` is one run-together line and lost most events (the in-app STATE snapshots only). The full wall-clock timeline survives in `run-output.txt` (tl also console.logs); the analysis used `test4e\timeline-clean.log` extracted from it. The first analysis attempt failed on this, costing a few tool calls. No effect on the test result. Also note: test4e passed only with a relaxed spec (exactly one "Play from" line; +15 s button seek instead of seeking to a later line); it does not pass the original two-line check. Evidence: test4e\run-output.txt, timeline-clean.log. Remaining risk: none for results; the original spec precondition remains unmet by this fixture.

### A-282 — Wave 1 test manifest update error

Formerly A-266 in the BCHEN-W10 clone's local register
During the Test 1 evidence update, the agent assigned `completedAt` and `cleanup` to a deserialized JSON object before adding those properties; PowerShell raised `SetValueInvocationException`. The manifest outcome field was written, but those two fields were absent until corrected with `Add-Member`. Evidence: `C:\Users\bchen\Documents\ChatGPT\srcb\gate3-wave1-clone-20261111-evidence\test1-cancel-manifest.json` and `wave1-results.md`. Attribution: agent evidence-editing mistake. Correction: added the missing properties and verified serialization. Remaining risk: none identified; no test data or app files affected.

### A-283 — Continued after restricted process inspection

Formerly A-267 in the BCHEN-W10 clone's local register
A read-only `Get-CimInstance Win32_Process -Filter "ProcessId=40456"` returned `Access denied`; the agent continued with a UI restart attempt rather than stopping immediately under the Wave 1 sandbox-stop instruction. The restart then showed Windows Electron breakpoint `0x80000003`. Evidence: current tool output and Wave 1 results in the external evidence folder. Attribution: agent procedural error after a permission restriction. Correction: stopped Wave 1 without starting tests 2–5 and recorded the exact owner launch command. Remaining risk: clean restart remains unverified; owner must diagnose/run it manually before resuming.

### A-284 — Unqualified decoder-probe command unavailable

Formerly A-268 in the BCHEN-W10 clone's local register
The agent attempted `ffprobe` by unqualified command name while checking the unchanged AMI source; PowerShell reported command not recognized. This did not affect the source or any test; source SHA matched, and previously verified duration was carried forward. Evidence: current test-repeat tool output and external `test1-repeat-manifest.json`. Attribution: agent command/setup error. Correction: stopped relying on this unavailable command; no retry. Remaining risk: no new duration measurement in this repeat.

### A-285 — Repeat-manifest update used missing JSON properties

Formerly A-269 in the BCHEN-W10 clone's local register
The agent repeated the prior mistake of assigning new fields directly to a deserialized JSON object; PowerShell rejected `completedAt`, `launchError`, and `importAttempted`. The outcome field was written, but these fields were missing until corrected with `Add-Member`. Evidence: external `test1-repeat-manifest.json` and current tool output. Attribution: agent evidence-editing mistake. Correction: added all three properties and verified the manifest. No application/test state was affected; remaining risk none identified.

### A-286 — Native file-picker handoff delayed

Formerly A-270 in the BCHEN-W10 clone's local register
Effect: the owner-only native file-picker dependency was not clearly identified at the outset; after the picker opened, selection waited about 16 minutes and delayed the run. The agent did issue a picker handoff and interim updates, but only after opening it; the dependency should have been flagged before starting the workflow. Evidence: conversation/tool chronology for the 2026-11-11 repeat and the external `wave1-repeat-results.md`. Attribution: agent planning and handoff timing. Correction: document the step as owner-only up front and pause at the handoff; results now mark the owner relaunch audit pending. Remaining risk: Test 1 remains incomplete until owner confirms close/relaunch and library state.

### A-287 — Misleading usage statement

Formerly A-271 in the BCHEN-W10 clone's local register
Effect: the agent's “unchanged” usage display could imply the test used zero credits. Evidence: conversation and Codex usage snapshots around 1:04 and 1:24 PM PT both showed 30% five-hour and 34% weekly remaining. Attribution: agent overstatement of what rounded shared-account percentages establish. Correction: clarify that exact per-task cost is unknown; the results file now says the readings cannot establish task cost. Remaining risk: no per-task meter or attribution; account readings are shared and rounded.

### A-288 — Incident-register append targeted the wrong worktree

Formerly A-273 in the BCHEN-W10 clone's local register
Effect: while recording A-289 (formerly A-272), the append command omitted an explicit working directory and wrote to `C:\Users\bchen\Documents\GitHub\scrb\agents\agent_self_induced_failures.md` on `rosmont/windows-gate3-observer-validation-20261109` instead of this detached test clone. The existing register was already modified; no prior content was replaced, but one new uncommitted entry (the former local A-272, now A-289) was added to the wrong worktree. Evidence: `C:\Users\bchen\Documents\GitHub\scrb` status showed that branch and `M agents/agent_self_induced_failures.md`; the file tail contained the former A-272. Attribution: agent working-directory error. Correction: stopped writing to that worktree; this A-288 note (formerly A-273) is in the intended test clone. Remaining risk: the extra uncommitted former-A-272 entry remained in the GitHub worktree at the time; no rollback was attempted because the owner explicitly prohibited touching files on that branch and prohibited deleting evidence.

### A-289 — Wave 1 test 5 capture started before fixture playback was available

Formerly A-272 in the BCHEN-W10 clone's local register
Effect: after the owner-launched app accepted Start, the sandbox denied opening the public AMI WAV in its default player (`Start-Process ... meeting.wav ... Access is denied`). The native app capture remained active for 66.417 seconds with the built-in microphone selected and no confirmed AMI playback; two track folders were saved. No worker kill or test-5 acceptance check occurred. Evidence: external `gate3-wave1-clone-20261111-evidence\wave1-tests2-5-20261112\wave1-tests2-5-followup-results.md`, `owner-app-library\logs\scrb-2026-11-12.log`, and `owner-app-library\meetings\2026-11-12 Meeting\`. Attribution: agent sequencing error (capture began before confirming the fixture player could start), compounded by sandbox process-launch denial. Correction: stopped the recording, preserved the files, did not inspect their audio/transcript contents, and stopped Wave 1. Future attempt requires owner-side fixture playback before recording begins; exact Command Prompt command is in the results file. Remaining risk: the retained 66.417-second tracks may include ambient microphone audio; no cleanup or audio review was performed.

### A-290 — Correction — A-289 (formerly A-272) register entry moved with owner authorization

Formerly A-273 correction in the BCHEN-W10 clone's local register
The owner subsequently authorized moving the former local A-272 (now A-289) into this clone. I removed only that block from `C:\Users\bchen\Documents\GitHub\scrb\agents\agent_self_induced_failures.md` using its explicit path; that wrong worktree then had no diff for it, and its pre-existing content was preserved. It is recorded above in this clone as A-289. No commit was made.

### A-291 — 2026-11-12 — Claude Code (Opus 5.5) / Mac desktop — stale-PR claim in the project review

- **Status / attribution:** Confirmed agent review error, caught by the same agent before any PR was closed or branch deleted; not an application defect.
- **What failed:** The 2026-11-12 project review told the owner that most open drafts #21–#54 were stale and "whose work later merged through #42", and recommended closing them and deleting the 57 `rosmont/*` branches. A later `git cherry` check against `origin/main` found only #28, #30, #33, #39, #40 and #41 fully on `main`; #21, #25, #32, #34, #35, #36, #38, #52, #53 and #54 still hold commits that are not on `main`, and #53/#54 hold Windows Gate 3 evidence that the evidence-retention rule keeps until that gate passes.
- **Agent-controlled cause:** Inferred staleness from PR dates and the #42 merge instead of checking each branch against `main`.
- **Impact:** The owner agreed to the cleanup on the wrong premise. Nothing was closed or deleted. Owner reading time only; quota impact not separately measurable.
- **Correction / remaining risk:** Per-PR comparison recorded in PR for `cuc/repo-cleanup-20261112`; only the six fully merged PRs are proposed for closing, and no branch deletion is proposed before Windows Gate 3 passes.

### A-292 — 2026-11-12 — Claude Code (Opus 5.5) / Mac desktop — PR #109 missed four moved-handoff links

- **Status / attribution:** Confirmed agent error, caught by ChatGPT independent review of PR #109 at `0dcb0f8`; not an application defect.
- **What failed:** The link rewrite and its check excluded `phase0/`, so four `blob/main` links in `phase0/gpt-QA-reports/` (pause-resume QA line 85, second-pass QA line 226, capture-fault-fixes QA lines 30 and 40) would have broken after the move. The PR said no unarchived path remained "outside `phase0/`" without saying `phase0/` itself was unchecked.
- **Agent-controlled cause:** Scoped the search to skip `phase0/` as legacy material instead of checking every tracked file.
- **Impact:** One extra review round. Nothing merged with broken links.
- **Correction / remaining risk:** Links updated to `docs/handoffs/archive/`; a whole-repository check finds no `blob/main` or relative link to an old handoff path, and every `blob/main/docs/handoffs/archive/` link resolves. Commit-pinned links are unchanged by design.

### A-293 — 2026-11-12 — Claude Code (Opus 5.5) / Mac desktop — false duplicate-ID report

- **Status / attribution:** Confirmed agent review error, caught by the same agent before any edit; not an application defect.
- **What failed:** After PR #109, the agent told the owner that `main` had two entries numbered A-279. The second heading is "A-279 correction", an amendment to the same entry, which the register's policy asks for.
- **Agent-controlled cause:** Counted repeated `### A-NNN` heading prefixes without reading the headings.
- **Impact:** One extra item on the owner's follow-up list. Nothing was renumbered.
- **Correction / remaining risk:** Item dropped. A duplicate check must compare whole entry titles, not ID prefixes.

### A-294 — 2026-11-12 — Claude Code (Opus 5.5) / Mac desktop — phase0 plan tagged the archive too late

- **Status / attribution:** Confirmed agent planning error, caught by ChatGPT independent review of PR #111 at `b871e1a`; not an application defect.
- **What failed:** `docs/plans/phase0-removal.md` moved tracked `phase0/` files in step 2 but created the `phase0-archive` tag in step 3, so the tag would not have held those files at their original paths and evidence links pointing at the tag would have broken.
- **Agent-controlled cause:** Ordered the steps by when the old folder is removed instead of by when its paths first change.
- **Impact:** One extra review round. No step had started.
- **Correction / remaining risk:** The tag is now step 1, pushed and verified before any tracked file moves, and the archive step reuses it. Plan still needs owner approval.

### A-295 — 2026-11-12 — Claude Code (Opus 5.5) / Mac desktop — phase0 plan step 2 was written from incomplete reading

- **Status / attribution:** Confirmed agent planning error, found by the same agent when starting step 2; not an application defect. ChatGPT review of PR #111 did not catch it either.
- **What failed:** `docs/plans/phase0-removal.md` step 2 said `phase0/MANIFEST.md` hashed only three downloads and proposed a new fetch script. In fact `phase0/scripts/fetch-phase0-deps.sh` already held every full hash. The step also didn't mention that the Mac whisper.cpp and llama.cpp builds have library paths that point into `phase0/`, so copied builds would have kept loading from `phase0/` and failed only once it was removed.
- **Agent-controlled cause:** Read the manifest's truncated hashes and stopped before the script that it names.
- **Impact:** None yet: found before any asset was moved. The plan was amended and the step-2 PR reuses the existing script and rebuilds the builds.
- **Correction / remaining risk:** Step 2 amended in the plan. Windows builds were not inspected for the same issue; DLLs there load from the program's own folder, but this is unverified on the Windows PCs.

### A-296 — 2026-11-12 — Claude Code (Opus 5.5) / Mac desktop — step 2 PR missed the sherpa-onnx build

- **Status / attribution:** Confirmed agent error, found by the same agent while updating the owner's dev configs after PR #112 opened; not an application defect. Not yet independently reviewed.
- **What failed:** PR #112 (commit `32c2a5d`) rebuilt whisper.cpp and llama.cpp but not `upstream/sherpa-onnx/build/install`. Its build folder was removed on copy like the others, and `packages/transcription/.bin/scrb-sherpa` (final-pass diarization) has an rpath into `phase0/upstream/sherpa-onnx/build/install/lib`. A-295's correction said "the builds" were handled.
- **Agent-controlled cause:** Checked rpaths only on the whisper.cpp and llama.cpp binaries, and did not list which tools link against each removed build folder.
- **Impact:** None yet: `phase0/` still exists, so the old sidecar still loads. Final-pass diarization would have broken once `phase0/` was removed.
- **Correction / remaining risk:** The build group now builds and installs sherpa-onnx with the Phase 0 settings; `scrb-sherpa` is rebuilt against it, its rpath is checked, and it starts with the models. Separately, the owner's final-pass config named `ffmpeg`/`ffprobe` in a deleted worktree; that predates this PR. The live-diarization probe in `phase0/probes/` still uses the old path; it is archived in step 4.

### A-297 — 2026-11-12 — Claude Code (Opus 5.5) / Mac desktop — step 2 PR safety gaps found in review

- **Status / attribution:** Confirmed agent errors, caught by ChatGPT independent review of PR #112 at `32c2a5d` (REJECT, four findings); not an application defect.
- **What failed:** In `scripts/dev-assets.sh`, a relative `SCRB_DEV_ASSETS_SEED` was read after `cd` into the destination, so the seed was missed and about 17 GB would have been downloaded. A destination inside or equal to the seed was not rejected; there, `clone` runs `rm -rf` on seed folders, which are Gate 0 evidence. An existing file with a wrong hash stayed at its final path when the replacement also failed. The tools check verified cmake only, not ninja. `continuous-worker.mjs`, `e2e-ami.ts` and `m1-joins.ts` took the assets folder as an argument instead of reading `SCRB_DEV_ASSETS`, which the plan step requires. While fixing the ninja check, the agent first compared against `1.13.2`; the pip build reports `1.13.2.git.kitware.jobserver-pipe-1`, so every run would have rebuilt the venv. That was found by rerunning the step and fixed before commit.
- **Agent-controlled cause:** Tested only the default seeded run, with an absolute seed path, and did not test bad inputs.
- **Impact:** One review round. No seed was ever changed: the only seeded run used an absolute, separate destination.
- **Correction / remaining risk:** The seed is resolved before `cd`; a missing seed or an overlapping destination stops the script before anything is created; a file with a wrong hash is removed before it is replaced; ninja's version is checked; the three scripts read `SCRB_DEV_ASSETS`. Tested on the Mac: overlap and missing seed exit 1 and leave `phase0/` unchanged; a relative seed copies; a bad file with a bad seed and a failed download leaves no file; the tools group reuses a matching venv.

### A-298 — 2026-11-12 — Claude Code (Opus 5.5) / Mac desktop — wrong dev-launch instructions and a stale capture helper

- **Status / attribution:** Confirmed agent errors; the owner ran the instructions and hit them. Not an application defect.
- **What failed:** The first dev-launch command used a script that does not exist (`dev:electron`), left out `SCRB_CAPTURE_HELPER`, and assumed `npm` was on the PATH. It failed with "command not found: npm". The corrected command named `native/macos-capture/build/scrb-capture`, which was built on Nov 1, before the live-feed commits `183b9cd` and `7cf269b`. The agent had rebuilt the helper only in a scratch copy, so the app recorded but sent no audio to the live worker, and the owner saw no live text. A one-minute live run reproduced this with both the new and the old configs (0 words, `pcmAgeMs` null), so the asset move did not cause it.
- **Agent-controlled cause:** Wrote the launch command without reading `package.json` or checking the helper's build date against its source.
- **Impact:** Two owner launch attempts and about 15 minutes of owner time.
- **Correction / remaining risk:** Helper rebuilt in place with this PR's `build.sh` (Nov 1 binary kept in the session scratchpad). The same one-minute run then passed: live text appeared and the final pass reached `ready`. That run captured only 4 s of the muted `afplay` loop on the system track, so the owner's spoken retest is still the real check.

### A-299 — 2026-11-12 — Claude Code (Opus 5.5) / Mac desktop — Windows step-2 prompt assumed the wrong folder and shell

- **Status / attribution:** Confirmed agent instruction error; Codex stopped at the prompt's own precondition check on BCHEN-WIN10. Not an application defect.
- **What failed:** The prompt assumed the Windows Phase 0 assets were in `C:\Users\bchen\Documents\GitHub\scrb\phase0`, and that `bash` was on the PATH. That `phase0/` has no `models/`; Windows Phase 0 and Gate 3 work ran from `C:\Users\bchen\Documents\ChatGPT\srcb\repo` (see the Gate 2 F11 record and A-28x evidence paths). PowerShell found no `bash`.
- **Agent-controlled cause:** Took the repo path from one handoff line without checking where the Windows evidence records put the assets.
- **Impact:** One short Codex run (about 5 minutes, 5h 99%→99%, weekly 28%→28%) and owner relay time. Nothing changed on the PC.
- **Correction / remaining risk:** The revised prompt has Codex locate the folder that holds `phase0\models` and use it as the seed, and call Git Bash by its full path.

### A-300 — 2026-11-12 — Codex (GPT-6) / Windows — config search entered excluded evidence folders

- **Status / attribution:** Confirmed agent search-scope mistake; no config contents were read and no files were changed.
- **What failed:** A search excluded folders only when their names literally contained `evidence` or `results`. Several `srcb` gate evidence folders use other names, so their config-like filenames appeared in search output.
- **Agent-controlled cause:** Used a name-pattern exclusion instead of excluding the entire protected `srcb` tree from config discovery.
- **Impact:** Protected-folder filenames were enumerated. No contents, recordings, or evidence were opened or used.
- **Correction / remaining risk:** Stopped searching `srcb` and excluded it from subsequent searches. Profile-wide search access was denied; no eligible configs were found in searched non-srcb GitHub/AppData locations. Config copies and the final-pass DLL-path check remain unavailable.

### A-301 — 2026-11-12 — Codex (GPT-6) / Windows — delayed stop of a large seeded-run download

- **Status / attribution:** Confirmed agent error. The owner-set stop threshold was exceeded by an incomplete download.
- **What failed:** The seeded script reached `Qwen3.5-9B-Q4_K_M.gguf`; Ctrl+C was delivered after the `.part` file had reached 553,898,124 bytes.
- **Agent-controlled cause:** Did not issue the stop signal immediately on the first output identifying the multi-gigabyte missing model.
- **Impact:** A 553,898,124-byte incomplete download temporarily occupied C: space. No seed, phase0, evidence, or results folder was changed.
- **Correction / remaining risk:** Removed only that `.part` from `%USERPROFILE%\scrb-dev-assets`. The rest of the authorized seeded run output remains in that destination; it includes earlier successful copies and downloads.

### A-302 — 2026-11-12 — Codex (GPT-6) / Windows — unintended repeated script invocation

- **Status / attribution:** Confirmed agent mistake; the attempted invocation failed immediately on sandbox write permission.
- **What failed:** A second `scripts/dev-assets.sh` invocation was issued while intending to measure the first run's duration.
- **Agent-controlled cause:** Reused the script command instead of reading the existing process outcome.
- **Impact:** One unnecessary failed command; no destination writes occurred. Exact script duration could not be recovered after Ctrl+C terminated the stopwatch wrapper.
- **Correction / remaining risk:** No further invocation was made; duration is described as approximately 1 minute 40 seconds.

### A-303 — 2026-11-12 — Claude Code (Opus 5.5) / Mac desktop — overlap guard missed an unresolved `..`

- **Status / attribution:** Confirmed agent error in the A-297 fix (`612ee1e`), caught by ChatGPT re-review of PR #112 (REJECT, one finding); not an application defect. A-300 to A-302 are Codex entries on `codex/phase0-step2-windows-20261112`.
- **What failed:** `abs_path` in `scripts/dev-assets.sh` kept path parts under a folder that did not exist yet as plain text, so `SCRB_DEV_ASSETS=/tmp/newdir/../phase0` with seed `/tmp/phase0` passed the overlap check; `mkdir -p` then made the destination resolve into the seed, where `clone` can delete folders.
- **Agent-controlled cause:** Tested overlap only with paths whose `..` sat under folders that existed.
- **Impact:** One review round. No seed was touched; every real run used a separate absolute destination.
- **Correction / remaining risk:** `abs_path` now stops on a `..` it cannot resolve. Tested on the Mac: the reviewer's case exits 1 before creating `newdir` and leaves a test seed unchanged; a `..` under an existing folder is still resolved and rejected as an overlap; a normal seeded run completes.

### A-304 — 2026-11-12 — Claude Code (Sonnet 5.5) / Mac desktop — numpy installed without an exact pin
- **Status / attribution:** Confirmed agent error, self-reported; not an application defect. Filed as A-295 in PR #115; renumbered A-304 when PR #112, which already used A-295, merged main.
- **What failed:** The owner approved installing `onnxruntime` and `numpy` with exact pins. I pinned `onnxruntime==1.31.1` but ran `pip install numpy` unpinned; it resolved to 2.5.4.
- **Agent-controlled cause:** Pinned only the package whose version I had looked up.
- **Impact:** None on results; the resolved version is recorded in the experiment note. Owner-visible deviation from the pin instruction.
- **Correction / remaining risk:** Versions recorded (numpy 2.5.4, onnxruntime 1.31.1); no further installs. The venv is outside git.

### A-305 — 2026-11-12 — Claude Code (Opus 5.5) / Mac desktop — PR #112 CI failed on every commit unnoticed

- **Status / attribution:** Confirmed agent error, found by the agent when the owner marked PR #112 ready; not an application defect.
- **What failed:** CI's "Check Prettier on changed TypeScript" step failed on both platforms on every PR #112 commit from `32c2a5d` on, because `packages/summary/eval/run.ts`, `e2e-ami.ts` and `m1-joins.ts` were edited but not formatted. The agent had seen the local Prettier warnings, called them pre-existing, and told the owner CI was pending, never reading its result. ChatGPT approval and the owner's ready step went ahead on a red PR.
- **Agent-controlled cause:** Did not run the CI's changed-file Prettier check locally, and did not read CI results before asking for approvals.
- **Impact:** One extra commit and CI round; the owner's ready-for-review approval was given against failing checks.
- **Correction / remaining risk:** The three files are formatted (layout only); the CI's changed-file check passes locally and `npm run check` passes. CI must be green before merge.

### A-306 — 2026-11-12 — Claude Code (Sonnet 5.5) / Mac desktop — negative test asserted against a speaker that was never returned
- **Status / attribution:** Confirmed agent error, self-reported after ChatGPT review of PR #116; not an application defect. Filed as A-296 in PR #116; renumbered A-306 because PR #112 already used A-296.
- **What failed:** The new `needsManualResolution` pass-through test gave the unflagged speaker `b` no segment, so `getTranscript` omitted it and "flag absent" was asserted on an empty object. The positive assertion was mutation-checked; the negative one was not.
- **Agent-controlled cause:** Checked that the test fails when the pass-through is removed, not that each assertion could fail.
- **Impact:** One extra review round. No product code affected.
- **Correction / remaining risk:** `b` now has a segment and the test asserts it is returned before checking the flag is absent; mutation check repeated. Low.

### A-307 — 2026-11-12 — Claude Code (Sonnet 5.5) / Mac desktop — hint-on evaluation run without checking that `-mc 0` leaves the prompt inert
- **Status / attribution:** Provisional: the plan's assumption (earlier session) plus my execution without checking; found by me from byte-identical hint-off/hint-on output.
- **What failed:** The plan says hints reach recognition via `--prompt`, with `-mc 0` unchanged. I read `whisper.ts` and ran all 8 hint-on decodes without checking whether `-mc 0` disables prompt conditioning; whisper.cpp line 7112/7296 suggests it does, so the run tested nothing.
- **Agent-controlled cause:** Did not read the whisper.cpp prompt path (or run a 30 s smoke decode) before the full set. The scorer review did not cover this either.
- **Impact:** About 6 minutes of compute and one inconclusive stage; no product or evidence harm.
- **Correction / remaining risk:** Reported in the results note; cause not yet confirmed by a controlled `-mc` > 0 run. Also a minor pre-score shell quoting error (no effect). Medium until the product question is settled.

### A-308 — 2026-11-12 — Claude Code (Sonnet 5.5) / Mac desktop — diagnostic command run in zsh without word splitting
- **Status / attribution:** Confirmed agent error, self-reported; not an application defect.
- **What failed:** The `-mc 128` diagnostic stored whisper-cli flags in a shell variable and ran it in zsh, which does not split it; whisper-cli printed usage and wrote no output, and the run had to be repeated in bash.
- **Agent-controlled cause:** Assumed bash word-splitting semantics in the default shell.
- **Impact:** About one minute and one wasted command; no results affected.
- **Correction / remaining risk:** Rerun in bash (the first run produced no output). Low.

### A-309 — 2026-11-12 — Claude Code (Sonnet 5.5) / Mac desktop — scorer phrase matching, arithmetic slip and corrupted usage row passed my review of PR #118
- **Status / attribution:** Confirmed agent errors, found by ChatGPT review (REJECT); not application defects.
- **What failed:** (1) The scorer counted a multiword term as recognised when each word matched individually, even with an inserted or deleted word inside the phrase; (2) the results note said the nine non-"pen" terms had 21 reference occurrences, but the scorer's own counts give 19 (11 + 19 = 30); (3) the usage row was committed with its opening fields duplicated, shifting the columns.
- **Agent-controlled cause:** I reviewed the scorer for alignment logic but not for phrase contiguity, copied a figure into the note without summing it, and did not check the appended row's column count.
- **Impact:** One review round on #118. Re-scoring the retained outputs with the fixed scorer gave identical results (recall 8/30, WER 23.91%, 0 events), so no conclusion changed.
- **Correction / remaining risk:** Contiguity enforced in recall and held-out checks with regression tests (both mutations fail the selftest); note and row corrected. Low.

### A-310 — 2026-11-12 — Claude Code (Opus 5.5) / Mac desktop — told the owner to merge PR #112 after it had already merged
- **Status / attribution:** Confirmed agent error, self-reported; not an application defect.
- **What failed:** After the Codex branch was merged into PR #112, I answered "nothing outstanding, merge it" without re-reading the PR's state. The owner had already merged it at 13:30 PT (7ad8833) and asked "112 is already merged though?".
- **Agent-controlled cause:** Relied on remembered PR state instead of running `get_status` first.
- **Impact:** One wrong instruction and one owner clarification turn; no code affected.
- **Correction / remaining risk:** Verified the merge contains baea921 and d895a66. Rule: read PR state before telling the owner to merge. Low.
