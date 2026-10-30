# Plan: capture contract and session clock

Status: **Approved by the owner on 2026-10-30, with every recommendation accepted except as noted in `docs/handoffs/2026-10-30-owner-decisions.md`. Code starts in its phase, after the gate before it.**

**Long runs changed (owner, 2026-10-30):** Gate 2 now uses a 4-hour run, so read 4 hours wherever this plan says 8 for T15 or Gate 2, and scale per-run figures to match. Details are in `docs/handoffs/2026-10-30-owner-decisions.md`.

Date: 2026-10-30. Base commit: `4abe340`. First of the initial plans in the Development Process, followed by `windows-capture-adapter.md` and `macos-capture-adapter.md`.

Sources: `phase0/design/capture-contract-draft.md`, `phase0/evidence/gate-0.md`, `phase0/HANDOFF-WINDOWS.md`, Development Plan v2.0 (Gate 2), V1 Requirements v1.2, the contract in `packages/contracts/`, and the unmerged `windows-capture` branch (tip `cac61df`).

## In short

Meeting Scribe records two tracks at once: your microphone and the meeting app. Phase 0 showed that those tracks can stop, slow down or slip apart with no error from Windows or macOS. This plan sets the rules both adapters must follow, so that any failure is noticed, recorded as a marked gap, and never hidden as silence.

It covers one shared set of commands and events, one clock, the rules for when audio files (chunks) start and end, and how each failure is detected. It also proposes the idle mic test the contract lacks. It decides **nothing about the file format**.

**Not in this plan:** the chunk file format, manifest and crash recovery (crash-safe chunks plan), pause/resume behaviour beyond the commands (pause/resume plan), and platform code (the two adapter plans).

**Gate 2 cannot pass on these three plans alone.** Its forced-crash and pause requirements also need the crash-safe chunks and pause/resume plans.

## What changes

1. **One adapter interface.** The commands and events in section 1 of the draft become the rule for both platforms, with the corrections below. Each adapter runs as its own small helper program, separate from the app and the AI workers, so a stalled AI job cannot stop it.
2. **One clock for both tracks.** Each chunk is placed by the hardware timestamp of its first sound, never by counting samples. Counting samples drifted 122 ms in 8 hours; timestamps stayed within 2 ms for 99.95% of logged packets.
3. **Chunks stop at every problem.** A chunk never spans a gap, sleep, device change, rate change, pause or permission change. Any error is therefore limited to one chunk and fixes itself at the next.
4. **Gaps are never filled with hidden silence.** Anything over 2 ms becomes a marked gap with a cause.
5. **Detection rules D1 to D10** from the draft apply, with the corrections below.
6. **A mic test and meters before Start**, if you approve the contract addition below.

## Corrections to the draft

The draft is out of date or wrong in these places. Approving this plan approves these corrections.

| Draft says | Evidence says | Correction |
| --- | --- | --- |
| F11, D2, T3: after standby the meeting track lost 1.69 s while its timestamps stayed clean | The `windows-capture` work found the timestamps were honest. After wake, Windows delivers the slept span as a burst of stale silence holding 1.69 s fewer frames than its stamps cover | Rule D1 finds it. D2 stays only as a backstop. Drop the burst and mark the span "computer asleep". Replay of the logged run found 1690 of 1690 ms |
| F12: the recording was about 41 s shorter than wall time | 217 s of audio in a 282 s span is 65 s short: 24 s seen as a jump, 41 s invisible. Sleep was only 55 s, so about 10 s is unexplained | Use 65 s. The macOS sleep test must account for the extra 10 s |
| Mic privacy mid-recording is unmeasured (Q3, "Untested in Phase 0") | Measured on Windows: the mic stops silently and does not return when access is restored | Treat as a known failure on Windows. Still unmeasured on macOS |
| F4: the app track "lost nothing" through 3 to 14 s stalls | True by frame count (10 ms off over 8 h), but that run's target was **silent**. A branch fault test stalled the reader 4 s and lost 3.98 s of audible meeting audio | Unproven for real audio. New test T23 |
| `open` must respond within 2 s | Opening a Bluetooth hands-free mic took 2.3 s | Raise to 5 s (provisional). The UI already has a `starting` state |
| D4: 30 s with no packets means a dead stream | Up to 30 s lost before recovery, and the user is told nothing until then | Replace with decision C5 |
| D3: stalls need 500 ms of silence | Mac stalls peak near 0.4 s, under that limit | No change needed, because D1 still catches them. T5 must prove it |
| T1: every packet within 100 ms | Gate 0 had one 125 ms excursion, above the target, before chunks split at each glitch | Keep the test, but it is unproven. A failure here is a real result, not a test problem |

## How it could lose data, and the test that proves each is handled

