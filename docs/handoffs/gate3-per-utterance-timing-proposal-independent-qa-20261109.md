# Windows Gate 3 — Independent QA of Claude's Proposal

**Verdict: CONDITIONAL — P1 corrections required**

**Claude's proposed direction is technically promising, but its causal interpretation is too confident and its scoring amendment is not ready for approval.**

The new Codex evidence materially improves our understanding of the timing discrepancy. I agree with investigating direct acoustic timing for each utterance rather than relying exclusively on a global linear fit.

However, three distinctions matter:

1. **The 200–210 ms discontinuity is demonstrated in the app's timestamp timeline, not independently established as a physical playback stall.** Capture timing errors remain a plausible explanation.
2. **Direct acoustic matching could improve timing accuracy**, but matching speech in a recording does not automatically prove when that speech physically occurred.
3. **Removing the 100 ms clock-alignment requirement is a substantive protocol amendment.** Keeping the 3 s, 6 s and 95% acceptance criteria unchanged does not make the amendment equivalent to the original protocol.

I verified that Protocol v3 Section 3 requires an INCONCLUSIVE latency result when markers disagree by more than 100 ms. The existing analyzer now enforces that rule. Consequently, the current practice evidence cannot produce an official latency PASS or FAIL under the unamended protocol.

Sources: [Protocol v3](https://github.com/raisinbran/scrb/blob/main/docs/handoffs/SRCB_Windows_Gate3_Diagnostic_Retest_Protocol_v3_Reviewed.md), [Codex's clock-enforcement correction](https://github.com/raisinbran/scrb/commit/cd513ae1b57b4359557c729bd8bfa0c32358ecb5), and [two-timeline audit](https://github.com/raisinbran/scrb/commit/a56004687a4683ccc35d2dc126331888a6d47e60).

## 1. Findings against Claude's interpretation

| Claude's finding | QA assessment |
|---|---|
| Meeting concatenation nearly eliminates the discrepancy | **Agree.** −10 ms marker-span error and interior residuals within 8 ms strongly support a timestamp-placement contribution. |
| The recording contains a distinct timing disturbance | **Agree.** The 161 ms and 210 ms gaps are too large to dismiss as ordinary rollover jitter. |
| Audio is continuous and correct | **Not established.** Concatenating all decoded samples does not prove that no physical audio was lost. |
| A 200 ms wall-clock playback stall occurred | **Plausible, not proven.** Playback stall, capture interruption, or capture timestamp discontinuity remain possible. |
| QPC means the timestamp timeline is unquestionably correct | **Disagree.** A shared clock does not guarantee that device-supplied timestamps faithfully describe audio acquisition. |
| A global linear fit is unsuitable for this recording | **Agree, conditionally.** The residual pattern undermines using one straight-line fit as the sole timing model. |
| Direct per-utterance measurement should replace it | **Conditionally agree.** It needs reliable clock mapping, unique matching and independent uncertainty validation. |
| Removing the marker gate does not relax acceptance | **Disagree as stated.** It removes a validity requirement, although a better-validated replacement could be justified. |

### P1 — The capture implementation permits misleading timestamp gaps

At the examined capture revision `553dd90`, `Track.cpp` uses WASAPI's first-frame QPC timestamp when valid, but falls back to packet-arrival QPC time when `AUDCLNT_BUFFERFLAGS_TIMESTAMP_ERROR` is set. The pipeline also detects packet discontinuities and can adjust its timing correction.

That matters because a change in timestamp source could produce an apparent step without establishing that playback physically stopped.

Codex's report confirms the overall correction stayed constant, which rules out that particular changing-correction explanation. It does not establish the history of packet timestamp-error flags.

Source: [Track.cpp at 553dd90](https://github.com/raisinbran/scrb/blob/553dd9080f452f8a54ccff5cd5fea8d6937438ae/native/windows-capture/src/Track.cpp), [TrackPipeline.cpp](https://github.com/raisinbran/scrb/blob/553dd9080f452f8a54ccff5cd5fea8d6937438ae/native/windows-capture/src/TrackPipeline.cpp).

**Correction:** Describe the disturbance as an *unexplained capture-timeline discontinuity consistent with elapsed wall time not represented by decoded samples*. Do not label it a proven playback stall or a proven timestamp defect.

## 2. Remaining technical questions

### (b–c) Is per-utterance acoustic timing valid?

**Yes in principle, provided both measurement endpoints can be placed on one independently verified timebase.**

The repository establishes that Windows capture uses QPC-derived time and exposes a session origin. It does not independently establish that the private playback harness and UI observer use the identical QPC epoch, scaling and origin.

The following must be verified from the existing code and practice evidence:

1. **Clock identity:** Capture, harness and UI observer timestamps use the same Windows QPC basis, or have a documented, validated conversion. Verify actual implementations, not simply the use of the word *monotonic*.
2. **Session origin:** The app's `clockOriginNs`, chunk `startNs` and observer timestamps can be converted into one timeline without a fitted clock-rate adjustment.
3. **Audio integrity:** Compare the original source and recorded samples around 141.7 s. Determine whether speech was omitted, delayed or preserved, and inspect retained discontinuity and playback logs.
4. **Independent matching:** Locate speech using the source audio, not the observed transcript or recognition results. The latter would introduce circular scoring.

The first three are mostly read-only checks. However, the available GitHub sources do not contain the private harness implementation or all packet-level evidence. Full verification therefore requires the retained local files.

Relevant code: [Session.cpp](https://github.com/raisinbran/scrb/blob/553dd9080f452f8a54ccff5cd5fea8d6937438ae/native/windows-capture/src/Session.cpp#L417-L432) and [marker_clock.py](https://github.com/raisinbran/scrb/blob/a56004687a4683ccc35d2dc126331888a6d47e60/scripts/gate3-retest/marker_clock.py).

**Important correction to Claude:** The lead marker cannot establish a constant offset that the trailing marker has already contradicted by 200 ms. An amended method needs independently verified QPC alignment, not merely permission to ignore the trailing marker.

### (d) Does the unexplained microphone +80 ms matter?

Yes, but it does not automatically disqualify per-utterance measurement.

The microphone's 80 ms concatenated span discrepancy corresponds to approximately 3,840 samples at 48 kHz. The reported 168-sample overrun accounts for only 3.5 ms.

It remains necessary to determine whether individual microphone utterances are accurately placed and intact. Direct matching could accommodate local timing variation, but must not silently compensate for lost audio.

The existing six anchors are insufficient to certify all 65 microphone utterances.

### (e) Uncertainty and uniqueness

The six successful matches are three-second passages. They do **not** establish that short, single-word utterances can be located with the same precision.

**Recommended provisional timing limit: ±50 ms maximum acoustic endpoint uncertainty, subject to practice validation.**

This is a proposed ceiling, not a demonstrated capability. It allows margin above the reported approximately ±25–28 ms combined anchor uncertainty while retaining a reasonably narrow timing bound.

A match should count as unique only when the frozen correlation criteria identify one source-consistent occurrence within the predeclared search interval. Multiple plausible occurrences must produce a bounded interval, not an arbitrarily selected winner.

**I would not approve a numerical correlation-score or runner-up threshold yet.** The supplied summary omits the actual peak distributions, including short-word and negative-control cases. Choosing a number such as 0.8 without that evidence would be arbitrary.

The pre-scored practice validation must establish those thresholds and test repeated short words.

For Layer A, the expected improvement is removal of the observed approximately 100 ms interior affine-fit bias, assuming the QPC mapping is valid. The uncertainty is not eliminated: at ±50 ms acoustic uncertainty and the protocol's maximum 250 ms observer interval, a unit could have approximately **350 ms between its best-case and conservative latency bounds**, before any additional clock uncertainty.

That remains compatible with the existing bounds approach, but near-threshold cases may still be INCONCLUSIVE.

### P1 — Missing acoustic matches must not be misclassified

Claude proposes classifying unsuccessful source-audio matches as `SETUP-AFFECTED/UNIDENTIFIED`.

That conflates three different problems.

| Condition | Correct treatment |
|---|---|
| Source speech cannot be located uniquely in recorded audio | Reference timing unresolved; retain uncertainty and denominator |
| Speech is present, but its live transcript cannot be identified | Existing `UNIDENTIFIED` outcome |
| A documented harness playback or observer failure affected the unit | Existing `SETUP-AFFECTED` outcome |
| The app failed to capture physically delivered speech | Potential app capture failure; not automatically a setup exemption |

This matters because `SETUP-AFFECTED` units receive best-case credit under the existing analyzer. Incorrect classification could make acceptance easier.

Source: [analyze-bounds.py](https://github.com/raisinbran/scrb/blob/a56004687a4683ccc35d2dc126331888a6d47e60/scripts/gate3-retest/analyze-bounds.py).

## 3. Proposed protocol amendment

I recommend replacing Claude's proposed Section 3 language with the following conditional text. **This is a review draft, not authorization to implement or freeze it.**

> **Proposed Protocol v3a — Acoustic timing**
>
> For a track independently verified to share the app's QPC timebase with the external observer, latency may be measured using the preserved timestamp-placed recording and independently matched reference audio.
>
> Each eligible utterance's last-word acoustic endpoint shall be determined without using the app's transcript output, using frozen occurrence-aware matching criteria and conservative uncertainty bounds.
>
> The original 100 ms lead/trail marker result shall remain recorded and reported. For this verified QPC-direct method only, a disagreement caused by a nonuniform source-to-recording timeline shall not independently invalidate latency scoring. The markers remain diagnostic checks; they do not authorize an unverified clock mapping.
>
> Any unresolved clock relationship makes the affected track's latency INCONCLUSIVE. Ambiguous acoustic endpoints must not receive unjustified publication credit. A missing acoustic match is not automatically a harness failure.
>
> The frozen denominator, 3 s median, 6 s threshold, 95% target, failure window, Layers B/C and historical November 7 results remain unchanged.

This wording makes the replacement of the existing synchronization criterion explicit rather than disguising it as a reporting-only adjustment.

## 4. Minimum implementation and validation

I would authorize a **read-only feasibility check now**, but not the amendment implementation yet.

| Component | Necessary change after approval |
|---|---|
| `marker_clock.py` | Preserve existing affine mode; add an explicitly selected, independently validated QPC-direct mode, with original disagreement retained |
| Per-utterance matcher | New offline source-to-recording alignment, acoustic endpoint bounds, uniqueness evidence and uncertainty |
| `analyze-bounds.py` | Accept the new timing mode only with verified evidence; distinguish unresolved reference timing from transcript `UNIDENTIFIED` |
| Regression tests | Check 200 ms discontinuity, repeated/short utterances, missing captured audio, false setup credit, invalid QPC mapping and 6 s boundary outcomes |

I would **not** modify native capture, change transcription thresholds or add another physical recording for this investigation.

The focused test should demonstrate that the new logic would reject ambiguous matches and would not turn a deliberately invalid clock or missing acoustic reference into a false PASS. Preserve the existing tests that enforce v3's current 100 ms rule.

### (g) Must the suspected stall be fixed before the scored run?

Not necessarily.

If the preserved recording shows complete, individually locatable speech and clock alignment is validated, the underlying playback timing variation need not be fixed merely to measure latency. It should be documented.

If speech was lost by the app's capture path, that is potentially an application defect. It must not be dismissed as a harness problem. A demonstrated harness failure should instead receive the protocol's appropriate setup treatment.

The causal mechanism may remain unknown, but **the integrity and timing of the scored audio cannot remain unverified**.

## 5. Final disposition

**P1 corrections before approval:**

- Establish the common clock relationship from existing executable code and logs.
- Validate acoustic matching on both short and long speech, including the microphone's residual timing structure.
- Prevent unresolved acoustic references or capture failures from becoming automatic best-case setup credit.
- Explicitly amend, rather than silently bypass, the 100 ms clock validity rule.

**P2:** Do not label the timing disturbance a proven wall-clock playback stall. Keep the existing audio-gap evidence and uncertainty visible.

**Recommended next step:** Send Codex one narrowly scoped, read-only feasibility task covering clock identity, audio integrity near 141.7 s, and short-word correlation reliability using the existing practice files. No new recording, no implementation changes and no additional broad review cycle are needed for that diagnostic task.

If those checks pass, the amendment can receive final independent review and owner approval before implementation and the scored-run freeze. If they fail, the existing v3 INCONCLUSIVE result remains.

**QA usage and error reporting:** ChatGPT Chat; November 9, 2026; independent review and repository inspection; five-hour and weekly allowance unavailable to this session; no repository changes or test execution. Two initial filename lookup guesses were incorrect and corrected without affecting the findings. Codex's reported 96 Python tests and 819 passing npm tests were not independently rerun here.
