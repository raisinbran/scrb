# Gate 3: proposal to avoid repeating four-hour physical capture

**Date:** 2026-11-02
**Status:** Proposed owner decision only. Not approved, not a Gate 3 pass, and not a change to the Development Plan until the owner decides.

## Decision requested

For Gate 3 only, allow **reuse of November 2's completed four-hour physical capture tests on Windows and macOS** for the long-capture requirement, even though the shared live-transcription worker subsequently changed. Verify the revised worker through deterministic fault-injection, actual-model short physical tests on **both** platforms, and independent review. **Do not run another four-hour physical capture for this fix by default.**

This is a narrowly scoped *alternative evidence method*, not a claim that four-hour live transcription passed after the fix and not a waiver of the Gate 8 eight-hour tests. The owner must explicitly accept the remaining risk before Gate 3 can be approved.

## Facts and boundaries

- Four-hour physical recordings predate the resilience fix, at integrated head `72c4107`. The Windows archive contains both original tracks; 5,779 Opus chunks were hash-checked, with small *marked* gaps that still need an acceptance judgment. The original Mac four-hour audio was not retained in the uploaded ZIP, so its integrity is supported by the saved test-runner measurements rather than independent audio decode.
- The old code exhibited long periods of no live text. **Four-hour live-transcription endurance failed on both platforms.**
- PR [#44](https://github.com/raisinbran/scrb/pull/44) changes the *shared* live PCM engine and adds numeric loss diagnostics. The five-minute Mac CPU-load test passed, with real dropped frames, zero worker-queue overflow and no sustained stall. A two-minute Mac harness check preserved its pre-Stop live transcript.
- The Mac test does **not** identify why upstream frames were lost. Windows has not yet physically tested the fix, and the Mac five-minute archive has not been independently reviewed here.
- PR #44 at `fb2d96c` has a new physical-test harness; on its initial CI run Windows passed and macOS job was cancelled before executing steps. A targeted rerun was requested on November 2.
- The Development Plan v2.0 still states a four-hour recording per operating system before Gates 2 and 3. Replacing a *post-fix integrated four-hour rerun* thus needs this explicit owner exception.

## Alternative evidence package for each OS

1. **Retain and review the original four-hour recording evidence.** Preserve the private ZIPs, SHA-256s, manifests, process/log timelines and marked-gap audit; record the limit of what can be independently verified on Mac. Do not manufacture missing Mac audio or silently relabel Windows marked gaps as perfect recording.
2. **Verify shared worker continuity without new long capture.** Keep a deterministic replay/fault-injection regression representing at least four hours of PCM timestamps across both tracks, with known speech spans, varied short frame losses, back-to-back losses, boundaries, generation changes, >1-second resets, worker stop/recovery and buffer bounds. It may use invented audio, stubbed VAD/model and virtual or accelerated time; clearly label this as *functional stress simulation*, not real-model endurance. Assert sustained segment output when expected, monotonic timestamps, bounded memory and loss accounting; no hidden zero-output intervals.
3. **Real physical model checks.** Use the published five-minute Mac heavy-CPU test and run one approximately five-minute Windows real-app speech/live+final check with representative load. Both must show some live output throughout known speech, no >=120-second known-speech stall, sensible skip/bridge/reset numbers, zero unmarked recorded-audio loss, preserved original audio/live transcript/final transcript, and visible recovery when faults are injected or observed. Check worker-queue overflow and source-side loss separately; a queue count of zero does not identify which upstream stage lost the frames.
4. **Independent validation.** Have an agent other than Claude review PR #44 final head and the physical results. Require final-head CI green on Windows and macOS, or explicitly document a true infrastructure-only cancelled job and its successful rerun.
5. **Keep all other Gate 3 checks.** Meet actual-app live latency median <=3 seconds and >=95% of segments <=6 seconds; peak recording+transcription memory around <=6 GB; paired live/final error counts showing >=15% fewer final word errors on matching public clips; GPU-capable final pass no slower than clip duration; worker-kill isolation/<=3 restarts; complete WAV, MP3, AAC, ALAC, FLAC, Opus, Ogg import success and failed/cancelled import cleanup; playback, fast transcript, and <=200 ms Record/Pause/Stop acknowledgments. The published Phase 3 evaluator can score these, but fake-worker/synthetic data cannot replace actual production timings or WER.
6. **Evidence retention.** All raw audio, live snapshots made *by the test process*, final text, logs and configuration stay in protected persistent storage. Only allowlisted numeric reports and archive hashes go to a `rosmont/*` GitHub branch. Inspect privacy-safe reports before publication and confirm that publication actually succeeds.

## Acceptance and exception record

The owner may approve the **verification method** above without approving Gate 3. Gate 3 remains **FAIL / OPEN** until every non-excepted target is evidenced and the owner signs off.

The eventual gate record must say:

> The November 2 four-hour physical tests establish pre-fix recording/capture endurance to the extent the preserved evidence supports. Post-fix live continuity was established through synthetic extended-timeline fault injection, short real-device actual-model runs on Windows/macOS, independent review and accepted residual risk. A post-fix four-hour physical live-transcription run was **not performed**, so long-duration real-model reliability remains unproven. Gate 8 retains its separate eight-hour requirement. Any later need for a full new physical run requires an explicit, specific owner decision.

**No automatic four-hour rerun is authorized by this proposal.** If any short check fails, investigate the specific failure using existing evidence or a bounded targeted reproduction. Do not expand to an overnight run.

## Immediate work

- **Windows Codex:** review PR #44 at `fb2d96c`, assess the new harness and loss-bridging edge cases, run existing synthetic tests and one five-minute physical Windows load test with retained evidence; report independent approve/request changes.
- **ChatGPT Chat:** prepare the extended-timeline synthetic simulation and scoring/evidence checklist as cloud-safe changes, independently of Windows hardware, on a separate `rosmont/*` branch if needed.
- **Owner:** decide whether this narrowly scoped alternative is acceptable **in principle**, subject to complete measured Gate 3 evidence. Do not merge this proposal as an approved exception until explicit authorization.
