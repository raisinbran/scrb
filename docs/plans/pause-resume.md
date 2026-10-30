# Pause and resume

Status: **Revised after QA (`phase0/gpt-QA-reports/20261030_pause-resume_QA.md`). Awaiting owner approval. No code is written until then.**

Depends on: `capture-contract-and-clock.md`, `crash-safe-chunks.md` and the two capture adapter plans. Requirement: V1 Requirements, "Recording integrity and pause/resume".

## In short

**Pause is a privacy promise.** Once the app shows Paused, nothing heard after you pressed Pause reaches a chunk, the holding buffer, the transcriber or voice profiles, on either track. If the app cannot guarantee that, it ends the recording rather than keep saving.

Resume is different: you asked to record, so a track that works keeps recording even if the other fails, with a warning.

The audio connection stays open during a pause, so a dead mic is found before Resume. Sound received during a pause is thrown away the moment it arrives.

**Not in this plan:** the chunk format, the capture adapters' platform code, and how the Live screen looks.

## What pause means

| Moment | What happens |
| --- | --- |
| Press Pause | The worker takes one cutoff time and closes a shared gate for both tracks. The app shows Paused once the gate is confirmed closed, within 200 ms |
| Audio before the cutoff | Kept. It finishes encoding and reaches disk afterwards, and live text for it still appears. Disk writing does not hold up the gate |
| Audio after the cutoff | Dropped at the gate, before the encoder, the 30-second buffer, the live feed or voice profiles |
| While paused | The session clock runs and elapsed time stops. The indicator is amber, and the label says "Paused. Nothing is being saved" |
| Press Resume | The gate reopens at one resume time and both tracks open new chunks. The app shows Recording when audio is flowing |
| Press Stop while paused | The meeting ends normally. Stop always wins over a pause or resume in progress |

## The gate

Both tracks share one gate in the audio worker, checked on each track's capture thread against a single cutoff time. It is one value set once, not two commands to two tracks, so a slow track cannot hold the other open. The gate is not waiting on the disk, the encoder or any AI work.

Every command carries an ID, so a retry repeats nothing and a late reply is matched to its command. Pausing and resuming are internal steps the app core tracks. The UI still sees only the existing statuses.

**If the gate cannot be confirmed within 200 ms,** the app retries once with the same ID. A missed reply is not treated as a failed pause: the retry asks for the gate's state. If it still cannot be confirmed, the app kills the audio worker, which stops all capture at once, and the meeting ends through normal crash recovery, with a persistent error saying why. It never returns to Recording by itself. (Decision 4.)

## Where the paused span comes from

Chunks cannot do this alone: the approved chunk plan keeps close reasons only in `chunks.log`, and they read "unknown" if that log is lost. So a small durable record is added.

**`audio/session.log`** is one append-only file for the session, written by the worker and forced to disk. Each line carries command ID, event, cause, the effective time and each track's result:

- `pause` with its cutoff and cause (`user` or `meetingAppExited`), and `resume` with its time.
- Written after the gate moves, never before, so the disk cannot delay the privacy cutoff.

The two are then reconciled against the audio actually on disk:

| Evidence | Result |
| --- | --- |
| Record and chunk ends agree | Paused span |
| Record says paused, but audio exists after the cutoff | That audio is kept and shown, and logged as a fault. It is never hidden under "Paused". It fails the test suite |
| Audio ends with no pause record | Marked missing, never called paused |
| Record lost or damaged | Spans read "audio missing". A pause is never assumed |

Recovery can run any number of times and gives the same answer.

## What the transcript and UI show

A **Paused** span is shown only for the time when neither track holds audio. Any small edge where one track has audio stays as that track's audio, with its own track-specific mark. Playback, the timeline, the transcript, exports and `elapsedMs` all use the same spans. Boundaries are reported per track, and the difference is measured and reported, not assumed to be zero.

## What changes

