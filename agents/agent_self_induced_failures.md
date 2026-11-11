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