Test kinds: **U** replay of recorded or invented packet logs, **F** fault forced on the real adapter, **H** hands-on run on real hardware. T1 to T16 come from the draft. T17 to T24 are new. The adapter plans say where each one runs.

| Failure | Without this plan | What the rule does | Test | Gate 2 clause |
| --- | --- | --- | --- | --- |
| Slow drift between tracks | Up to 122 ms off in 8 h | Timestamp each chunk | T1 | Drift target |
| Gap invisible to the device counter | Silent loss | D1 compares timestamps, new chunk, marked gap | T2 | No lost audio |
| Mic ignores a default-device change (F6) | Records the wrong mic for the rest of the meeting | D6 reopens when "system default" is selected, offers when a mic was picked | T7 | Device change |
| Default device flaps every 4 s (F8) | Repeated reopens, each losing audio | D6 waits for 5 s of stability | T8 | Device change |
| Stream dies with no error (F7) | Recording looks fine, audio is gone. Mac lost 5 h 50 m this way | D4, with the arrival watchdog, plus warning and reopen | T6 | Stopped stream |
| Audio service restarts | Same, on both tracks at once | Treat as death of all tracks, rebuild everything | T17 | Stopped stream |
| Whole-process stall of 3 to 14 s (F4) | A reopen would throw away buffered audio | D3 reports only and never reopens. Gaps come from timestamps | T4, T23 | No lost audio |
| Short stalls, 3 to 7 per hour on Mac (F5) | Tiny hidden holes | D1 marks each | T5 | No lost audio |
| Mic audio lost under load | Sync survives but words are gone | Measured and reported apart from sync, against a stated limit (C6) | T19 | Mic loss |
| Hands-free halves the rate (F10) | Duration wrong, audio plays at the wrong speed | D5 starts a new chunk at the real rate. The rate is read after every open and rebuild | T9 | Drift target |
| Hands-free silence at the switch (F9) | 1.4 s lost with no flag | Cannot be told from a quiet meeting. Only a low-confidence mark is possible (C7) | T3b | Marking only |
| Hands-free mic is lossy (F15) | About 222 of 298 s lost in one run | D8 warns, gaps marked | T12 | No lost audio |
| Hands-free flags split constantly | About 124,000 files in 8 h (see C4) | Cap on flag-only splits | T21 | No lost audio |
| Sleep or Modern Standby (F11, F12) | Track offset, or 65 s unaccounted for | D9 closes chunks at sleep, reopens at wake on a sleep-aware clock | T11 | Pauses / drift |
| Permission or privacy revoked mid-recording (F13) | Silent stop, or exact zeros that look like a quiet meeting | D7 warns, keeps going, reopens when access returns | T10, T20 | Stopped stream |
| A device change during a pause | Resume on a dead stream | Watchdog stays on during pause | T24 | Pauses |
| Disk full or write error | Silent loss | Adapter reports it at once. Handling belongs to the crash-safe plan | Crash-safe plan | No lost audio |

**Gate 2 clause test by test:**

| Gate 2 says | Proved by | Evidence to report |
| --- | --- | --- |
| 8-hour recording with pauses, a device change and a forced crash loses no saved audio and stays within drift | T15 on both machines, with the crash-safe plan | Chunks verified, gaps listed, worst sync error |
| Real Teams or Zoom call: start offset and drift from a shared sound in both tracks | T18 on both machines | Offset at start and end, measured from the audio, not from timestamps |
| Stopped stream, including an audio-service restart, detected and recovers or warns, with the missing span marked | T6, T17, T20 on both machines | Time to detect, time to recover, marked span against a logged action time |
| Mic audio lost under representative load measured against a stated limit, apart from sync | T19 on both machines | Seconds lost per track, longest gap, and sync reported separately |

**New tests:**

- **T17** Audio service restart during recording. Both tracks detected dead, rebuilt, new chunks on the same timeline, gap marked, user warned.
- **T18** Real call, using invented content and no other participants' private audio. A second device in the call plays a click train, the laptop plays it aloud, the meeting track captures it and the mic hears it from the speakers. The change in offset over the call is the drift. The call's network delay does not affect that measurement, because both tracks see the same arrival.
- **T19** Mic and meeting loss under load. Recording, live transcription and live speaker labels in a call, 8 hours. Reports loss and sync as separate numbers.
- **T20** Privacy switches off and on, mic on both systems and System Audio Recording on Mac. Gap marked, warning shown, recording resumes when access returns.
- **T21** Replay of the 300 s Bluetooth log (1281 flags): file count stays bounded and no real gap goes unsplit.
- **T22** Mic test: writes nothing, creates no meeting, releases the mic, and yields to Start (see the addition below).
- **T23** Stall with an **audible** pulse train on the meeting track. Count pulses after the stall to prove whether audio was kept. This settles F4.
- **T24** Pause during a device change, a fault-injection case listed in the Development Plan.

