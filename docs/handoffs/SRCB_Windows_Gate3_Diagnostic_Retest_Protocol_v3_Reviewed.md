# Meeting Scribe — Windows Gate 3 Diagnostic Retest Protocol (v3, Draft)

Nov 7, 2026 · Author: BJC · v3 for ChatGPT final verification, then owner approval

**Status:** v3, revised after ChatGPT's QA of v2 (conditional pass). Not approved for freezing or execution. Nothing is executed, and no production code, PR #67 or PR B changes.

**What I could not verify:** I have not inspected PR #67 (reviewed at `1905e729`), the November 7 evidence or AGENTS.md. Statements about them, including the 73/77 result, are as the reviewer reports them. Items marked **\[CONFIRM\]** must be checked against those sources before the freeze.

## Changes from v1

| Review finding | Disposition |
| --- | --- |
| P1: PR #67 does not trace visible UI publication | Accepted. `segment_delivered` is a supervisor callback, not DOM visibility. Section 1 now uses an external read-only observer. |
| P1: no short utterances | Accepted. Section 2 adds utterances under one second. |
| P1: attribution overclaims | Accepted. Section 5 reports observed outcomes and localizes only what PR #67 proves. |
| P1: matching can give false credit | Accepted, with one change. The one-character tolerance is gone. Ordered alignment flags a wrong word instead of discarding the unit, so a misrecognized last word cannot hide a late publication. |
| P2: acceptance standards mixed | Accepted. Section 6 has three separate layers, and the November 7 result is untouched. |
| P2: clock alignment | Accepted. v1 wrongly looked for audio markers in traces. Section 3 finds them in recordings only. |
| P2: duration too optimistic | Accepted. Section 7 gives a realistic range, requires authorization and has no automatic stop. |
| Stage budgets are arbitrary | Partly accepted. Fixed thresholds are removed. A lateness rule is still needed, so it uses the same run's measured range for on-time units. |
| Virtual audio routes, track overlap | Accepted. A capture-equivalence checklist and intentional overlap are added. |

## Changes in v3

| QA correction | What changed |
| --- | --- |
| 1. Observer and straddle | Section 1 adds validation on the actual Live screen and a polling straddle rule. Section 6 applies both to acceptance. |
| 2. Misrecognized words and identity | Section 1 credits a wrong last word only when utterance identity is confirmed, and clarifies early publication. Section 2 adds outcome classes so an uncertain alignment is not a setup failure. |
| 3. Anomalies and capability table | Section 5 calls over-range intervals comparative anomalies, requires causal timing evidence, and corrects what model word counts show. |
| 4. Workload and script mix | Section 4 corrects the November 7 duration. Section 2 sets the short-utterance share from the 34/77 figure without equating denominators. |
| Consistency fix | D8 now requires the corrected PR #67 head only. |

## 1. Latency measurement

- **Unit of scoring:** one reference utterance, meaning one scripted sentence or phrase in the annotation file.
- **Start point:** the end time of the utterance's last word. Word timings come from the TTS engine's word-boundary marks, spot-checked against waveform energy. They are independent of the app's own speech model.
- **End point:** the first *observed visible* publication of that utterance's last word in the live transcript, seen by an external observer (below). It is never taken from PR #67 traces.
- **Per-unit result:** latency = end point − start point. 6.0 s or less is on time, more than 6.0 s is late, and never visible by the end of the drain period is missing. A publication seen between the last word's start and its end gives a negative latency, which is kept as recorded and counts as on time. Straddle units (below) are handled conservatively.
- **Reporting:** every result is split into short (under 1 s) and long utterances, because short ones were the weak spot on November 7.

**UI observer (read-only, outside the app)**

- **Primary:** a Windows UI Automation poller reads the transcript pane text at 10 Hz or faster. Each sample is stamped with the harness clock. **\[CONFIRM\]** the shell exposes transcript text this way.
- **Always-on backup:** a screen recording of the transcript pane with an on-screen harness-clock overlay, drawn by a separate window. It confirms the text was actually in the viewport. If UI Automation cannot read the text, a frozen OCR tool supplies it and OCR uncertainty is reported.
- The observer sends no input and changes nothing in the app. Each observation is an upper bound on when the text became visible. True visibility lies within u, the gap since the previous successful sample plus the read time. u is recorded for every observation.
- PR #67's `segment_delivered` is a supervisor callback. It is used only for diagnosis (section 5), never as the latency end point.
- Before the freeze, the observer is validated on the actual Live screen of the candidate build (next subsection).

