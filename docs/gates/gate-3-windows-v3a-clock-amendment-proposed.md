# Gate 3 Windows: Protocol v3a clock amendment (PROPOSED)

Status: **PROPOSED, NOT_FROZEN.** Separate document. Protocol v3 and the earlier v3 timing amendment are not edited. Nothing here is approved, implemented or run. No recording, playback, build, launch, freeze or merge is authorized by this text. The practice run (2026-11-09 PT) was not scored and freezes nothing.

## 1. Practice evidence this proposal rests on

Figures below were supplied in the owner's assignment from the Codex analysis of the practice recording. Claude Code has not re-derived them; they are to be re-checked before approval. The practice recording is test data (r3 assembled WAVs).

| Observation | Value |
| --- | --- |
| Affine (offset plus drift) fit of the marker times | **INCONCLUSIVE** at 210 ms and 200 ms (microphone and meeting) |
| Gaps in capture timestamps | 161 ms and 210 ms; **no assigned samples near 141.7 s** |
| Marker span error on the continuous view | **+80 ms** microphone, **-10 ms** meeting |
| Direct matching of short words | **Not reliable** |
| Matching of long utterances | **Reliable** |

Practice-run facts that stay as written in `gate-3-windows-d2-practice-run-results-20261109.md`: common drift of about +205 ms microphone and +200 ms meeting over 380 s (D2 draft O-1) and a 40 to 45 ms microphone-behind-meeting offset (O-2).

## 2. Cause not determined

The cause of the gaps (a playback stall, a capture timestamp artifact, or something else) is **undetermined**. No document, script or report may assert one. The rules below are written so that they hold whichever it is.

## 3. Two named views of a captured track

- **Sample-continuous view:** the track's samples laid end to end in the order captured, with no gap inserted. A sample's position is its index divided by 48000.
- **Timestamped capture view:** each chunk placed by its recorded start time (`startNs`), so a recorded gap appears as missing time.

Every result states which view it used. The original result under the unamended rule is preserved and reported beside any v3a result; v3a never replaces or relabels it.

## 4. Proposed rules

1. **Marker check.** The 100 ms marker check (as in Protocol v3) is applied on the **sample-continuous view** as an explicit amendment. The result on the timestamped view is also reported. Neither is deleted.
2. **Speech-time interval.** For each scored unit, the capture time of the speech is an interval, not a point:
   - **Earliest** = its placement on the sample-continuous view.
   - **Latest** = earliest plus the cumulative recorded gap time before that point.
   - Conservative latency uses the **earliest** speech time. Best-case latency uses the **latest**. Both are reported.
3. **Unlogged interior steps.** If a step in the track clock is not in the gap log, the long utterances before and after it locate it. The step is then carried as a **symmetric uncertainty** around its located position. If the long utterances cannot locate it, the affected units are **INCONCLUSIVE**.
4. **Gaps never remove or excuse.** A gap never removes a unit from the count and never grants SETUP-AFFECTED.
5. **No numeric gap cutoff.** No gap length is chosen as a pass or fail line. A bound that is finite and validated is evaluated normally. Timing that is unbounded or unsupported is INCONCLUSIVE.
6. **A finite interval is not proof of intact capture.** A finite timing interval does not establish that speech crossing a gap was captured intact. If a scored word's presence or endpoint cannot be supported from the recording, the uncertainty never produces acceptance credit: the unit is uncredited in both bounds and stays in the denominator. A **confirmed capture failure** (the word is shown absent or damaged in the preserved recording) and a **measurement limitation** (the word cannot be confirmed either way) are reported as separate outcomes and are never merged or relabelled.
7. **Steps persist.** After an unlogged step the offset persists. Later units use the offset measured at the nearest **preceding** long anchor. Only units between two bracketing anchors that span a detected step are widened by the symmetric uncertainty in rule 3; units outside such a bracket are not widened. **Proposal for review (not an approval):** units before the first long anchor use the continuous-view offset derived from the lead marker (recorded continuous position minus the marker's source time) with the marker's own measured uncertainty, and the step from that lead offset to the first long anchor is computed and applied under this rule like any other step; the lead marker is valid only as the first anchor and only with a valid continuous marker check. The marker's source time is not typed in: it is detected in the frozen source file by the same marker detector as the recording's marker (a supplied value must equal the detected one or the run is INCONCLUSIVE), and the anchor's uncertainty is the recording detection uncertainty plus the source detection uncertainty. The placement of a word on the timestamped timeline also keeps the overlap and audited-overrun reading: the earliest placement is the continuous time plus the smaller of zero and the signed chunk displacement (cumulative gaps minus overlaps and overruns), and the latest is the continuous time plus the larger of the cumulative gap and that displacement. This is a marked proposal for owner approval.

## 5. Unchanged

3 s median limit; 6 s within-limit rule; 95% fraction; denominator; the failure window; Layers B and C; the historical 73/77 result under the original frozen detector-end rule. No acceptance threshold changes.

## 6. Observer requirements to verify later (not yet verified)

- The observer's clock uses the **same QPC epoch and frequency** as the session, or a **known conversion** to the session origin.
- Observations are **visible-text** observations.
- Each observation carries its own **uncertainty**.

## 7. Approval state

| Item | State |
| --- | --- |
| Amendment text hash | PENDING |
| Gap-map reader hash | PENDING (not written) |
| v3a scoring-script hash | PENDING (not written) |
| Owner approval of v3a | PENDING |
| Independent code review of the reader and scoring script | PENDING |

Codex writes the matcher and marker code; Claude Code does not.
