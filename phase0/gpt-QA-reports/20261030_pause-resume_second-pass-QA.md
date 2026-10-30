# Meeting Scribe - Pause/Resume Plan: Second-Pass QA

**Date:** 2026-10-30  
**Disposition:** **CHANGES REQUIRED - NOT APPROVED FOR IMPLEMENTATION**  
**Review type:** Read-only design and cross-document consistency review; no code changed or tests executed.  
**Reviewed inputs:**
- `pause-resume.md` (uploaded revised plan; 25 failure cases; currently awaiting owner approval).
- `20261030_pause-resume_QA(1).md` (uploaded first-pass QA of an earlier version; 22 failure cases).

**Additional cross-checks:** V1 Requirements v1.2, `crash-safe-chunks.md`, `capture-contract-and-clock.md`, the 2026-10-30 owner decisions, and the current TypeScript contract. The GitHub files were inspected on 2026-10-30. GitHub links below point to `main` and may change after later commits. All `pause-resume.md` line numbers refer to the **uploaded revised plan**, not the older draft quoted in the first-pass QA.

## Executive result (read this first)

The revised plan adopts the first QA's right fundamental decisions: **fail closed on Pause**, **retain durable pause evidence**, and **do not hide recorded audio inside a Paused span**. I agree with the first QA's overall *not approved* disposition and its recommendations on the three original owner decisions, subject to conditions below.

However, those improvements are not yet fully specified or reconciled with the approved recovery plan. **Four P0 blockers** remain, along with **eight secondary findings** and test weaknesses. Several issues are newly exposed by the revision, rather than missed defects in the older draft. No wholesale redesign is needed; update the plan and affected dependencies before approving implementation.

**Priority order:** (1) define exactly when Pause takes effect and prevent in-flight leakage; (2) prevent the crash supervisor from restarting a worker killed because Pause failed; (3) make gate state and visible UI state consistent on Resume; (4) complete durable recovery, timeline, and contract details.

### Summary of findings

| ID | Severity | Finding | Revised plan location |
| --- | --- | --- | --- |
| P0-1 | Blocker | "After you pressed Pause" is not the worker's later cutoff | 9, 19-23, 28-34, 81 |
| P0-2 | Blocker | Failed-Pause worker kill conflicts with automatic worker restart | 34, 85; approved crash plan decision 4 |
| P0-3 | Blocker | Capture-thread gate alone does not specify in-flight/queued audio protection | 22-23, 28-34, 62-65 |
| P0-4 | Blocker | Gate may reopen during Resume while UI still reports Paused | 24-25, 32, 87-89 |
| H1 | High | Crash-triggered kill cannot guarantee preservation of all pre-Pause audio | 22, 34, 81, 142 |
| H2 | High | `session.log` durability/recovery and ambiguous gaps not fully defined | 38-54, 91-94 |
| H3 | High | Session clock, `elapsedMs`, playback/export timing need a formal mapping | 24, 40-42, 58, 65 |
| H4 | High | Approved dependency-plan and typed-contract changes are incomplete | 62-67, 121-127, 144 |
| H5 | Medium | Paused low-disk policy differs from approved automatic-stop policy | 100; approved crash plan decision 5 |
| H6 | Medium | Sleep/wake behavior needs precedence with four-hour auto-stop | 98, 103, 138 |
| H7 | Medium | "Nothing is being saved" and "disk use stays flat" are too literal | 22, 24, 103, 133-136 |
| H8 | Medium | Permission-loss Resume policy conflicts with partial-track Resume policy | 87-89, 99 |

## A. Comparison against the first-pass QA

The first-pass QA evaluated a **previous** version of the plan; its old line-number links are not interchangeable with the uploaded revised file.

### Original three blockers