**Observer validation on the actual Live screen (before the physical run)**

This runs on the candidate build with a throwaway clip, never the frozen scored files. Its results are not Gate 3 evidence.

1. **Reach:** UI Automation exposes the Live transcript text, the track labels and each text element's on-screen bounds.
2. **Visibility:** text counts as visible only if its bounds lie inside the transcript viewport. This is checked against the screen recording on at least 10 samples, including while the pane scrolls and while older lines are virtualized away.
3. **Timing:** poll rate and read time are measured under the planned full load (both tracks, recording, screen recording). The largest u is recorded. Default requirement: largest u of 250 ms or less.
4. **Fidelity:** observed labels and words match the recording for the same frames, with no truncation or hidden text.
5. **Overhead:** the observer's CPU and memory cost is recorded for the workload comparison (section 4).
6. **Outcome:** PASS allows the freeze. FAIL means the protocol is not frozen, and the owner decides on the fallback (D7).

**Polling straddle rule**

Each observation has an upper bound (the observed time) and a lower bound (the observed time minus u). A unit whose upper-bound latency is over 6.0 s but whose lower-bound latency is 6.0 s or less is a **straddle unit**. For acceptance it counts as late. Section 6 shows how both bounds enter the verdict.

**Matching rules (frozen inside the analysis script)**

1. **Track-specific:** only text carrying that track's UI label counts. **\[CONFIRM\]** the labels ("You" and "Meeting"). The two scripts also use disjoint vocabularies as a second guard.
2. **Ordered and occurrence-aware:** the observed text is aligned word by word, in order, to that track's reference sequence. The n-th occurrence of a repeated word matches the n-th reference occurrence.
3. **Timing of credit:** only observations at or after the start of the utterance's last word count. An observation between that start and the word's end is valid and gives a negative latency, kept as recorded. An observation before the last word starts is pre-speech. It is never credited and is flagged for review. If an otherwise matching observation falls within the measured timeline uncertainty before that start, it is a boundary case (section 6).
4. **One publication, one unit:** a visible word is credited to at most one reference utterance.
5. **Exact match:** the endpoint is the first observation where the last-word position holds the exact reference word, after normalizing case and punctuation.
6. **Substituted last word:** credited only when the utterance's identity is confirmed independently of that word. That means the utterance has at least 3 words, at least 60% of its other words match exactly and in order inside an aligned span ending at the last-word position, and no other utterance claims that span equally well. It is credited and flagged **text error**. The 60% figure is a default, fixed in the frozen script.
7. **Single-word and unconfirmed cases:** a single-word utterance has no independent evidence, so only an exact match counts. A substituted token, or any token not tied to a confirmed utterance, is never credited. The unit is **UNIDENTIFIED** (section 2), not a setup failure.
8. **Ambiguity:** when two or more equally good alignments exist, the unit keeps the earliest and latest candidate end points, each satisfying rules 1 to 4. They become bounds (section 6). This is not a setup failure.

## 2. Speech eligibility (denominator frozen from the audio, never from app output)

- **Scripts:** neutral TTS voices at about 150 words per minute, two distinct voices (one per track), with no fillers and no overlap within a track.
- **Long utterances:** 4–12 s, with gaps of 0.8–2.5 s outside the failure window.
- **Short utterances:** single intelligible words of 0.3–1.0 s, such as "Yes.", "Correct.", "Agreed." and "Understood." Backchannel sounds ("uh-huh", "okay") are excluded as fillers. No short word repeats within 30 s on a track, so repeats cannot be confused with each other.
- **Mix:** about 40% of units by count are short. This is informed by the November 7 exploratory system detector candidates, of which 34 of 77 (about 44%) were short, as the reviewer reports. **\[CONFIRM\]** that figure. The two denominators are not equivalent, since detector candidates can split or merge utterances. The figure guides script design only and is not a matching target. Each track has at least 8 short utterances inside the failure window.
- **Pre-freeze audit:** an automated check plus a listen-through flags any unit with a filler, unclear speech or overlap. Flagged units are marked **excluded** in the annotation file with a reason.
- **Denominator:** the eligible units in the frozen annotation file. Nothing discovered after the freeze adds or removes a unit, including unexpected test-setup problems.

**Unit outcomes and setup problems after the freeze**

