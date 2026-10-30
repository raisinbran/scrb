# Pause and resume

Status: **Draft for QA review, then owner approval. No code is written until both are done.**

Depends on: `capture-contract-and-clock.md`, `crash-safe-chunks.md` and the two capture adapter plans. Requirement: V1 Requirements, "Recording integrity and pause/resume".

## In short

Pause stops saving audio on both tracks at once. Resume carries on in the same meeting, with the tracks still in step and the paused span marked. The audio connection stays open during a pause, so a dead mic is found before Resume rather than after, but sound received during a pause is thrown away at once and never saved or transcribed.

**Not in this plan:** the chunk format and recovery steps, the capture adapters' platform code, and how the Live screen looks. The screen already exists on the mock.

## What pause means

| Moment | What happens |
| --- | --- |
| Press Pause | The app shows Paused as soon as the worker confirms, within 200 ms. Both tracks close their open chunk with reason `pause` |
| While paused | No audio is written, encoded, sent to the transcriber or kept in the 30-second buffer. The watchdog keeps watching both streams. The indicator is amber. The elapsed time stops. The session clock keeps running |
| Press Resume | Both tracks open a new chunk with reason `resume`, stamped by the session clock. The app shows Recording |
| Press Stop while paused | The meeting ends normally. No resume is needed first |

The timeline keeps running during a pause, so a paused span is real time on the timeline, and `elapsedMs` leaves it out. Playback skips paused spans.

## Where the paused span comes from

The chunk files are the single source of truth. A track's paused span runs from the end of its `pause` chunk to the start of its `resume` chunk, using the clock stamps already stored in each chunk and in `chunks.log`. No separate pause record is written, so the record and the audio cannot disagree.

The two tracks stop a few milliseconds apart. The 30-second Windows baseline measured 5.04 and 5.05 s paused on the two tracks. Each track keeps its own span. The transcript and the UI show one paused span, from the earlier stop to the later start, so a track is never shown as recording while the other is paused.

## What changes

1. **App core:** a small state machine for `idle`, `starting`, `recording`, `paused` and `stopping`. Commands that arrive in the wrong state are refused with `conflict`. A second press during a pause or resume does nothing, so a double press cannot toggle twice.
2. **App core:** after Stop or recovery, it works out paused spans from the chunks and saves them as `paused` gaps in `transcript.json`, a kind the format already has.
3. **Capture adapters:** already specified. `pause` and `resume` report the time they took effect on each track. Windows has a first version on the `windows-capture` branch, which is unapproved starting code.
4. **Live pass:** before a pause, text already spoken is finished and shown. The existing gap rule then stops speech joining across the pause, so a word can never be stitched from both sides.
5. **Final pass:** treats a paused span as a hard break, with no words or speaker turns across it.
6. **Contract:** B3, already approved, adds a pause reason (`user` or `meetingAppExited`), so the UI can say why it paused.

## How it could lose data, and the test for each failure