| First-pass finding | Revised plan response | Second-pass assessment |
| --- | --- | --- |
| **P0-1: failed Pause was fail-open** | Shared gate; delayed/retried acknowledgment; kill worker and end recording if gate cannot be confirmed (lines 21, 28-34, failure 1) | **Direction corrected, not fully resolved.** Click-to-cutoff lag, queued audio, supervisor restart, and Resume/UI races remain (new P0-1 to P0-4). |
| **P0-2: chunks alone cannot reconstruct Pause** | Adds `audio/session.log`, explicit pause/resume events and reconciliation (lines 38-54) | **Partially resolved.** Correct architectural addition; incomplete log format, durable ordering, and unknown-span recovery semantics (H2). |
| **P0-3: global Paused span could hide recorded audio** | Only labels intervals where neither track holds audio; retains per-track edges (line 58, failure 21) | **Resolved as a design rule, pending tests and contract support.** The approved per-track `TimelineGap` addition must be applied (H4). |

### Original eight high-priority clarifications

| First QA | Current status | Remaining qualification |
| --- | --- | --- |
| **H1: precise cutoff and in-flight data** | **Partial** | Plan distinguishes pre/post cutoff but not click time, already-queued frames, or frames straddling it (P0-1, P0-3). |
| **H2: explicit break for pauses under 100 ms** | **Addressed in plan** | Line 65 and failure 13 explicitly cover 0/20/50/99 ms; implementation tests still required. |
| **H3: watchdogs during pause** | **Addressed in plan** | Lines 69-77 retain device/permission/source/disk checks while suspending silence/ASR false positives; verify active checks run upstream of the gate. |
| **H4: internal transitions, retries and Stop priority** | **Partial** | Internal steps, command IDs and Stop priority added, but Resume/UI and worker-restart race semantics remain (P0-2, P0-4). |
| **H5: meeting-app exit must not override user Pause** | **Addressed in plan** | Failure 17 preserves `user` reason across timer expiry/reload. Test precedence with the four-hour stop as well. |
| **H6: hold `writer.lock` while paused** | **Addressed in plan** | Failure 11 specifies this; update the approved crash plan wording and verify it in recovery tests (H4). |
| **H7: command acknowledgment vs chunk closing/device reopening** | **Partial** | Lines 85, 89, 109 separate some timing tests; a truthful pending Resume/UI state still needs definition (P0-4). |
| **H8: correct Gate 2 targets** | **Addressed in plan** | Lines 103-119 use 4 hours, <50 ms drift, <=15 s loss per track; retain one 8-hour run per machine before Gate 8. |

### Original open questions and owner decisions

- **Failed Pause:** Agree with first QA: privacy-first, never quietly continue Recording. The revised plan adopts this, but the failure shutdown must suppress supervisor auto-restart.
- **Sub-100 ms Pause:** Agree: explicit command boundary, independent of gap heuristics; revised plan incorporates this.
- **Watchdogs:** Agree: suppress content-silence and intentional-stall interpretation, *not* device/transport/permission/source/disk liveness; revised plan incorporates this.
- **Owner decision 1 - keep capture streams open:** Conditionally agree with **A** because Resume is quicker and devices can be monitored, if no-post-cutoff capture/storage/transcription guarantees are demonstrated. Mic activity indicators may remain on; the plan must explain that clearly.
- **Owner decision 2 - four-hour forgotten Pause auto-stop:** Agree, with wakeup/clock/low-disk precedence spelled out.
- **Owner decision 3 - distinct export marker:** Agree. It is metadata, not spoken text; validate positions in DOCX and PDF.
- **New owner decision 4 - stop when Pause cannot be confirmed:** Agree. Must also disable automatic worker restart and report any pre-Pause audio lost by forced termination.
- **New owner decision 5 - `session.log`, plan amendments, `pauseFailed`:** Agree in principle. Approve only after storage, shutdown and contract details below are incorporated.

## B. Blocking findings and required corrections

### P0-1 - UI press time and actual cutoff are different moments

**Plan references:** 9, 21-23, 28-34, 81. **First QA:** P0-1 and H1, only partly satisfied.

**Defect/risk:** The plan promises that audio heard **after the user pressed Pause** is not saved, yet says the **worker** chooses the cutoff when it handles the command. UI dispatch, IPC scheduling, and a stalled worker can delay that cutoff. Audio produced during the delay may reach an encoder, disk, live inference, or profiles. Meeting the 200 ms response target does not close this logical gap.