Every unit stays in the frozen denominator and ends in exactly one outcome class. An uncertain transcript alignment is a measurement uncertainty or an output-identification outcome. It is not a setup failure.

| Outcome | Meaning | Treatment |
| --- | --- | --- |
| MATCHED | Exact last word (section 1, rule 5) | Credited at the observed time |
| MATCHED-SUBSTITUTED | Wrong last word, identity confirmed (rule 6) | Credited, flagged text error |
| UNIDENTIFIED | No reliable identity: a single-word substitution, no confirmed span, or nothing visible (rules 6 and 7) | An output-identification or publication-coverage outcome, not proof of recognition failure. It remains uncredited in both acceptance bounds. Stage attribution requires independent diagnostic evidence |
| BOUNDED | Ambiguous alignment or a boundary case (rules 3 and 8) | Latest candidate in the conservative bound, earliest in the best-case bound |
| SETUP-AFFECTED | Overlaps a logged harness playback gap, an observer gap of more than two poll intervals, or a failed sync marker | Not credited in the conservative bound, credited in the best-case bound |

The bounds and how they decide the latency verdict are defined in section 6. The report states the run as VALID or DEGRADED and lists every BOUNDED, UNIDENTIFIED and SETUP-AFFECTED unit.

## 3. Two automated tracks

- **Sources:** two prerecorded WAV files, one for system audio and one for the microphone. A harness script plays both from one command, and the owner does not speak, narrate or watch.
- **Intentional overlap:** the scripts are staggered so both tracks speak at the same time, including throughout the failure window, to reproduce simultaneous load. Default: both tracks active for at least half of the scored time. **\[CONFIRM\]** against November 7.
- **Injection:** each file goes through its own virtual audio route, so there is no acoustic bleed. Approval is conditional on a documented capture-equivalence check (D2): device type, sample rate and format, the state of Windows audio enhancements, and the capture path the app used on November 7. Differences from the original physical setup are listed in the report, and the source files are preserved.
- **Sync signals (outside the scored interval):** a lead-in marker at 0–10 s and a trailing marker at 380–390 s, each a distinct non-speech tone pattern per track.

**Clock alignment (corrected)**

1. The harness logs each file's playback start on one monotonic clock. The observer uses the same clock.
2. The markers are found in the **preserved original recordings** (audio), never in traces.
3. Lead and trail marker positions give a recording-to-harness-clock fit (offset and drift). Default: they must agree within 100 ms. If a marker is missing or they disagree, latency for that track is INCONCLUSIVE.
4. Trace timestamps are tied to the recording timeline through the clock anchors documented in the capture metadata and PR #67 traces. **\[CONFIRM\]** which anchors exist. The measured uncertainty is reported, and stage comparisons smaller than it are indeterminate. If this fails, only the diagnosis is INCONCLUSIVE.

## 4. Duration, load and failure window

| Segment (recording clock) | Content | Scored? |
| --- | --- | --- |
| 0–10 s | Lead-in marker | No |
| 10–20 s | Silence (warm-up) | No |
| 20–380 s | **360 s of scripted speech per track** (6 min, above the 5-min floor) | Yes |
| 380–390 s | Trailing marker | No |
| 390–420 s | Drain period, then stop | No |

- **Failure window:** continuous speech from 170 s to 245 s of recording time, with gaps under 0.5 s. It mixes short and long utterances (section 2) on both tracks at once. It covers 203–214 s whether the original period was counted from recording start or from speech start (183–194 s on the scored clock). **\[CONFIRM\]** which clock the original used.
- **Workload:** same Dell laptop, OS build, power plan, app configuration, speech models, settings and background applications as November 7, with both tracks active at once.
- **Differences from the prior test, listed in the report:** the observer (UI Automation polling plus screen recording) and the virtual audio routes add load or change the path. A comparison table covers CPU, memory, GPU, queue depth, models, settings and background apps, sampled every second. **\[CONFIRM\]** the November 7 values.
- If the prior load was heavier on any item, the report says **lighter than prior**, which limits how strongly "not reproduced" can be read. November 7 recorded 286.047 s with 240 s scored. This run records about 420 s with 360 s scored, so it is longer on both counts, and the report says so.

## 5. Diagnostic interpretation

PR #67 shows some stage outcomes and not others. Diagnosis stays inside that limit. **\[CONFIRM\]** the field names against PR #67.