1. **Audio worker:** the shared gate, command IDs and `session.log`, in both adapters. The Windows branch pauses each track separately, so that part changes.
2. **App core:** the state machine, with internal pausing and resuming steps, a sticky error, and Stop taking priority. Commands in the wrong state are refused with `conflict`.
3. **App core:** reconciliation of `session.log` with chunks, saved as `paused` gaps in `transcript.json`.
4. **Live and final passes:** a pause or resume is always a hard break for words, speaker turns and model input, signalled explicitly. It does not depend on the 100 ms gap rule or on the span's length, so even a 0 ms pause counts.
5. **Watchdogs:** see below.
6. **Contract:** B3, already approved, adds the pause reason. One new warning kind, `pauseFailed`, is proposed (decision 5).

### Watchdogs while paused

| Check | During a pause |
| --- | --- |
| Stream arrival, device, permission, source exit, disk | Stay on |
| Silent-mic warning and level checks | Off |
| "Recording stalled" from intentionally dropped audio | Off |
| Transcriber inactivity restart | Off |
| After Resume | Normal monitoring returns after a 5 s grace period |

## How it could lose data or break the promise

**Pass condition for every privacy test:** a unique tone played only after the Pause press is absent from every track, `.part` file, recovered chunk, live and final transcript and voice-profile input, while tone played before the press is all there. All fault tests run on both machines.

| # | Failure | Handling | Test and pass condition |
| --- | --- | --- | --- |
| 1 | Gate not confirmed within 200 ms | Retry, then kill the worker and show a persistent error | Block and delay replies, and stall the worker. Privacy condition holds; UI never shows Recording again by itself |
| 2 | Pause reply lost, or arrives late | The retry reads the gate. A late reply matches its ID and changes nothing | Inject late, duplicate and lost replies. One pause recorded, privacy condition holds |
| 3 | One track resumes and the other does not | Show Recording with a warning, mark that track missing, and let the watchdog reopen it | Fault injection. Working track has unbroken audio; failed track's gap is marked |
| 4 | Resume fails on both tracks | Stay Paused with a clear error, offer Retry or Stop | Fault injection. UI never shows Recording while nothing is saved |
| 5 | Stream rebuild pending at Resume, such as Bluetooth taking seconds | The ready track starts at once. The other shows a warning and a marked gap until it arrives | Bluetooth off then on during a pause. Gap equals the real delay within 100 ms |
| 6 | Stream or device dies during a pause | The watchdog reopens it, warns during the pause, and Resume uses the new stream | T24, unplug and Bluetooth off. Warning within 5 s; audio after Resume |
| 7 | Crash during a pause | The worker's death frees `writer.lock`. Recovery ends the meeting at the cutoff. Pause time does not count, and nothing is marked missing | Crash in a pause, recover twice. Same spans both times |
| 8 | Crash between gate and `session.log` write | No audio exists after the cutoff, and the span reads missing, never paused | Kill at that point. Privacy condition holds, span is marked missing |
| 9 | Crash during Resume | An empty chunk is dropped. If only one track resumed, the difference is a marked gap | Kill at each step, recover twice. Stable result |
| 10 | `chunks.log` or `session.log` lost or damaged | Chunks still place all audio. Pauses are not invented | Delete, cut and garble each log, separately and together. No false paused or false missing span where evidence exists |
| 11 | Recovery runs on a live paused session | The worker holds `writer.lock` through the pause, so recovery leaves it alone | Open a second instance and run recovery while paused. Session unaffected |
| 12 | Pause during Start or Stop; Stop during a pause or resume | Pause refused. Stop always wins | Unit, every state pair. Final state correct, no audio after Stop |
| 13 | Pause and Resume pressed fast, many times | Serialized by ID. Each pause gives one closed span | 100 cycles, including 0, 20, 50 and 99 ms pauses. Each is a hard transcript boundary |
| 14 | Computer sleeps during a pause | Stays paused after wake, and never auto-resumes | T11 in a pause. Span runs through the sleep, using sleep-aware time |
| 15 | Permission lost during a pause | Warn at once, refuse Resume with a plain reason until it returns | T20 in a pause. Resume refused, then works |
| 16 | Disk fills during a pause | Warning stays on. Below 100 MB, Resume is refused and Stop offered | Fault injection |
| 17 | Meeting app exits during a user pause | Timer runs, the user's pause reason stands, and returning never auto-resumes | Timer expiring mid-pause, then Resume, with a reload in between. Reason stays `user` |
| 18 | Auto-pause after the app stays gone | Warn, then pause with reason `meetingAppExited`, offer Resume or Stop | Integration. Reason survives a reload |
| 19 | Very long pause | Disk use stays flat. The auto-stop in decision 2 uses sleep-aware monotonic time, is recorded in `session.log`, releases devices, and notifies you | Shortened limit, with sleep, wake and clock jumps |
| 20 | Tracks drift apart across pauses | Each resume uses the session clock | T13 across 20 pauses, with a shared sound. Report per-track differences; drift stays under 50 ms over the 4-hour run |
| 21 | Staggered track edges | Paused shows only when neither track holds audio | Stagger both edges deliberately, and inspect samples. No recorded audio labelled paused |
| 22 | Transcriber restarted by a false stall after Resume | Inactivity timer ignores paused time | Long pause, no restart |
| 23 | UI reloads during a pause or during a failure | `getRecordingSnapshot` restores Paused, the reason and the error | Integration |
| 24 | Import during a pause | A paused meeting still counts as a recording | Integration |
| 25 | Pause too slow under AI load | Measured separately: gate confirmation against 200 ms, then chunk finish and device reopening | T16. Gate confirmed within 200 ms at the 99th percentile under full AI load |

