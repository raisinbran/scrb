# Meeting Scribe - Pause/Resume Plan QA

**Reviewed:** 2026-10-30  
**Plan:** [`docs/plans/pause-resume.md`](https://github.com/raisinbran/scrb/blob/main/docs/plans/pause-resume.md) (main, blob `7df5c27b472e86c706de0e5d36771f6c35680039`)  
**Disposition:** **CHANGES REQUIRED - NOT APPROVED FOR IMPLEMENTATION**  
**Scope:** Read-only design review of the 22 failure cases, owner decisions, QA questions, and dependencies. No code was changed; tests were not executed.

## Executive assessment

The plan's fault inventory is useful, but it does not yet guarantee that an explicit user Pause stops recording. In particular, failure #1 deliberately keeps saving some audio after a failed pause. This violates the approved V1 pause invariant and creates an avoidable privacy hazard. Other blockers concern recovery of pause metadata and a display rule that can hide actually recorded audio. Retain the build gate until these are corrected and tested.

## Blocking findings

### P0-1. Failed pause is fail-open and can save unwanted audio

**Where:** Pause/resume plan, failure #1, [line 43](https://github.com/raisinbran/scrb/blob/main/docs/plans/pause-resume.md#L43); compare approved [V1 recording integrity requirement](https://github.com/raisinbran/scrb/blob/main/dev-plan/Meeting%20Scribe%20-%20V1%20Requirements%20v1.2.md).

**Problem:** A timeout or failure on one track means the app stays in Recording and saves the other track. A warning is not an adequate substitute for a Pause command; the user may not notice it. The plan also does not specify how the already-paused track gets returned to a consistent state. A lost acknowledgement is not proof that the track itself failed to pause.

**Required correction:** Make an explicit Pause privacy-first. Gate audio **for both tracks** before it can enter durable storage, the 30-second holding buffer, the live transcription feed, or speaker/profile processing. Do not show Paused until the no-save invariant is confirmed. On partial acknowledgement, retry/reconcile using idempotent command IDs; if safe suppression cannot be guaranteed, stop the capture helper and show a persistent error, never silently return to Recording. Resume/Start must be explicit. Distinguish a missed reply from a failed action.

**Required tests:** Pause one track while blocking/delaying the other's reply; inject a late acknowledgement, retry, worker stall, UI reload and crash. Use a unique audible test signal after the Pause request; prove that no post-cutoff content appears in either track, `.part`/recovered chunks, the live/final transcript, or profile inputs. Assert unmistakable UI state after failure.

### P0-2. Pause state cannot reliably be reconstructed from chunks alone

**Where:** Pause/resume plan [lines 24-28](https://github.com/raisinbran/scrb/blob/main/docs/plans/pause-resume.md#L24-L28), failure #6; [crash-safe chunks plan, chunk metadata and log recovery](https://github.com/raisinbran/scrb/blob/main/docs/plans/crash-safe-chunks.md#L69-L115).

**Problem:** The pause plan derives `pause` close boundaries from the chunks. But the approved chunk plan says each audio chunk embeds its **open** reason, while **close** reason is stored only in `chunks.log`; after loss/corruption of that log, close reasons become `unknown`. A final `pause` without a `resume`, or a pause when a track has no audio chunk, may be impossible to distinguish from a missing stream or Stop. Thus the proposed source of truth is incomplete.

**Required correction:** Define a durable, crash-recoverable per-session pause/resume event or equivalent reliably recoverable metadata, with command ID, cause, effective times, per-track results and incomplete transitions. Reconcile this record against actual chunk audio endpoints; never pretend a gap is known to be paused if evidence is missing. If the design instead embeds reliable close reasons in chunks, specify the safe on-disk encoding and `.part` recovery semantics explicitly. Update both approved dependency plans if their storage contract changes, subject to owner approval.

**Required tests:** Delete/corrupt/truncate `chunks.log`; crash after one track paused, during both-track pause, during resume and during a no-audio pause; recover twice and verify stable, truthful spans and no false missing-audio marking.

### P0-3. Displayed paused span can conceal recorded audio

**Where:** Pause/resume plan [line 28](https://github.com/raisinbran/scrb/blob/main/docs/plans/pause-resume.md#L28).

**Problem:** The plan combines the earlier track stop and later resume into one UI/transcript paused span. During the staggered transition, one track can still contain audio. Labeling all that time 'Paused' falsely implies nothing was saved.

**Required correction:** Show a global Paused span only for the interval where **neither** track is saving, and separately preserve each track's transition/partial-coverage interval with accurate track-specific metadata. If the new all-track gate makes boundaries atomic, verify that experimentally rather than hiding small differences. Keep playback, timeline, transcript, exports and `elapsedMs` consistent.

**Required tests:** Deliberately stagger both tracks at pause and resume; inspect samples at both edges and assert the UI/export does not label recorded audio as paused. Measure synchronization against the approved four-hour drift target.

## High-priority clarifications and additional tests

| ID | Concern | Required revision or acceptance criterion |
| --- | --- | --- |
| H1 | In-flight data at Pause | Define the precise effective cutoff. Drain/persist audio captured **before** it, and reject/discard audio captured **after** it throughout encoder, 30-second buffer, live-feed queue, ASR and profiles. Disk flushing of *pre-pause* audio may occur later without violating the rule. Never wait for the AI pass before enforcing the cutoff. |
| H2 | Pauses shorter than the existing 100 ms gap heuristic | An explicit Pause/Resume is always a hard transcription/diarization boundary, even for 0-99 ms or a duration rounded to 0 ms. Test 0, 20, 50 and 99 ms. An explicit boundary must not disappear merely because no time gap is emitted. |
| H3 | Watchdog behavior while paused | Keep stream arrival/transport, OS device, permissions and source-exit watchdogs active. Suppress audio-level silence alerts, recording-stall interpretations caused by intentionally dropped frames, and the ASR inactivity restart timer. Restore ordinary monitoring on Resume with a brief defined grace period. |
| H4 | Partial-state/race handling | Specify `pausing`/`resuming` *internal* operations, idempotent request IDs, serialized Stop priority, cancellation/late acknowledgements and a sticky error. Current shared contract only exposes `idle/starting/recording/paused/stopping`; if additional externally visible states or warning kinds are needed, obtain explicit contract approval. |
| H5 | Pause while the meeting app exits | User Pause must not be overwritten by `meetingAppExited`, must never auto-resume when the app returns, and must carry the correct reason through UI reload. Test two-minute timer expiring during a user pause, then Resume. |
| H6 | Writer lock and recovery | Clarify that the active recording worker retains `writer.lock` during pauses; otherwise startup recovery might treat a live paused session as abandoned. Test another app instance/recovery attempt while paused. |
| H7 | 200 ms and device changes | Measure command acknowledgement separately from durable chunk finalization and device reopening. Define what happens when a stream rebuild is pending at Resume and Bluetooth reopening takes seconds. Show an honest transitional/degraded state. |
| H8 | Gate 2 evidence | Use the superseding owner decision: routine Gate 2 long runs are **4 hours**, with **under 50 ms** drift and **at most 15 s loss per track**; an eight-hour run remains before Gate 8. Report per-track pause-boundary differences rather than requiring impossible exact equality. |

## Answers to the three open QA questions

1. **Is continuing Recording after failed Pause worse?** **Yes.** This violates an explicit user command and the V1 pause invariant, even if a warning appears. Use a shared fail-closed audio gate, or stop safely when it cannot be enforced. Continuing a working track when *Resume* fails is different: in that case the user expressly requested recording, and a clear degraded warning is appropriate.
2. **Does the live pass need a rule for pauses under 100 ms?** **Yes.** A user-issued pause must create an unconditional hard boundary for words, speaker turns and model input, independent of time-gap thresholds or millisecond rounding.
3. **Should watchdog silence limits stop during Pause?** **Content-silence thresholds should be suspended**, but **device/stream liveness, permission, source and disk checks should remain active**. The ASR restart watchdog must also exclude intentional paused time.

## Recommendations on the three owner decisions

| Owner decision | QA recommendation | Condition |
| --- | --- | --- |
| 1. Keep capture connections open | **A, conditionally** | Safer and faster Resume if the no-save/no-transcribe gate is independently verified and shown clearly. Warn in the Help/UI that the OS mic indicator may remain on because the device stays open. If the intended privacy guarantee is 'mic not accessed at all', choose B instead. Fail-open behavior is unacceptable under either option. |
| 2. Forgotten pause auto-stop | **Approve four hours** | Use monotonic, sleep-aware paused time; persist the event, stop and release devices cleanly, and notify before/at auto-stop. Test sleep, wake and clock jumps. |
| 3. Export marker | **Approve a distinct 'Paused, 12 min' entry** | It is metadata, not recognized speech. Preserve correct timeline positions, per-track edge behavior, DOCX/PDF parity and skipped playback regions. |

## Approval exit criteria

- The three P0 findings have explicit design resolutions reflected in the plan and any affected dependency documents.
- Every failure row has a **measurable assertion**, with special coverage for partial failure, dropped/late acknowledgements, crash recovery and privacy leakage on Windows **and** macOS.
- Synthetic audible content produced only after Pause is absent from all persisted audio, transcript/model outputs and recovered files; pre-pause recorded content is preserved as promised.
- No visible 'Paused' state can conceal audio actually saved on a track.
- The owner explicitly approves any altered contract/schema and the three pending user-facing policy decisions. **No build or branch changes should start before that approval.**

## Read-only sources

- [Pause/Resume plan](https://github.com/raisinbran/scrb/blob/main/docs/plans/pause-resume.md)
- [Approved V1 requirements, recording integrity](https://github.com/raisinbran/scrb/blob/main/dev-plan/Meeting%20Scribe%20-%20V1%20Requirements%20v1.2.md)
- [Crash-safe chunks and recovery](https://github.com/raisinbran/scrb/blob/main/docs/plans/crash-safe-chunks.md)
- [Capture contract and clock](https://github.com/raisinbran/scrb/blob/main/docs/plans/capture-contract-and-clock.md)
- [Owner decisions, 2026-10-30](https://github.com/raisinbran/scrb/blob/main/docs/handoffs/2026-10-30-owner-decisions.md)
- [Current typed contract](https://github.com/raisinbran/scrb/blob/main/packages/contracts/src/types.ts)
