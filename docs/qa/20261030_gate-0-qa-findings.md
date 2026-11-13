# Meeting Scribe — Gate 0 QA Findings

**Review date:** 2026-10-30  
**Repository:** [raisinbran/scrb](https://github.com/raisinbran/scrb)  
**Primary document:** [`phase0/evidence/gate-0.md`](https://github.com/raisinbran/scrb/blob/main/phase0/evidence/gate-0.md)  
**Review type:** Read-only review of the committed Gate 0 report, associated plans, capture protocols, selected probe source code, and available evidence files.  
**Disposition:** **Conditional GO for continued development; do not treat Gate 0 as unqualified proof of production recording reliability.**

## Executive assessment

Gate 0 contains substantial feasibility evidence across Windows and Apple Silicon macOS and generally documents technical limitations candidly. However, the approval conclusion is stronger than the supporting evidence in some areas. Several statements conflict with repository state, verification requirements, or reported test results.

The principal reliability concern is the macOS eight-hour drift test: **audio capture stopped after approximately 2 hours 9 minutes** when `coreaudiod` restarted, although the probe process ran to completion and exited without an error. The owner accepted postponing the complete test until Gate 2. This should be characterized as an explicit deferral, not an unqualified capture pass.

Sources: [Gate 0 — long drift run and checklist](https://github.com/raisinbran/scrb/blob/main/phase0/evidence/gate-0.md#L770-L825) · [macOS run summary](https://github.com/raisinbran/scrb/blob/main/phase0/artifacts/capture/macos/drift-8h-summary.json) · [macOS run alignment](https://github.com/raisinbran/scrb/blob/main/phase0/artifacts/capture/macos/drift-8h-alignment.json)

## QA findings

### High — H1: Current repository status contradicts the report

**Observation:** The report states that no production application code has been created and that Phase 1 has not started. At review time, the repository already contained an Electron desktop application, contracts, and backend packages. `AGENTS.md` records a temporary owner decision lifting sequential gate approval requirements.

**Impact:** A reader cannot accurately determine whether Gate 0 approval is a prerequisite that was honored, waived, or bypassed. This weakens the audit trail and may lead later reviewers to assume production development has not begun.

**Required action:** Update the status and timeline to acknowledge the production work and its explicit waiver, distinguishing **approval of Phase 0 findings** from **authorization for Phase 1 or later work**. Preserve any effective restrictions that remain in force.

**Evidence:** [Gate 0 — status](https://github.com/raisinbran/scrb/blob/main/phase0/evidence/gate-0.md#L1-L10) · [AGENTS.md — temporary owner decision](https://github.com/raisinbran/scrb/blob/main/AGENTS.md#L1-L23) · [Desktop app](https://github.com/raisinbran/scrb/tree/main/apps/desktop) · [Packages](https://github.com/raisinbran/scrb/tree/main/packages)

### High — H2: End-to-end capture synchronization has not been independently demonstrated

**Observation:** The capture protocols request a real meeting-app source and paired sync signals to measure offset/drift. Much of the reported evidence comes from synthetic tone generators and timing estimates based on captured packet/device timestamps. Those are valuable engineering measurements, but not the same as independently verifying the placement of a common audible event in both recorded tracks through an actual meeting application.

**Impact:** Clock calculations and timestamps could appear consistent while an application-specific capture path or audio pipeline introduces latency or misalignment.

**Required action:** On each OS, perform a real Teams or Zoom capture with a shared, independently measurable audio reference present on the meeting-app and microphone tracks. Measure start offset, sustained drift, and any discontinuity/recovery behavior from recorded audio content. Record the measurement method and results. If deferred to Gate 2, document this explicitly in Gate 0.

**Evidence:** [Windows capture protocol](https://github.com/raisinbran/scrb/blob/main/phase0/protocols/windows-capture.md#L8-L35) · [macOS capture protocol](https://github.com/raisinbran/scrb/blob/main/phase0/protocols/macos-capture.md#L8-L18) · [Alignment analyzer](https://github.com/raisinbran/scrb/blob/main/phase0/scripts/analyze_alignment.py)

### High — H3: The retained 15% final-pass transcription improvement target is unresolved

**Observation:** The GPU approach proposes the same large-v3-turbo model for both live and final transcription, and the report notes there is no demonstrated model-quality gap to deliver the required **at least 15% fewer word errors** in the final pass. The owner decision nevertheless retains that target.

**Impact:** This release target has no demonstrated implementation path under the selected GPU configuration. Gate 0 should not imply it has been satisfied by the measured transcription runs.

**Required action:** Define and benchmark a final-pass method (such as segmentation changes, added context, or correction-aware reprocessing) against the same evaluation clips, comparing final WER against the actual live output. Alternatively, seek an explicit owner-approved target revision. Assign verification to the appropriate subsequent gate.

**Evidence:** [Gate 0 — GPU transcription and proposal](https://github.com/raisinbran/scrb/blob/main/phase0/evidence/gate-0.md#L345-L367) · [Development Plan — quality targets](https://github.com/raisinbran/scrb/blob/main/dev-plan/Meeting%20Scribe%20-%20Development%20Plan%20%28v2.0%29.md#L181-L199)

### High — H4: The macOS eight-hour capture requirement was not completed

**Observation:** The attempted eight-hour run produced approximately 7,733 seconds of audio before `coreaudiod` restarted. The capture process then received no more audio, reported no error, and exited successfully at the end of the requested run. The report acknowledges this and the owner's acceptance of a Gate 2 rerun, yet checks the macOS capture item as complete.

**Impact:** Silent loss of recording for most of a meeting is a critical production risk; process exit status alone is not evidence of continued audio capture. The observed failure also demonstrates the importance of an audio-arrival watchdog and audio-service restart recovery.

**Required action:** Label the long-duration test **incomplete / deferred by owner**, not simply passed. Establish a Gate 2 acceptance test covering detection of stopped streams, automatic recovery or explicit user warning, accurate missing-audio marking, and successful eight-hour native capture. Do not infer recoverability from the Phase 0 probe.

**Evidence:** [Gate 0 — macOS long run](https://github.com/raisinbran/scrb/blob/main/phase0/evidence/gate-0.md#L770-L795) · [Gate 0 — checklist](https://github.com/raisinbran/scrb/blob/main/phase0/evidence/gate-0.md#L797-L817) · [Run summary](https://github.com/raisinbran/scrb/blob/main/phase0/artifacts/capture/macos/drift-8h-summary.json) · [Capture contract — audio-service restart](https://github.com/raisinbran/scrb/blob/main/phase0/design/capture-contract-draft.md)

### Medium — M1: macOS worker-crash tests do not combine all intended conditions

**Observation:** During the macOS CPU stress tests, AI workers were actually killed but the meeting-app track was silent due to System Audio Recording permission attribution. The Metal reruns captured application audio but terminated no workers, because the GPU jobs finished before the scheduled kills.

**Impact:** Each test supports a separate aspect of feasibility, but neither alone establishes the complete scenario of **live, non-silent application capture continuing while the AI worker is force-killed**.

**Required action:** Run a combined test with an authorized audible process tap and a reliably long-running worker that is deliberately terminated while both tracks are recording. If postponed to Gate 2/3, note the evidence split and the deferred test.

**Evidence:** [Gate 0 — macOS worker tests](https://github.com/raisinbran/scrb/blob/main/phase0/evidence/gate-0.md#L587-L652)

### Medium — M2: Severe Windows microphone loss remains an unresolved production risk

**Observation:** The Windows eight-hour stress test reported approximately **160.3 seconds of padded/lost microphone audio**, including whole-process stalls lasting 3–14 seconds. The report suggests a 1–2-second microphone buffer, but correctly observes that such a buffer cannot alone protect against a 10-second stall.

**Impact:** Per-chunk timestamps preserve alignment but cannot recover microphone audio never delivered by the device. The original voice content remains missing, even if the timeline accurately marks its absence.

**Required action:** Define a specific Gate 2 loss/recovery criterion under representative CPU/GPU load. Retest the actual Phase 2 adapter with isolated capture, bounded AI resource usage, appropriately sized buffers, watchdogs, and explicit missing-audio markers. Distinguish **synchronization preservation** from **audio preservation** in pass criteria.

**Evidence:** [Gate 0 — eight-hour Windows run and consequences](https://github.com/raisinbran/scrb/blob/main/phase0/evidence/gate-0.md#L171-L215) · [Windows eight-hour summary](https://github.com/raisinbran/scrb/blob/main/phase0/artifacts/capture/dualprobe/eight-hour-summary.json)

### Medium — M3: Target changes need an explicit exception or process clarification

**Observation:** The development plan says Phase 0 may relax quality targets only if measurements show they cannot be met on 16 GB hardware. The final diarization target was changed from 20% to about 25% DER, and summary recall from 90% to about 80%, based on observed model accuracy rather than a demonstrated 16 GB hardware limitation.

**Impact:** Owner approval of revised thresholds is documented, but the change mechanism does not clearly match the plan's stated authorization rule.

**Required action:** Record an owner-approved exception to the restriction or amend the rule to allow evidence-driven quality-target adjustments, with rationale, effective date, and downstream verification requirements. Ensure the plan, requirements, and gate note agree.

**Evidence:** [Development Plan — target-change rule](https://github.com/raisinbran/scrb/blob/main/dev-plan/Meeting%20Scribe%20-%20Development%20Plan%20%28v2.0%29.md#L179-L199) · [Owner decision table](https://github.com/raisinbran/scrb/blob/main/phase0/HANDOFF-PARALLEL.md#L24-L47) · [Gate 0 — decision](https://github.com/raisinbran/scrb/blob/main/phase0/evidence/gate-0.md#L827-L834)

### Low — L1: macOS sleep/wake gap arithmetic needs correction

**Observation:** The report says approximately 217 seconds of recorded audio across 282 seconds of wall-clock time, but describes the recording as approximately 41 seconds shorter than the wall-clock span. The direct difference is about **65 seconds**. The 41-second figure may refer to a different basis, but that basis is not explained.

**Impact:** Imprecise timing descriptions make sleep/wake recovery hard to audit.

**Required action:** Clarify wall-clock duration, probe timer duration, actual sleep duration, and recorded-audio duration; recompute or relabel the cited deficit.

**Evidence:** [Gate 0 — macOS sleep/wake](https://github.com/raisinbran/scrb/blob/main/phase0/evidence/gate-0.md#L748-L752) · [Sleep/wake test analysis](https://github.com/raisinbran/scrb/blob/main/phase0/artifacts/capture/macos/devices/sleep-wake-analysis.txt)

## Additional risks to carry into later gates

**Summary-model quality (Gate 6):** Qwen3.5-9B achieved roughly **61% recall on Windows CPU, 80% on CUDA, and 76% on Apple Metal**, whereas the revised acceptance line is about 80%. These small, platform-dependent evaluations do not establish consistent performance at that threshold. Expand the evaluation set, verify source-link accuracy, and measure precision/invented items as well as recall.

Source: [Gate 0 — summary model evidence](https://github.com/raisinbran/scrb/blob/main/phase0/evidence/gate-0.md#L461-L507) · [Metal results](https://github.com/raisinbran/scrb/blob/main/phase0/artifacts/summary-metal/results.json)

**Diarization quality (Gate 4):** Live and offline diarization varied across machines and test meetings; some configurations exceed the revised roughly 25% DER final-pass target. A robust confidence/fallback strategy and representative multi-meeting measurements remain important.

Source: [Gate 0 — Windows diarization](https://github.com/raisinbran/scrb/blob/main/phase0/evidence/gate-0.md#L369-L425) · [Gate 0 — macOS diarization](https://github.com/raisinbran/scrb/blob/main/phase0/evidence/gate-0.md#L688-L701)

## Recommended gate disposition and immediate actions

**Recommendation: Conditional GO for continued development; NO unqualified Gate 0 sign-off as currently written.** This does not mean the feasibility work is unsuccessful. It means an approval should accurately distinguish proven properties, accepted exceptions, and outstanding production risks.

1. **Correct the record:** acknowledge production code already committed, reconcile the owner waiver, fix the sleep/wake arithmetic, and identify the test machine/build/source IDs.
2. **Make gate status explicit:** replace undifferentiated checked items with **Passed**, **Partially verified**, or **Deferred by owner**, referencing the relevant evidence and approval decision.
3. **Formalize deferrals:** assign macOS eight-hour/audio-service recovery, Windows lost-mic-audio mitigation, independently measured real-app dual-track sync, and combined worker-crash capture tests to Gate 2 or Gate 3 with objective acceptance criteria.
4. **Preserve unresolved quality targets:** define the path for 15% final-pass WER improvement, and record the explicitly approved exceptions/adjustments for DER and summary recall.
5. **Request formal sign-off only against the corrected checklist:** capture the owner's decision and date, any waivers, and who is responsible for resolving the deferred tests.

## Review boundaries

This review inspected committed GitHub documents, code snippets, scripts and reported evidence. It **did not** independently rerun the Windows/macOS hardware probes, reproduce benchmark metrics from raw audio, or certify the current application as production-ready. Findings reflect the repository state observed during the review on **2026-10-30**.

**Repository changes made:** None. This report is a separate QA deliverable.