| PR #67 can show | PR #67 cannot show |
| --- | --- |
| VAD outcomes per interval (unit emitted or not) | Recognized text |
| Recognition request and result counts, and the model word count of each result (empty or nonempty) | Whether a nonempty result is correct or matches the reference |
| Supervisor delivery (`segment_delivered`) with timestamps | Anything after the supervisor callback, including DOM visibility |

Text correctness comes only from the external observer.

**Stage intervals.** The span from the reference word's end to the observed visible text can be divided into consecutive, non-overlapping intervals when an event chain exists (see below): VAD (word end to VAD unit emitted), handoff (unit emitted to recognition start), recognition (start to result), delivery (result to `segment_delivered`) and UI path (`segment_delivered` to observed visible). **\[CONFIRM\]** each boundary has a PR #67 timestamp. Compute per-stage intervals and counterfactual timing only when an unambiguous, chronologically consistent event chain can be established using the reference audio and PR #67 metadata. Otherwise, report the observed stage outcomes and classify per-utterance localization as INCONCLUSIVE. Do not manufacture missing intervals or assume they sum to publication latency.

**Comparative anomaly.** For every unit with an established event chain, every interval is reported. An interval is a **comparative anomaly** if it exceeds the largest value seen for that interval among on-time units of the same track in the same run. This is a descriptive comparison only. It does not show a cause, and one unit can have several anomalies.

**Localization requires causal timing evidence.** The first anomalous or missing interval is reported as localized only when all of these hold:

1. Every upstream interval is within the on-time range, and its output was observed.
2. The counterfactual timing check passes. If that interval were replaced by the on-time maximum, the unit's latency would be 6.0 s or less. For a missing output, downstream stages show no activity for that unit while the upstream stages completed.
3. No downstream interval is also anomalous.

This shows the timing is consistent with the delay arising at that interval. It does not prove the mechanism.

| First anomalous or missing interval | Additional evidence required | What it does not prove |
| --- | --- | --- |
| VAD | Reference speech is verified present in the preserved recording at that time. No VAD unit overlaps the utterance, or the unit is emitted anomalously late. No recognition request exists for that audio. Trace coverage has no sequence gaps. | That VAD is defective. The audio may have been too quiet or altered upstream. |
| Handoff or recognition | A VAD unit was emitted within range and a recognition request was observed. No result was observed, or it was anomalously late. If a result was observed, its word count is reported as empty or nonempty, and an empty result while speech is present is reported as an empty-result outcome. | Whether any text is correct, or whether slowness is a defect. |
| Supervisor delivery | A nonempty recognition result was observed on time, and `segment_delivered` is missing or anomalously late. | Why delivery was lost or delayed. |
| After supervisor callback (unobserved) | `segment_delivered` was on time, but the external observer saw the text late or never. | Anything finer. PR #67 cannot localize inside the UI path. |
| INCONCLUSIVE | No unambiguous event chain can be established (for example, one model call covers several utterances), a required timestamp is missing, traces have sequence gaps or dropped writes, clock alignment fails, more than one interval is anomalous, the counterfactual check fails, a BOUNDED endpoint gives different localizations, or fewer than 20 on-time units exist to set the range. |  |

**Wording.** Results read "first comparative anomaly, timing-consistent with a delay at (interval)". They never say "root cause" or "proven cause".

## 6. Acceptance (three separate layers)

| Layer | Question | Rule | Possible results |
| --- | --- | --- | --- |
| A. Gate 3 latency | Does live latency meet the Development Plan targets? | Per track, over the frozen denominator: median 3 s or less, and at least 95% of units within 6 s. Computed with both bounds below. | PASS, FAIL, or INCONCLUSIVE (bounds rule below) |
| B. Recurrence detection | Did the original failure pattern appear? | Stricter and diagnostic only: an eligible unit in the failure window, on either track, is definitely late (lower-bound latency over 6.0 s), missing or UNIDENTIFIED. Straddle units alone do not count. Late units outside the window are noted. | FAILURE OBSERVED, NOT OBSERVED, or INDETERMINATE (straddle units only; reported as INCONCLUSIVE for diagnosis) |
| C. Diagnosis | Where did it first go wrong? | Section 5, run only when B shows a failure. | LOCALIZED to a stage, or INCONCLUSIVE |

**Bounds rule for Layer A.** The verdict is computed twice per track.