| # | Failure | Handling | Test |
| --- | --- | --- | --- |
| 1 | One track confirms the pause and the other does not within 200 ms | Do not show Paused. Try once more. If it still fails, stay in Recording, warn, and keep saving the track that is still working, because losing nothing beats a clean pause | Fault injection: block one track's reply |
| 2 | One track resumes and the other does not | Show Recording with a warning, mark the failed track missing, and let the watchdog reopen it. Never go back to Paused, or the working track would lose audio | Fault injection |
| 3 | Resume fails on both tracks | Stay Paused with a clear error and offer Retry or Stop. Never show Recording while nothing is saved | Fault injection: stream open fails |
| 4 | Mic or meeting stream dies during a pause | The watchdog notices and reopens it. Resume uses the new stream. The warning appears during the pause, before audio could be lost | T24, plus unplug and Bluetooth off during a pause |
| 5 | Device change during a pause | The new device is used from Resume. No chunk is open, so nothing has to close | T24 |
| 6 | Crash during a pause | Recovery sees the last chunks ended with `pause` and no `resume`. The meeting ends at the pause. Nothing is falsely marked missing, and the time until the crash is not counted | Crash-safe failure 8, on both machines |
| 7 | Crash after one track closed for pause | The other track's `.part` file is repaired as usual. Each track ends at its own last audio | Fault injection: kill between the two closes |
| 8 | Crash during Resume | A chunk with no audio is dropped. If only one track resumed, the difference becomes a marked gap | Fault injection |
| 9 | Pause pressed during Start or Stop | Refused with `conflict`. The UI button is disabled in those states as well | Unit |
| 10 | Pause and Resume pressed very fast, many times | Commands run in order. Each pause gives a closed chunk, and a span of 0 ms leaves no gap | Stress: 100 cycles, then check every chunk and span |
| 11 | Computer sleeps during a pause | It stays paused after wake. Streams reopen in the background. The span runs through the sleep and is shown as paused | T11 repeated during a pause, on both machines |
| 12 | Permission lost during a pause | Warn at once, and refuse Resume with a plain reason until it returns. No audio is at risk | T20 repeated during a pause |
| 13 | Disk fills during a pause | The low-disk warning still runs. Below 100 MB, Resume is refused and Stop is offered | Fault injection |
| 14 | Meeting app exits during a user pause | Its 2-minute timer starts. If it does not return, the source shows as gone, and Resume keeps the mic and marks the meeting track missing | Integration |
| 15 | Auto-pause after the meeting app stays gone | The app warns, then pauses with reason `meetingAppExited`, and offers Resume or Stop | Integration |
| 16 | Very long pause, such as overnight | Nothing is written, so disk use stays flat. Times use the session clock, so the length does not matter. After the auto-stop limit in decision 2 the meeting stops and saves cleanly | Test with a shortened limit, plus a clock jump test |
| 17 | Tracks drift apart across pauses | Each resume is stamped by the session clock, so errors do not build up | T13, checked across 20 pauses using a shared sound |
| 18 | Live transcript stuck after Resume | The worker gets no audio during a pause, and that alone must not trigger the crash restart. The transcriber watchdog ignores paused time | Integration |
| 19 | Sound during a pause is saved by mistake | Tone played only during the pause, then search every chunk and the transcript for it | Automated, both machines |
| 20 | UI reloads during a pause | `getRecordingSnapshot` restores Paused and the reason | Integration |
| 21 | Import blocked or started during a pause | A paused meeting still counts as a recording, so the rule on imports does not change | Integration |
| 22 | Pause takes too long under AI load | The worker has no AI work on its command path. Measured against the 200 ms target | T16 |

## Gate 2 items this affects

| Gate 2 item | Covered by |
| --- | --- |
| Long recording with pauses | The long run has at least 5 pauses, and paused time must match on both tracks |
| Device change | Failures 4 and 5 |
| Forced crash | Failures 6, 7 and 8 |
| Stays within the drift target | Failure 17 |
| Pause and Resume respond within 200 ms | Failure 22 |

## Decisions for the owner

**1. Should the connection stay open during a pause?**

- **Option A, stay open:** a dead mic is found during the pause, and Resume is fast, including on Bluetooth, where opening takes about 2.3 s. The catch is that the operating system's mic light stays on while paused, and a Bluetooth headset stays in its lower-quality call mode. The app saves nothing, but the light could look as if it does.
- **Option B, close both streams:** the mic light goes off during a pause, which is the plainest privacy signal. The catch is that a dead mic is only found at Resume, and Resume can take several seconds, losing whatever is said meanwhile.

*Recommendation: A, with the Paused label saying "Nothing is being saved".* Losing audio at Resume is the worse failure, and this is what the capture contract proposed. If you want the mic light off during a pause for privacy, choose B.

**2. Should a forgotten pause end on its own?** A meeting left paused stays open and blocks imports. *Recommendation: stop and save automatically after 4 hours paused.* This is a new behaviour, and the limit is yours to set.

**3. What does a paused span look like in exports?** *Recommendation: one line in the transcript, such as "Paused, 12 min", matching the Recordings screen.*

## Open questions for QA

- Is there a case where staying in Recording after a failed pause (failure 1) is worse than pausing one track? It could save audio the user believes is paused. The plan chooses to keep saving and warn; a privacy reading could prefer the opposite.
- Does the live pass need a change for a pause shorter than its 100 ms gap rule? Such a pause might join speech across it.
- Should the watchdog's silence limits stop during a pause? The stream is open, and a muted mic sends silence.

## Build order after approval

1. App-core state machine with a fake adapter, and failures 9, 10, 20 and 21.
2. Paused spans worked out from chunks, and the `paused` gaps saved.
3. Connect to the Mac adapter, then the Windows adapter.
4. Fault injection on both machines.
5. The long run.
