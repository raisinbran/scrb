# Pause and resume

Status: **Approved by the owner on 2026-10-30, with all five recommendations, after two QA rounds (`phase0/gpt-QA-reports/`).**

Depends on: `capture-contract-and-clock.md`, `crash-safe-chunks.md` and the two capture adapter plans.

## The rules

1. **Pause is a privacy promise.** Once Pause takes effect, no new audio reaches a chunk, the holding buffer, the transcriber or voice profiles, on either track. It takes effect at the gate, within 200 ms of the press. If that cannot be confirmed, the recording ends.
2. **Resume favours recording.** A track that works starts, even if the other fails, with a warning and a marked gap.
3. **The screen tells the truth.** Paused means the gate is closed. Recording means it is open.
4. **Paused spans are never guessed.** With no pause record, a span with no audio is marked missing.

## The gate

One gate in the audio worker sits ahead of everything else: encoder, buffer, live feed and profiles. Only audio that passes it exists downstream, so nothing later needs its own check. Audio already past the gate was captured before the pause, and is kept.

The gate compares each packet's stamp with one cutoff time set once for both tracks. Whole packets are dropped, so the cutoff is accurate to a packet (about 10 to 20 ms). After Resume, packets stamped before the resume time are dropped, which removes stale audio delivered late.

Sound arriving during a pause is dropped there. Streams stay open during a pause (decision 1), so the device checks keep running.

## Commands

Every command has an ID, so a retry repeats nothing and a late reply changes nothing. Commands in the wrong state return `conflict`. Stop always wins, and leaves the gate closed.

**Pause:** the gate closes and the worker confirms. The app shows Paused. If there's no confirmation within 200 ms, it asks once more with the same ID, because a lost reply is not a failed pause. If it still can't confirm, it kills the worker.

**After that kill,** the reason `pauseFailed` is recorded first in the app core, and the crash-safe plan's automatic worker restart does not run. The meeting goes through normal recovery, with a persistent error. A new recording needs a new Start. Saved audio is kept, and about the last second may be lost, the same limit as a program crash.

**Resume:** the worker opens the gate only for tracks whose stream is ready, then confirms, and the app shows Recording. A track still reopening, such as Bluetooth, starts when it is ready, with a marked gap until then. If neither track is ready, the gate stays closed, the app stays Paused, and it offers Retry or Stop. A stream recovering later never reopens the gate.

## The record

**`audio/session.log`** is append-only and written by the worker: one JSON line per `pause`, `resume` or `pauseFailed`, with sequence number, command ID, cause (`user` or `meetingAppExited`) and time. It is forced to disk after the gate moves, so the disk never delays the cutoff. A cut-off last line is ignored, as in `chunks.log`. If a write fails, the pause still stands, and the app warns.

At Stop or recovery the app core compares the log with the audio on disk. Any audio found after a cutoff is kept, shown and logged as a fault, never hidden, and it fails the tests. Where the log can't confirm a pause, the span is marked missing. The worker holds `writer.lock` through a pause, so recovery leaves a live session alone. Recovery gives the same result however often it runs.

## Time

All positions are timeline positions: session clock, including paused time. Transcript, exports and pause markers use them. `elapsedMs` is the timeline minus paused spans. Playback skips paused spans.

**Paused** is shown only where neither track has audio. A small edge where one track has audio stays that track's audio. Differences between tracks are measured and reported.

Any pause, even 0 ms, is an explicit hard break for words, speaker turns and model input, independent of the 100 ms gap rule.

## While paused

| Check | During a pause |
| --- | --- |
| Stream arrival, device, permission, source exit, disk | On |
| Silent-mic warning, "recording stalled", transcriber inactivity restart | Off, with a 5 s grace period after Resume |

- **Low disk:** the crash-safe plan's rule applies, so the meeting stops and saves at 100 MB.
- **Permission lost:** warn at once. Resume follows rule 2: a track with no permission stays off, and if neither track has permission, Resume is refused.
- **Meeting app exits:** its timer runs, the user's pause reason stands, and nothing auto-resumes.
- **Sleep:** stays paused. On wake, the 4-hour deadline is checked before Resume is allowed.