- **Conservative bound:** every latency at its upper bound (the observed time), so straddle units count as late. BOUNDED units use their latest candidate. SETUP-AFFECTED and UNIDENTIFIED units are not credited.
- **Best-case bound:** every latency at its lower bound (observed time minus u). BOUNDED units use their earliest candidate. SETUP-AFFECTED units are credited. UNIDENTIFIED units are still not credited.

PASS requires the conservative bound to pass. FAIL requires the best-case bound to fail. Any other combination is INCONCLUSIVE, and the report shows both bounds. The median check uses the same bounds.

- **No recurrence:** report **NOT REPRODUCED / INCONCLUSIVE for root-cause diagnosis**, with the Layer A result beside it, for example "latency passed in this run; root cause not diagnosed."
- **Never FIXED.** No combination of results produces that word.
- **November 7 is unchanged.** Its frozen system result was 73/77 under the original detector-end rule, below the 95% threshold. **\[CONFIRM\]** the figures. This run uses a different endpoint (word end to visible text), so it is not a re-score and cannot reverse that result.
- One run cannot clear Gate 3 by itself. The gate decision stays with the owner.

## 7. Safety and time

- **Evidence:** originals, traces, observer logs, screen recordings, the harness log and hashes go to a private folder outside Git. Files are set read-only after capture, and each SHA-256 is recorded.
- **No automatic deletion** and **no automatic repeat recording.** If the harness fails (not the app), stop and report. The owner decides separately about another run.
- **No automatic stop.** The harness never interrupts a final pass that is progressing normally.

**Planned total duration**

| Step | Time |
| --- | --- |
| Launch, observer and harness setup | \~3 min |
| Recording, including markers and drain | \~7.5 min |
| Final processing (about 1× to 2× the meeting length) | 7–14 min |
| Stop, copy evidence, hash | \~3 min |
| **Total** | **about 20.5–27.5 min** |

The low end already exceeds 20 minutes, so **the owner's advance over-20-minute authorization is required.** **\[CONFIRM\]** the AGENTS.md wording, and whether the Dell laptop has a usable GPU, since that drives the final-processing range. Recommended request: authorize a planned total of up to 30 minutes. If a normally progressing final pass runs past that, it is not interrupted, and the owner is told at the next check.

## Freeze manifest (completed and hashed before the run)

1. Candidate commit SHA (full 40 characters) of the corrected PR #67 head, taken after the pending analyzer edge-case correction lands, with a clean-tree statement. The reviewer cites `1905e729`, which is not the candidate unless it already contains that correction. **\[CONFIRM\]** (D8).
2. Both source WAV files (name and SHA-256).
3. Both annotation files, including word timings and eligibility flags (name and SHA-256).
4. Eligibility rules, short-utterance mix, endpoint and matching rules (including identity confirmation), outcome classes, bounds rule, scored interval, failure window and setup-problem rule (version and SHA-256).
5. Analysis script, including alignment, clock fit, bounds and localization logic (commit and SHA-256), validated beforehand on synthetic traces and observer logs. That checks the analysis only, not the app.
6. Observer method and tool versions, poll rate, the Live-screen observer validation result (largest u and read time), and the UI track labels.
7. PR #67 trace field list used for diagnosis.
8. Machine, OS build, power plan, audio devices, virtual-route equivalence checklist, app configuration, models, and the prior-test comparison table (November 7: 286.047 s recorded, 240 s scored).

The manifest's own SHA-256 goes into the owner's approval message, and the run uses only the frozen items.

## Explicit owner decisions (recommended defaults)

| Decision | Recommended default |
| --- | --- |
| D1: Six-second latency | Keep it, with median 3 s or less and 95% within 6 s as Layer A, evaluated with the conservative and best-case bounds (section 6). |
| D2: Virtual audio routes | Approve only after the capture-equivalence checklist is documented. |
| D3: Stage thresholds | No preset numbers. Use comparative anomalies plus the causal timing evidence in section 5. |
| D4: Original failure clock | Check the private November 7 evidence before the freeze. Keep the 170–245 s window either way. |
| D5: Duration | Authorize up to 30 minutes planned, with no automatic stop. |
| D6: Evidence location | A stable private folder outside Git, holding originals, traces, observer logs and hashes. |
| D7: UI observer | UI Automation polling as primary with screen recording as backup, approved only after it passes validation on the actual Live screen (section 1). OCR fallback only with your approval. |
| D8: Candidate commit | Freeze the corrected PR #67 head after the pending analyzer fix lands. |