T13 (pause spans), T14 (complete chunk data, no missing sequence numbers) and T16 (CPU and 200 ms response under AI load) stay as the draft has them.

## Open questions Q1 to Q14

| Q | Question | Status |
| --- | --- | --- |
| Q1 | Does the Windows clock run through S3 sleep and hibernate? | Measure if a machine is available (W3). Safe either way: both tracks share the clock, so only the length of the "asleep" label could be wrong |
| Q2 | Clocks disagree by over 1 s at wake | **Decision C8** |
| Q3 | Can a denied tap be told from a silent app? Windows revocation? | Windows answered: stops silently, read from the consent setting. Mac measured in T10 and T20 |
| Q4 | Overlap over 2 ms between chunks | Proposed: later chunk wins for playback and all audio stays on disk. Nothing is deleted, so this is safe. Approved with this plan |
| Q5 | Encode hands-free at 24 kHz or resample? | **Decision M2**. On Windows it does not arise, because Windows converts everything to 48 kHz |
| Q6 | Target app restarts or spawns helpers | Rule decided (C1). The Mac mechanics are in the macOS plan |
| Q7 | Debounce length | Keep 5 s, tested by T8 |
| Q8 | Streams open during pause? | Proposed: stay open, so a dead stream is noticed before Resume. Your OS may show the mic as in use while paused. Final say in the pause/resume plan |
| Q9 | Silent-mic warning level | Proposed: warn after 30 s of exact zeros, or 2 minutes under −75 dBFS. AirPods gate quiet rooms to about −83 dBFS, so a short limit would cry wolf. Tune in Phase 2 |
| Q10 | Which Windows default for the mic? | Decided on the branch: communications (C1) |
| Q11 | Does a 1 to 2 s buffer ride out stalls? Is 30 s right? | Partly: a 2 s buffer saved 2 s of a 4 s stall. It cannot save a 14 s stall. Limits are **Decision C5** |
| Q12 | Picked mic disappears | Decided on the branch: fall back with a warning, offer to switch back (C1) |
| Q13 | Is D2b worth having? | **Decision C7** |
| Q14 | Where do the definitions live? | **Decision C9** |

## Proposed contract additions

These are proposals only. `packages/contracts` is not changed by this plan. Each change needs your approval, then it goes through the mock backend, runtime validation and the allowlists in preload and main, because it adds IPC names.

### A. Idle mic test and meters before Start

**Why:** V1 Requirements ask for "live level meters and a mic test", and your 2026-10-30 decisions list it as still to add. Today `levelMeter` exists but nothing can start it while idle. The adapter's `open` also needs a meeting and creates its folder, so it cannot be used for a test.

**What the user gets:** press **Test mic**, speak, and watch the meter. The screen says "We can hear you", "Very quiet" or "No sound from this mic".

**Proposed shape:**

```ts
// New calls
startAudioCheck: { request: { sources: SourceSelection }; response: void };
stopAudioCheck: { request: void; response: void };

// New event
audioCheck: AudioCheckStatus;

interface AudioCheckStatus {
  active: boolean;
  micDevice: InputDevice | null;
  micResult: 'listening' | 'hearing' | 'quiet' | 'noSignal' | 'denied';
  meetingResult: 'listening' | 'hearing' | 'noSignal' | 'denied' | 'notChecked';
  endReason?: 'stopped' | 'timedOut' | 'recordingStarted' | 'deviceLost';
}

// Changed: null while the meeting source is not being read
interface LevelMeter { micDb: number; meetingDb: number | null }
```

**Rules:**

1. Only runs while recording status is `idle`. Calling it during a recording returns `conflict`.
2. **Start always wins.** `startRecording` ends the check at once and is never delayed or refused because of it.
3. **Nothing is kept.** No meeting, folder, chunk or index entry is created, and audio stays in memory only for the level reading.
4. It ends by itself after 2 minutes, and when the screen closes or the window reloads, so the mic is never left open.
5. If the mic is Bluetooth, the screen warns first. Opening a headset mic can force hands-free mode, which lowers sound quality for anything playing, including a call in progress.

**How it could lose data:** by delaying or blocking a real recording, or by leaving a file behind. **T22** proves neither happens: start a recording mid-check and confirm the first chunk's time and the 200 ms response, then check that no files or index rows appear after a check.

**Test T22 also covers:** Bluetooth warning shown, the timeout releases the mic, a window reload releases the mic, and a denied permission reports `denied`.

### B. Smaller gaps the adapters will hit