Pre-pause audio may finish writing after Pause, so disk use settles shortly afterwards rather than stopping at once.

## What changes

1. **Audio worker, both adapters:** the gate, command IDs and `session.log`. The Windows branch pauses each track separately, so that part changes.
2. **App core:** state machine, `pauseFailed` handling, and paused spans saved as `paused` gaps.
3. **Live and final passes:** explicit hard breaks.
4. **Contract:** apply the approved B1 (per-track gaps) and B3 (pause reason). Add warning `pauseFailed` (decision 5).
5. **`crash-safe-chunks.md`:** add `session.log` to the folder and recovery, and add the `pauseFailed` exception to the restart rule.
6. **`capture-contract-and-clock.md` and both adapter plans:** replace per-track pause with the shared gate, and add command IDs.

## Tests

Run on both machines. **Privacy condition:** a unique tone and a spoken phrase played after the cutoff are absent from every track, `.part` file, recovered chunk, transcript and profile input, while those before it are all there. **State condition:** at no moment does the screen show Paused while the gate is open.

| # | Case | Pass |
| --- | --- | --- |
| 1 | Pause reply delayed, lost, duplicated, late; worker stalled; encoder and transcriber stalled | Privacy condition. One pause recorded, or the failed path below |
| 2 | Pause cannot be confirmed | Worker killed, the real supervisor does not restart it, the error survives a reload, audio loss about 1 s or less |
| 3 | Resume with one track ready, none ready, late replies, a stream recovering later | State condition. Gaps match the real delay within 100 ms |
| 4 | Stale packets after Resume | None in the new chunks |
| 5 | Crash at each step of pause and resume, recovering twice | Same spans both times. Paused time not counted. Nothing marked paused without a record |
| 6 | `chunks.log` and `session.log` deleted, cut, garbled | No false paused span |
| 7 | Recovery attempt during a live pause | Session unaffected |
| 8 | Stream dies, device changes, permission lost on each track and both, during a pause | Warning within 5 s. Resume matches the rules above |
| 9 | Disk reaches 100 MB during a pause | Stops and saves |
| 10 | Meeting app exits during a user pause, and auto-pause when it stays gone | Reason survives a reload. Never auto-resumes |
| 11 | Sleep during a pause, crossing the 4-hour deadline; clock jump | Stops on wake if due. Never auto-resumes |
| 12 | 100 fast pause and resume cycles, including 0, 20, 50 and 99 ms | Every one is a hard break, and all chunks are intact |
| 13 | 20 pauses with a shared sound, and the 4-hour run with at least 5 pauses | Drift under 50 ms. Mic loss at most 15 s, not counting paused time |
| 14 | Timeline, `elapsedMs`, playback and DOCX and PDF markers across pauses and one-track resumes | All agree |
| 15 | Pause under full AI load | Gate confirmed within 200 ms, 99th percentile. Slower cases still meet the privacy condition |
| 16 | UI reload while paused or after a failure; import during a pause | State and reason restored. Import rule unchanged |

## Decisions for the owner

**1. Stay connected during a pause?** Option A stays connected: a dead mic is found early and Resume is fast, but the mic light stays on and a Bluetooth headset stays in call mode. Option B disconnects: the mic light goes off, but Resume can take seconds and lose your first words. *Recommendation: A, with the label "Paused. No new audio is being recorded" and a Help note on the mic light. Choose B if the mic must not be touched at all.*

**2. Forgotten pause:** *Recommendation: stop and save after 4 hours paused, with a notice.*

**3. In exports:** *Recommendation: one line, such as "Paused, 12 min".*

**4. If a pause can't be confirmed:** *Recommendation: end the recording, as above.* A rare fault could end a meeting, and about the last second may be lost, but nothing is recorded that you believed was paused.

**5. Approve** `session.log`, the plan updates above, and warning `pauseFailed`. *Recommendation: approve.*

## Build order after approval

1. Plan updates and contract additions.
2. App-core state machine with a fake adapter.
3. The gate and `session.log` in the Mac adapter, then Windows.
4. Reconciliation and recovery, then the fault tests.
5. The 4-hour run.