**Required change:** State the exact privacy boundary in one authoritative timebase. Either:
1. **Meet the existing press-time promise:** securely carry the user-action time to the worker, align it to capture timestamps, and make downstream writes reversible or delayed/quarantined enough to exclude frames after that time (including in a delayed/failed command case); **or**
2. **Seek explicit owner approval to change the promise:** distinguish `Pausing` (capture may still be active) from confirmed `Paused` (no new capture is saved), and disclose the possible delay instead of claiming nothing since the click was recorded.

Do **not** silently weaken the privacy promise in implementation. If implementing option 1 requires holding audio before durable storage, reconcile the delay with the separately approved crash-loss/durability guarantees; audio already committed to immutable chunks cannot simply be wished away.

**Pass criteria:** With an externally timed synthetic signal immediately before and after click, force 0/50/200/500+ ms command delays, stalls and retries. Verify the declared boundary against native timestamps and that post-boundary signal never exists in saved/recovered chunks, partial files, ASR or profile inputs.

### P0-2 - Forced worker death can trigger an unsafe auto-restart

**Plan references:** 34, 85, 142. **Dependency:** [`crash-safe-chunks.md`, owner decision 4 and failure 10](https://github.com/raisinbran/scrb/blob/main/docs/plans/crash-safe-chunks.md).

**Conflict:** The revised Pause plan kills the audio worker and ends the meeting if gate closure cannot be confirmed. The already approved crash-safe plan restarts a crashed worker **up to three times** while the app remains running. Without an explicit distinction, the app may reopen capture streams immediately after failing to honor Pause.

**Required change:** Add a terminal failure reason such as `pauseFailed` at the supervisor/app-core level (not merely a display warning); classify intentional fail-closed termination separately from unexpected crashes, suppress restarts and auto-resumes, and persist the terminal intent across renderer reload and recovery. A new Start must be an explicit user action. Update the approved crash-safe plan's restart decision and its failure 10.

**Pass criteria:** Deliberately delay/loss a Pause acknowledgment, force worker kill, let the real supervisor attempt recovery, and verify: no restarted stream, no resumed recording, persistent reason across UI relaunch, no audio after the protected boundary, and an appropriately marked meeting end.

### P0-3 - In-flight audio can outlive a capture-thread gate check

**Plan references:** 22-23, 28-30, 62-65. **First QA:** H1 partially addressed.

**Defect/risk:** "Checked on each capture thread" does not define how to handle (a) an audio frame already past that check, (b) a frame spanning the cutoff, (c) packets queued to the 30-second buffer/encoder/live feed/ASR/speaker pipeline, or (d) stale OS packets delivered after Resume. A single atomic value is not sufficient unless every path that can commit or interpret audio honors its effective timestamp.

**Required change:** Document a single ownership model for the gate, atomic visibility/order across threads, timestamp-based trimming of boundary-crossing frames, queue-draining/discard rules, and stale-device-buffer handling on Resume. One well-designed central gate plus verified downstream boundaries is preferable to redundant ad hoc checks. Keep **pre-cutoff** frames; reject **post-cutoff** frames regardless of delivery order.

**Pass criteria:** Race capture threads with gate closure; stall writer/encoder/ASR; put unique speech and pulses on both sides of a split frame; deliver pre-resume stale OS buffers after reopening. Inspect *both* tracks and every derived input/output, not just final files.

### P0-4 - UI can claim "Paused" while the gate permits recording

**Plan references:** 24-25, 32, failures 3-5 (87-89). **First QA:** H4/H7, partially addressed.

**Defect/risk:** Resume opens the gate before the app displays Recording (which waits for audio flow). If neither source becomes ready, failure 4 says **stay Paused**, but does not say whether the gate is reclosed. If a stream later recovers, audio might flow while the UI still asserts "Paused. Nothing is being saved." This is a **possible state-machine path**, not proof of a current code bug; the design must exclude it explicitly.

**Required change:** Require the displayed state to reflect the real gate state. Use an honest *Resuming*/*waiting for source* indication (even if the public enum remains unchanged), or hold the gate closed until readiness is established. On Resume failure, atomically re-close/verify the gate before returning to visible Paused. Stop and late acknowledgments must not reopen it afterward.

**Pass criteria:** Resume with both streams unavailable; permit them to recover at arbitrary times, including after a timeout/UI reload; inject late `resume` replies. Assert `UI shows Paused => no new audio can pass to any recording sink`, and `Stop => gate remains closed`.

## C. Additional high-/medium-priority findings

### H1 - Pre-Pause preservation vs forced termination

**References:** 22, 34, 81, 142; crash-safe plan's approved crash-loss limits.

The plan says pre-cutoff audio is kept and suggests "everything saved before the cutoff is kept." Yet killing the worker can discard pre-cutoff audio still in the 30-second holding buffer or unfinished `.part` pages. The approved crash plan accepts about **1 second** for a program crash and **5 seconds** for a power cut, with a marked ending. That is a controlled exception to a literal "all pre-cutoff audio" guarantee. **Revise:** explicitly state which crash-loss limit applies to a deliberate privacy shutdown; flush safely if possible without delaying the privacy cutoff; preserve/recover partial files and mark unavoidable lost audio. Test loss against the accepted budget under forced termination.

### H2 - Session-log crash consistency and honest uncertainty

**References:** 38-54, failures 7-10.

Adding `audio/session.log` is the correct response to the first QA. Still unspecified: version/framing/checksum or torn-line detection, sequence ordering, duplicate IDs, OS flush/force ordering, handling of a log write failure, event precedence with `chunks.log`, and explicit recovery of an **incomplete transition**. Failure 8 labels a gap `audio missing` when the gate closed but the pause record was never written. That avoids falsely declaring it paused, but can also falsely imply lost audio; mere absence of packets proves neither that the user paused nor that capture failed. **Revise:** define a durable event schema and deterministic reconstruction state, including an `unknown/unverified` interpretation if the evidence cannot distinguish a pause from lost audio. If the public `TimelineGap` enum cannot express this, obtain a contract change or define an honest UI representation. Never invent a successful Pause; do not silently misclassify uncertainty as confirmed loss. Explicitly cover a pause with no chunks on either track.

### H3 - Timebases and elapsed duration

**References:** 24, 40-42, 58, 65; `RecordingState.elapsedMs` contract comment.

The session timeline includes paused time, while `elapsedMs` excludes it. "Playback, timeline, transcript, exports and `elapsedMs` all use the same spans" does not specify how full meeting timestamps map to the shortened active-recording duration. **Revise:** define functions/semantics for `sessionTimeNs`, wall duration, `elapsedMs`, audio positions, paused marker offsets, and track-local gaps. Decide whether an export pause marker uses wall/session time or compressed playback time, and require a consistent mapping in both exports. Test repeated, long and zero-duration pauses plus sleep and partial-track Resume.

### H4 - Dependency and contract amendments are too narrow

**References:** 62-67, 121-127, 144; approved plans and `packages/contracts/src/types.ts`.

The proposed amendments cover a shared gate and log, but omit the **intentional worker-shutdown exception** (P0-2), **hold `writer.lock` for the entire active meeting including Pause**, **event/log recovery ordering**, and **degraded/transition UI behavior**. The current typed contract still lacks the already approved **per-track `TimelineGap.track`** and pause reason on `RecordingState`; `pauseFailed` also remains proposed. **Revise:** update both dependency plans, supervisor rules, both adapter plans, mock/backend validation, IPC/runtime contract changes, and recovery tests in one reviewed change set before implementation. Do not mistake an approved-but-deferred contract proposal for existing code.

### H5 - Disk threshold mismatch

**References:** failure 16 (line 100); approved crash-safe plan owner decision 5.

The approved crash-safe policy says to **stop and save cleanly at 100 MB remaining**, but the Pause plan says only to **refuse Resume and offer Stop** below 100 MB. These are different policies. **Revise:** apply automatic stop at the threshold even while paused, unless the owner approves an explicit exception. Test a full disk while buffered pre-Pause audio is still flushing.

### H6 - Sleep/auto-stop precedence

**References:** failure 14 (line 98), failure 19 (line 103), decision 2 (line 138).

"Stays paused after wake" and "auto-stop after four hours" need ordering. If four hours of sleep-aware paused time expire during system sleep, the app cannot necessarily execute Stop until wake. **Revise:** on wake, check the persisted deadline before permitting any Resume; stop/seal the meeting if elapsed, keep devices gated, and notify. Specify what happens when clock sources disagree at wake. Test just below/above the deadline, wall-clock changes, S3/hibernate, and unexpected sleep duration.

### H7 - The pause label and flat-disk assertion misstate normal behavior

**References:** 22, 24, 103, 133-136.

The plan expressly allows **pre-Pause audio to finish writing after Pause**. Therefore the message "Paused. Nothing is being saved" and failure 19's "disk use stays flat" are too literal. Disk writes and metadata can continue briefly without violating the privacy rule; the OS mic indicator may remain illuminated. **Revise:** state "Paused - no new audio is being recorded" (or comparable, after validating the actual guarantee), and test that disk growth **settles after draining pre-Pause data**, rather than asserting zero bytes written from the instant Pause is shown. Help must explain that devices remain open.

### H8 - Permission-loss policy vs partial Resume

**References:** failures 3-5 (87-89) and 15 (99).

Failures 3 and 5 allow a ready track to Resume while the other is missing. Failure 15 says **refuse Resume** when permission is lost, apparently without distinguishing one track from both. **Revise:** define whether permission failure is a special all-or-nothing exception or follows the same partial-Resume policy. Whichever is selected, make it explicit, with appropriate warnings, marked gaps and a test for microphone-only, meeting-track-only, and both-track permission loss. Do not surprise users with a silent policy difference.

## D. Strengthen the test plan

The revised plan has **25 cases**, up from 22 in the first-pass QA. The coverage is broader, but some rows still say only "Integration" or "Fault injection," and the common pass condition is not enough to prove every invariant.

### Test corrections

1. **Test speech, not just tones.** A pure tone may not appear in a speech transcript even if it leaks into ASR. Use timestamped pulses *and* a distinct spoken phrase, then inspect raw ASR/diarization/profile inputs and every persisted artifact. The first QA's tone test is useful for audio leakage, but insufficient as a transcription privacy test.
2. **Separate response speed from privacy correctness.** Failure 25's p99 <200 ms measures latency, not what happens to the slowest 1%. Include prolonged stalls, lost/duplicate messages and worst-case >200 ms delays; privacy must hold on every fault path, not only 99% of trials.
3. **Test supervisor behavior end-to-end.** Do not treat killing the worker as a pass unless the *real restart supervisor* is prevented from resuming capture after a Pause failure.
4. **Make state assertions temporal.** At every gate-open/closed transition, sample the UI and check that a visible Paused state never coexists with capture allowed to any sink. Include late acks, UI reload and device recovery.
5. **Exercise torn event logs.** Crash before and after every gate/log/chunk/fsync boundary; truncate, duplicate, reorder or corrupt records; recover twice, with identical, defensible results. Include a pause before the first chunk, no-audio intervals, and one-track partial resumes.
6. **Prove accurate timeline/export representation.** Deliberately stagger stream readiness and inserts; validate both per-track gaps, `elapsedMs`, clickable audio positions, DOCX/PDF markers, and the <50 ms drift target over 4 hours.
7. **Add explicit assertions to weak rows.** In particular, failure 16 (low disk), 18 (auto-pause), 23 (snapshot), 24 (import), and 19 (long pause) should state observable outputs, maximum latency where relevant, and prohibited states.

### Suggested minimal acceptance matrix

| Scenario | Required proof |
| --- | --- |
| User clicks Pause while IPC is delayed | No post-*approved-boundary* samples in any saved or AI input; truthful pending UI |
| Capture frame straddles cutoff | Pre-boundary portion kept, post-boundary portion excluded |
| Pause command reply is lost | Idempotent retry/reconciliation; gate closed or terminal safe stop |
| Forced fail-closed worker kill | Supervisor does not reopen capture; reason survives reload |
| Resume fails both tracks | Gate verified closed before UI says Paused; no delayed reactivation |
| Resume succeeds one track | Only available track records; absent track gap and warning accurate |
| Permission lost on one/both tracks | Behavior matches one explicitly selected policy |
| Crash between gate and event-log commit | Recoverable audio preserved; uncertain span not misrepresented |
| Sleep crosses 4-hour Pause deadline | Safe Stop upon wake; no auto-Resume |
| Pause with 30-second pre-Pause queue populated | Pre-boundary data handled within crash policy; no post-boundary data saved |
| Disk crosses 100 MB while paused | Same stop policy as approved crash-safe plan |
| 0/20/50/99 ms pause | Explicit ASR/diarization boundary survives, even if displayed span rounds to 0 ms |

**Platform evidence:** execute the safety/fault cases on Windows 11 and supported Apple Silicon macOS; use full-stack tests for process lifecycle/IPC and synthetic timestamped audio for precise cutoff checks. Gate 2 uses the superseding **four-hour** target (<50 ms drift; <=15 s lost per track, with <=5 s in any single gap, every gap marked); the separately approved eight-hour run remains due before Gate 8.

## E. Recommended plan corrections and approval gate

1. **Define a precise privacy promise**: button press vs verified gate cutoff; preserve or explicitly reapprove any changed wording. Specify the buffer/durability consequences.
2. **Define gate semantics**: all threads, queued frames, cutoff-straddling frames, stale packets, in-flight ASR, and safe Resume behavior.
3. **Define a terminal Pause-failure lifecycle** that overrides the crash plan's automatic worker restart. Persist it through recovery.
4. **Complete the durable event protocol**: schema, event ordering, fsync, damaged records, unknown intervals and repeatable recovery.
5. **Define UI/gate invariants** for Pausing, Paused, Resuming, Recording and Stop, without inventing unapproved external status values.
6. **Reconcile per-track gaps, timebases, permissions, low disk and sleep deadlines** across the pause and recovery plans.
7. **Amend the approved dependencies and contracts** with owner approval, including both adapters, supervisor behavior, runtime schemas and test fixtures.
8. **Replace qualitative tests with measurable assertions** and run Windows/macOS privacy, recovery, timing and long-duration checks.

**Approval exit criteria:** All four P0s explicitly resolved in the written plan; the eight H findings addressed or consciously accepted with documented owner decisions; changes propagated to dependency plans and schemas; every scenario has a falsifiable acceptance check; and the owner approves the revised plan *before code or branch changes begin*. No evidence of passing implementation tests is claimed here.

## F. Evidence and references

**Reviewed uploads**
- `pause-resume.md` (this review uses its uploaded 153-line version).
- `20261030_pause-resume_QA(1).md` (first-pass report; its historical 22-case draft is not the present revision).

**Repository cross-checks (read on 2026-10-30)**
- [Pause/resume plan, current GitHub path](https://github.com/raisinbran/scrb/blob/main/docs/plans/pause-resume.md)
- [First QA, referenced by the revised plan](https://github.com/raisinbran/scrb/blob/main/phase0/gpt-QA-reports/20261030_pause-resume_QA.md)
- [Approved crash-safe chunks and recovery plan](https://github.com/raisinbran/scrb/blob/main/docs/plans/crash-safe-chunks.md) - worker auto-restart, crash loss, low-disk stop, lock and recovery rules
- [Capture contract and clock plan](https://github.com/raisinbran/scrb/blob/main/docs/plans/capture-contract-and-clock.md) - shared clock, pause, drift, per-track gap proposals
- [Approved owner decisions, 2026-10-30](https://github.com/raisinbran/scrb/blob/main/docs/handoffs/2026-10-30-owner-decisions.md) - four-hour Gate 2 run and revised quality targets
- [Current TypeScript contract](https://github.com/raisinbran/scrb/blob/main/packages/contracts/src/types.ts) - `RecordingStatus`, `RecordingState.elapsedMs`, `RecordingWarningKind`, `TimelineGap`
- [V1 Requirements v1.2](https://github.com/raisinbran/scrb/blob/main/dev-plan/Meeting%20Scribe%20-%20V1%20Requirements%20v1.2.md) - recording integrity, pause/resume and export requirements

**Review limitation:** These are design risks, requirements conflicts and missing proof obligations, not verified runtime bugs. Some P0 paths are conditional on unspecified implementation behavior; the plan must rule them out before implementation approval. All recommended architectural mechanisms are proposals, not facts established by the source documents.
