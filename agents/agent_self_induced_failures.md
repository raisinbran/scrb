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

## Additional previously reported ChatGPT errors — provenance to verify

These were acknowledged in prior SRCB conversations but have not been cross-checked against their complete original transcripts in this backfill. They remain visible as **provisional**, not independently established application or process outcomes.

| ID | Date (PT) / agent | Reported agent error | Verification / follow-up |
| --- | --- | --- | --- |
| P-001 | Nov 3 / ChatGPT | Requested an unnecessary Windows preflight and treated an earlier `fb2d96c` test commit as outdated without sufficient justification, contrary to instructions to reuse valid evidence. | Retrieve original candidate/evidence comparison before classifying its cost or effect. |
| P-002 | Nov 3 / ChatGPT | Blurred the distinction between scoped QA recommendation of PR #48 and a formal GitHub PR approval, which the same connected author could not submit. | Confirm exact review attempts and GitHub status; PR remained draft/unmerged in the reported period. |
| P-003 | Nov 3 / ChatGPT | Communication implied that a Windows Codex assignment had been executed when GitHub instructions/comment publication was not a running device session. | Verify original wording; GitHub comment is not evidence that Codex started. |

## Credit and result impact — do not over-attribute

The owner-provided Windows Codex handoff reported **five-hour remaining 100% -> 81% and weekly remaining 31% -> 28%** during the recent closure work, while two-track acceptance remained **NOT PROVEN**. The owner also reported some repeated attempts using approximately 5% of the five-hour allowance each. These observations are **account-level balance changes**, potentially shared or rounded, **not verified per-attempt token costs**; they belong in [the usage tracker](agent_task_allocation.md) when reconciled. The material result was wasted owner interactions and test attempts, not a proven failure of durable recording.

## Claude-agent incidents (backfill 2026-11-08, provisional IDs)

Temporary `CL-` IDs avoid colliding with A-013..A-026 on the PR 74 branch; renumber to the next unused `A-` ID when merged. All are confirmed by the agent's own admission or an artifact; usage costs are not measured.

| ID | Agent | Failure and impact | Status |
| --- | --- | --- | --- |
| CL-001 | Claude Code (Opus session) | Reversed the best-case and conservative latency endpoints in spread Option B; caught by ChatGPT QA before the rule took effect. | Corrected in the amendment and tests. |
| CL-002 | Claude Code (Opus session) | Pre-flight for the r2 render assumed the `-15%` rate slowed speech linearly (projected 138.9 wpm); measured 127.93 wpm. The owner ran a render that missed the pace band. Same event as the A-026 addendum on PR 74. | Corrected by the r3 rate plan; formula now labeled an extrapolation. |
| CL-003 | Claude Code (Opus session) | Treated the pre-flight formula as reliable for r3: it projected about 147 wpm for the meeting at `+30%`, measured 164.26. Passed the band, but the formula underestimates large rate changes. | Open: formula limits recorded; listen-through checks intelligibility. |
| CL-004 | Claude Code (Sonnet, Mac review) | Reported usage as `unavailable` without trying `get_usage`. | Corrected; rule recorded in the usage-measurement memory. |
| CL-005 | Claude Code (Sonnet, Windows) | Self-reported: over-broad rate-literal test, wrong test expectation for a clipped unit, a patch-script quoting error, a too-small zero count in a join test, and a re-measure into a new derived folder without being asked. | Fixed in tests or process; no thresholds changed. |
| CL-006 | Claude Code (Opus session) | Asserted without evidence that Codex "tends to make more mistakes"; this register is lopsided because only ChatGPT/Codex were required to log. Also read the logging rule too narrowly. | Corrected 2026-11-08 after the owner's challenge; scope widened above. |
| CL-007 | Claude Code (Opus session) | Repeated an unverified claim from the D2 draft (written by Sonnet; the draft itself marks the November 7 default output as unresolved) that headphones were worn on November 7, and built advice on it ("keep headphones", wired headphones as the best option). The owner states no headphones existed; the retained endpoint record shows only Realtek Speakers. Effect: wrong setup guidance, an unnecessary `-HeadphonesWorn` guard in play-sources.ps1, and owner confusion. | Corrected 2026-11-08 after the owner's challenge; D2 draft and script guard to be fixed. |

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