## Gate 2 items this affects

| Gate 2 item | Covered by |
| --- | --- |
| 4-hour recording with pauses | At least 5 pauses. Per-track boundary differences reported |
| Device change | Failures 5 and 6 |
| Forced crash | Failures 7, 8 and 9 |
| Drift under 50 ms over 4 hours | Failure 20 |
| Mic loss at most 15 s per track over 4 hours | Paused time is excluded from this count |

## Changes to already approved plans

Applied only after approval here:

- **`crash-safe-chunks.md`:** add `audio/session.log` to the meeting folder, to recovery step 4, and to failure 17.
- **`capture-contract-and-clock.md`:** change `pause` and `resume` to a single shared gate, and add command IDs. Q8 is answered by decision 1.
- **Both adapter plans:** add the gate. The `windows-capture` branch needs changing.

## Decisions for the owner

**1. Should the connection stay open during a pause?**

- **Option A, stay open:** a dead mic is found during the pause, and Resume is fast, including on Bluetooth, where opening takes about 2.3 s. But the operating system's mic light stays on while paused, and a Bluetooth headset stays in its lower-quality call mode. The app saves nothing, but the light could look as if it does.
- **Option B, close both streams:** the mic light goes off during a pause, which is the plainest privacy signal. But a dead mic is only found at Resume, and Resume can take seconds, losing whatever is said meanwhile.

*Recommendation: A, with the Paused label saying "Nothing is being saved", and a Help note about the mic light.* QA agrees, as long as the no-save tests pass. If your promise is that the mic isn't accessed at all, choose B.

**2. Should a forgotten pause end on its own?** *Recommendation: stop and save after 4 hours paused, with a notice.* QA agrees.

**3. What does a paused span look like in exports?** *Recommendation: one line in the transcript, such as "Paused, 12 min".* QA agrees.

**4. If a pause cannot be confirmed, end the recording?** This reverses the first draft. Ending it means a rare fault could stop a meeting you meant to continue, and you would need to start a new recording. Everything saved before the cutoff is kept. The alternative is to keep saving and warn, which could record something you believed was paused. *Recommendation: end it. QA rates the alternative a blocker.*

**5. Approve the additions:** `audio/session.log`, the changes to the approved plans listed above, and a contract warning kind `pauseFailed`, so the UI can say why the recording ended. *Recommendation: approve.*

## Build order after approval

1. The two plan updates, and the contract addition.
2. App-core state machine with a fake adapter, and failures 12, 13, 23 and 24.
3. The shared gate and `session.log` in the Mac adapter, then Windows.
4. Reconciliation and `paused` gaps, then failures 7 to 11.
5. Privacy and fault injection on both machines.
6. The 4-hour run.