| # | Change | Why |
| --- | --- | --- |
| B1 | Add `track` to `TimelineGap` (microphone, meeting or both) | A gap on one track looks like a gap on both today, so the transcript would mark the wrong speaker's audio missing |
| B2 | Add optional `track` to `RecordingWarning` | "Audio missing" must say which one |
| B3 | Add warning `meetingAppExited`, and a pause reason on `RecordingState` | Your rule auto-pauses when the app does not return in 2 minutes. The UI cannot say why it paused |
| B4 | Add `unknown` to `PermissionState` | macOS may offer no way to read System Audio Recording. Showing `granted` from a guess would be false |
| B5 | State in a comment that `MeetingApp.id` stays the same across restarts | It is saved in settings. A process number changes each launch, and the app must not lose your choice |
| B6 | Add gap kind `possiblyMissing` (only if C7 is accepted) | So the low-confidence mark can be shown |

## Decisions for the owner

**C1. Confirm four decisions recorded only on the `windows-capture` branch.** They are not in `docs/handoffs/2026-10-30-owner-decisions.md`, and this plan depends on them.
(a) "System default" mic means the Windows communications default. (b) A picked mic that vanishes falls back to the default with a warning, and the app offers to switch back when it returns. (c) If the meeting app exits: warn at once, keep the mic recording, mark the meeting track missing, reattach if it returns within 2 minutes, otherwise auto-pause and offer Resume or Stop, never widening to whole-computer audio on its own. (d) A chunk splits at every OS discontinuity flag.
*Recommendation: confirm (a), (b), (c). Change (d) as in C4.*

**C2. Approve the mic test, and choose how it starts.**
Option 1: a **Test mic** button. Option 2: meters run whenever the Live screen is open.
*Recommendation: the button, with no playback of your voice.* Always-on meters would show the OS mic-in-use light whenever the screen is open, and could push a headset into hands-free mode during a call. No playback means no audio is ever kept.

**C3. Approve contract fixes B1 to B5.**
*Recommendation: approve. B1 matters most, because without it a one-track gap is shown wrongly.*

**C4. How often may a flag split a chunk?** On a hands-free mic Windows raised 1281 flags in 298 s, about 4 a second, often with no audio lost (126 flags, zero lost frames in the voice check). Splitting at each would make about 124,000 files in 8 hours instead of about 5,760.
*Recommendation: real gaps always split. Flags with no gap split at most once a second and are recorded in the chunk's data.* Sync stays bounded and the file count stays reasonable.

**C5. How long before the app acts on a silent stream?** A short limit recovers faster but risks reopening during a stall, which throws away buffered audio. A long limit loses more. Phase 0 stalls reached 13.8 s on Windows and 0.4 s on Mac.
*Recommendation:*
- *Warn you after 3 s on either system, and clear the warning if audio returns.*
- *One track silent while the other flows: reopen after 5 s.*
- *Both tracks silent: reopen after 15 s on Windows, 5 s on Mac.*
- *Device signals still act at once.*
All the limits are provisional and re-measured on the real adapters.

**C6. What mic-audio loss is acceptable under normal load?** Gate 2 requires a stated limit. The quality target says "none, and any gap is shown", which no machine has met. Windows lost 160 s in 8 h under benchmark load, far heavier than recording. Mac would lose about 2.6 to 5.7 s in 8 h at measured rates.
*Recommendation: at most 30 s per track per 8 hours, no single gap over 5 s, and 100% of gaps marked.* Normal load means a call with live transcription and speaker labels, not benchmarks. If a machine misses this, it comes back to you with the numbers.

**C7. Show "possibly missing"?** When a headset switches modes, 1.4 s of meeting audio can vanish with no signal. It looks exactly like a quiet moment, so the app can only guess.
*Recommendation: keep the mark and show it faintly on the timeline, with no warning.* V1 says no audio may be lost silently, and a faint mark is honest about the doubt. This needs B6.

**C8. If the clocks disagree at wake (Q2).**
*Recommendation: the timeline clock places the audio and the fault is logged.* Both tracks share that clock, so they stay in sync, and only the length of the "asleep" label could be wrong.

**C9. Where do the definitions live (Q14)?**
*Recommendation: only what the UI sees goes in `packages/contracts`.* Adapter commands, events and nanosecond times stay backend-only in a new `packages/capture`, as the contract README already says for time. Chunk data belongs to the crash-safe chunks plan. This revises the draft, which placed chunk metadata and events in the contract.

**C10. If only one track can open at Start, record or refuse?** The branch refuses, so a blocked mic means the meeting audio is not recorded either.
*Recommendation: record the track that works, with a persistent warning and a marked gap. Refuse only when neither opens.* A partial record is better than none, and V1 says loss must be shown, not that recording must stop.

## After approval

1. Gate 1 approval comes first, because gates run in sequence.
2. Contract additions go in as their own change, with your approval.
3. `packages/capture` holds the shared rules and the U tests (T1, T2, T3, T3b, T8, T13, T14, T21).
4. Then the adapter plans, each on its own branch.
5. Test results are reported against this plan, and you approve the merge.

Any hands-on step with a time in it shows a live on-screen countdown.
