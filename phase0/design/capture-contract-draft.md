# Capture Contract and Session Clock (draft)

Status: **Draft for the first Phase 1 Planner plan; not approved**

This is Phase 0 design input, not production code.  It prepares the first
plan in the Development Process list ("capture contract and session clock")
from the measurements in `phase0/evidence/gate-0.md`.  The Windows and macOS
adapter plans, crash-safe chunks and recovery, and pause/resume are later
plans; this draft fixes only what they share.  Thresholds marked
*provisional* come from Phase 0 runs and must be re-measured on the Phase 2
adapters.  Open questions are collected at the end and numbered Q1--Q12.

## Sources

- V1 Requirements v1.2: "Audio capture and audio settings", "Recording
  integrity and pause/resume", the storage layout (`audio/microphone/`,
  `audio/meeting/`).
- Development Plan v2.0: Architecture (audio worker never waits on AI),
  Data and storage rules (permanent IDs, write-then-rename, versioned
  formats), Phase 2 and Gate 2, quality targets (no silent loss, drift under
  100 ms over 8 h, recording CPU under 10%, record/pause/stop within 200 ms).
- Gate 0 evidence: every "Design consequence" paragraph and both
  device-state case tables.  Owner decisions of 2026-10-29 (Electron with
  project-owned capture adapters; 5 s mono Opus 32 kbps chunks stamped with
  the first frame's device timestamp).

## What Phase 0 measured that this contract must absorb

| # | Finding | Where |
| --- | --- | --- |
| F1 | Sample-count alignment drifted up to 122 ms in 8 h; per-chunk device timestamps stayed within 2 ms for 99.95% of packets and self-healed at the next chunk | Windows 8 h run |
| F2 | The device position counter skips frames together with the audio, so it cannot reveal gaps; QPC stamps can | Windows 60 min run |
| F3 | Process-loopback stamps are frame-derived (exactly 48000.0000 Hz), so only arrival time is an independent check on that track | Windows single-process probe |
| F4 | Whole-process stalls of 3--14 s (23 in 8 h) cost the mic its audio (200 ms buffer); the app track was buffered by Windows | Windows 8 h run |
| F5 | macOS IO-cycle stalls of up to ~0.4 s, a few per hour, hit both tracks in the same second, with or without AI load | macOS 60 min and Metal reruns |
| F6 | The mic never follows a default-device change (both OSes) | Device cases |
| F7 | A removed device stops delivering: no packets, no error, no padding | Windows BT disconnect at 72.9 s; macOS AirPods disconnect at 70 s |
| F8 | The default communications mic flapped AirPods/Realtek every ~4 s for 50 s on its own | Windows device cases |
| F9 | Entering Bluetooth hands-free left 1.4 s of digital silence on the Windows app track with no discontinuity flag | Windows device cases |
| F10 | A macOS tap aggregate clocked by a hands-free headset delivered 24 kHz while 48 kHz was assumed, with no flag; falling back to speakers padded 35 s in one step | macOS AirPods disconnect |
| F11 | After 44 s of Modern Standby the app track ended 1.69 s short of QPC with no flag; the mic was gap-filled and stayed aligned | Windows sleep/wake |
| F12 | Host time stops during sleep: 55 s of sleep showed as one 24 s jump; the recording was ~41 s shorter than the wall span | macOS sleep/wake |
| F13 | A macOS tap without System Audio Recording permission runs normally and delivers exact zeros; no prompt, no error | macOS permission finding |
| F14 | A silent target process still delivers continuous zero packets on Windows | Windows single-process probe |
| F15 | Bluetooth hands-free mic capture is lossy (HFP lost ~222 of 298 s in the input-switch case) | Windows device cases |

## 1. Capture adapter interface

One interface, two native implementations, both running in the audio
worker process (separate from the app core and AI workers, at MMCSS "Audio"
priority on Windows and on the HAL real-time IO thread on macOS).  The app
core drives it over the worker's control channel; the adapter never waits
on the app core to write audio (chunk writing lives in the worker).

**Commands**

| Command | Arguments | Effect | Must respond within |
| --- | --- | --- | --- |
| `open` | session ID, meeting source (process ID set or "whole computer"), mic (device ID or "system default"), session clock origin | Opens both streams; meters run; nothing written | 2 s (provisional) |
| `start` | none | Begins writing chunks on both tracks | 200 ms |
| `pause` | none | Closes the open chunk on both tracks (reason `pause`); streams stay open (Q8) | 200 ms |
| `resume` | none | Opens a new chunk on both tracks, stamped by the session clock | 200 ms |
| `stop` | none | Closes and finalizes both tracks; streams closed | 200 ms to acknowledge; finalizing may take longer |
| `selectMic` / `selectSource` | device ID or "system default" / process set | Mid-recording switch; forces a chunk boundary on that track | 200 ms |

Each command is acknowledged with the session-clock time at which it took
effect on each track, so the core can record paused spans exactly.

**Events** (adapter to core; every event carries track, session-clock time,
wall time and the chunk ID it closed, if any)

| Event | Raised when | Required adapter action |
| --- | --- | --- |
| `chunkClosed` | Any chunk is finalized | Report metadata (section 3) |
| `discontinuity` | Device timestamps jump, or arrival and stamps disagree (section 4) | New chunk; record the missing span |
| `streamStalled` | No packets for longer than the stall threshold | Close chunk at last frame; keep waiting |
| `streamDead` | Stall exceeds the death threshold, or the device reports not alive/invalidated | Attempt reopen (section 4); report outcome |
| `deviceChanged` | Debounced default-device change, device added/removed, or the selected device vanished | Reopen on the new device if following default; new chunk |
| `rateChanged` | Delivered rate differs from the stream's current rate | New chunk at the measured rate |
| `permissionLost` | Capture is denied or the app track is all-zero while the source is producing output | Keep writing (Q3); tell the user |
| `sleeping` / `woke` | OS power notifications | Close chunks on sleep; new chunks on wake |
| `sourceChanged` | Target process exits, restarts or spawns audio helpers | Re-target; new chunk (Q6) |
| `health` | Every 1 s | Level, packets, padded ms, current device, current rate |

The UI's "Recording health" panel and the requirement to warn about missing
permissions, a silent mic and device changes are fed only from these events.

## 2. Session clock

The session timeline is one monotonic, sleep-aware nanosecond scale shared by
both tracks.  Sample counts never place audio (F1); they only measure
duration inside one chunk.

**Clocks**

| Role | Windows | macOS |
| --- | --- | --- |
| Device timestamp of a packet's first frame | QPC from `IAudioCaptureClient::GetBuffer` | `mInputTime.mHostTime` (`mach_absolute_time` units) |
| Sleep-aware monotonic (timeline) | QPC (advanced across Modern Standby in F11; Q1 for S3/hibernate) | `mach_continuous_time` |
| Wall anchor | `GetSystemTimePreciseAsFileTime` | `clock_gettime(CLOCK_REALTIME)` |

**Rules**

1. At `open` the core fixes the session origin: one simultaneous reading of
   the timeline clock and the wall clock.  Timeline time is
   `timeline_now - origin`, in nanoseconds.
2. Each chunk stores its first frame's device timestamp converted to timeline
   time.  On macOS the conversion is `host_time + sleep_offset`, where
   `sleep_offset = mach_continuous_time() - mach_absolute_time()` is read at
   chunk open; it only changes across sleep (F12), and a chunk never spans a
   sleep (rule 5).
3. Each chunk also stores a wall anchor: a (timeline, wall) pair read at
   chunk open.  The wall anchor is for display ("10:42 AM") and for
   cross-checking; it never places audio.  A disagreement between the two
   clocks of more than 1 s across one chunk boundary, not explained by a
   logged wall-clock adjustment, is logged as a clock fault (Q2).
4. A chunk's span on the timeline is `[start, start + frames / rate]`, using
   the rate that chunk was actually delivered at (F10).
5. Chunks never span a discontinuity, sleep, device change, rate change,
   pause or permission change (section 3), so every placement error is
   bounded by one chunk and corrected at the next boundary (F1).
6. Placement between consecutive chunks of one track:
   - gap over 2 ms: a missing span with a cause (`stall`, `device`,
     `sleep`, `pause`, `permission`, `unknown`); shown as "audio missing"
     (or "paused" / "computer asleep"), never as silence;
   - gap up to 2 ms, or overlap up to 2 ms: treated as contiguous (Phase 0
     sync error was within 2 ms for 99.95% of packets);
   - overlap over 2 ms: the later chunk wins for playback, the overlap is
     logged; the earlier chunk's audio is kept on disk (Q4).
7. The mic-to-meeting sync target (under 100 ms over 8 h) is measured as the
   difference between the two tracks' chunk starts for chunks opened on the
   same event, plus the in-chunk error measured by
   `scripts/analyze_alignment.py`.

## 3. Chunk rules

- Per track: Ogg Opus, mono, 32 kbps, 20 ms frames, VOIP, constrained VBR
  (owner decision; 10--14 MB per track-hour measured).  Encoding stays well
  under the 10% recording-CPU target (about 1% of one core per track).
- Encoder input rate: the delivered rate when Opus supports it (8, 12, 16,
  24 or 48 kHz), otherwise resampled to 48 kHz (Q5).  Downmix to mono inside
  the worker; the unprocessed original is this downmix, before any preset.
- Target length 5 s of audio.  A chunk closes early on: discontinuity,
  arrival gap over the stall threshold, device change, rate change, sleep,
  wake, pause, permission change, source change, stop.  Short chunks are
  valid; there is no minimum length.
- Each chunk file is written to a temporary name and renamed when closed
  (Data and storage rules).  Recovery of an unclosed temporary file belongs
  to the crash-safe chunks plan.
- Silence padding inside a chunk is allowed only for gaps shorter than the
  stall threshold; it keeps the encoder continuous.  Every padded span is
  recorded.  Longer gaps end the chunk instead of being padded (F4, F5:
  padding 3--14 s or 35 s in one step hides the loss inside a chunk).

**Chunk metadata** (per chunk, in the track's index file; format versioned)

| Field | Meaning |
| --- | --- |
| `chunkId` | Permanent ID |
| `track` | `microphone` or `meeting` |
| `seq` | Per-track sequence number, gap-free |
| `startNs` | Timeline time of the first frame (section 2) |
| `deviceStamp` | Raw first-frame device timestamp and its clock (`qpc`, `hostTime`) |
| `wallAnchor` | (timeline ns, wall UTC) read at open |
| `rate` | Delivered sample rate for this chunk |
| `frames` | Frames encoded, including padding |
| `paddedSpans` | List of (offset ms, length ms, cause) inside the chunk |
| `deviceId` / `deviceName` / `transport` | Device used; transport flags Bluetooth hands-free |
| `source` | Process set or "whole computer" (meeting track only) |
| `openReason` / `closeReason` | `start`, `rollover`, `discontinuity`, `stall`, `device`, `rate`, `sleep`, `wake`, `pause`, `resume`, `permission`, `source`, `stop` |
| `allZero` | True if every sample was zero (feeds permission detection) |

## 4. Detection rules

| Rule | Detection | Provisional threshold | Motivation |
| --- | --- | --- | --- |
| D1 Timestamp discontinuity | Packet stamp minus (previous stamp + previous frames / rate) | over 2 ms | F2 |
| D2 Arrival/stamp divergence | Arrival time minus packet stamp drifts from its running baseline | over 50 ms | F3, F9, F11: loopback stamps stay frame-perfect while time is lost |
| D3 Stall | Arrival watchdog on a separate thread: no packet for the threshold | 500 ms (normal max waits were 68 ms Windows, 394 ms macOS) | F4, F5 |
| D4 Stream death | Stall continues past the death threshold, or device not alive / `AUDCLNT_E_DEVICE_INVALIDATED` / session disconnected | 3 s, or device signal at once | F7 |
| D5 Rate change | Frames over device-timestamp delta, sliding 1 s window, against the current rate; plus the device's nominal-rate property | over 5% off | F10 |
| D6 Default-device change | OS notification, then debounce until the default is unchanged | stable for 5 s (Q7) | F6, F8 |
| D7 Permission loss | Open fails with access denied, or app track all-zero while the source is known to be producing output | 3 s of zeros with output active | F13, F14 |
| D8 Hands-free mic | Selected mic's transport is Bluetooth hands-free (HFP/SCO) | at selection and on change | F15 |
| D9 Sleep/wake | OS power notifications; plus a timeline jump over the stall threshold seen by the watchdog when a notification is missed | as D3 | F11, F12 |
| D10 Silent mic | Mic level below the noise floor for a long span (existing requirement) | Q9 | V1 Requirements |

**Reactions**

- D1, D2, D3: close the chunk at its last real frame and open a new one at the
  next packet, stamped from its device timestamp.  For D2 on a frame-derived
  stream (Windows loopback), the new chunk is stamped from arrival time
  minus the stream's measured latency, since its device stamp is not
  independent (F3).
- D4: close the chunk, raise `streamDead`, reopen the same device once; if it
  is gone, follow the system default (when "system default" is selected)
  or fall back to it with a warning (when a specific device was picked and
  is gone).  The missing span runs until the first packet of the new stream.
- D5: close the chunk and open one at the measured rate.  On macOS also
  rebuild the tap aggregate (section 5).
- D6: when "system default" is selected, reopen the mic on the new default
  after the debounce; when a specific mic was picked, do not follow, only
  offer it ("Audio device suggestions").  The meeting track's macOS
  aggregate is rebuilt on a default-output change regardless.
- D7: raise `permissionLost` and show a persistent warning.  Writing
  continues so that a false positive loses nothing (Q3).
- D8: warn once per selection that this mic is lossy and suggest the
  built-in mic; padded spans are marked as on any track.
- D9: on sleep, close both chunks (reason `sleep`); on wake, open new chunks
  (reason `wake`) after re-reading the sleep offset; the span between is
  "computer asleep".  Hold the OS keep-awake assertion while recording
  (`ES_SYSTEM_REQUIRED`; macOS `PreventUserIdleSystemSleep`) so only lid
  close or user sleep can cause this.

## 5. Per-platform notes

**Windows**

- Meeting track: process loopback via `ActivateAudioInterfaceAsync` with
  `VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK` and include-process-tree.
  Isolation 78--83 dB and survives worker crashes (Gate 0).  Whole-computer
  fallback: endpoint loopback on the default render device, which must be
  reopened on a default-output change.
- Mic: shared-mode, event-driven, with a 1--2 s buffer instead of 200 ms
  (Gate 0 consequence 2; whether it rides out 3--14 s stalls is unmeasured).
- `IMMNotificationClient`: `OnDefaultDeviceChanged` for `eCapture` in the
  role the mic picker uses (Q10), `OnDeviceStateChanged`,
  `OnDeviceRemoved`.  Callbacks only post to the worker's queue; no
  stream work inside them.
- `IAudioSessionEvents::OnSessionDisconnected` and
  `AUDCLNT_E_DEVICE_INVALIDATED` feed D4 directly.
- Power: `PowerRegisterSuspendResumeNotification` in the worker (Electron's
  `powerMonitor` in the core is a backup, not the source).
- D2 is the only way to see the 1.69 s post-standby loss and the 1.4 s
  hands-free silence on the loopback track (F9, F11).

**macOS**

- Meeting track: `CATapDescription` over the target's Core Audio process
  objects (`kAudioHardwarePropertyTranslatePIDToProcessObject`),
  `AudioHardwareCreateProcessTap`, and a private aggregate device holding
  the tap.  The aggregate is clocked by the default output device, which is
  why a hands-free headset halves the rate (F10).  Rebuild the aggregate on
  `kAudioHardwarePropertyDefaultOutputDevice` changes and on D5.
  Whole-computer fallback: a global tap excluding this app's own processes.
- Mic: IOProc on the input device, on the HAL real-time thread (nil
  dispatch queue): the shared GCD queue gave 6 stalls/h against 2 (Gate 0).
- Listen to `kAudioHardwarePropertyDefaultInputDevice`,
  `kAudioDevicePropertyDeviceIsAlive` and `kAudioDevicePropertyNominalSampleRate`
  per open device.
- Power: `NSWorkspaceWillSleepNotification` / `DidWakeNotification` (or
  `IORegisterForSystemPower`) in the worker.
- Permission: request System Audio Recording explicitly at onboarding; the
  signed app must be its own responsible process (F13).  D7 needs to know
  whether the target is producing output; `kAudioProcessPropertyIsRunningOutput`
  on the process object is the candidate signal (Q3).
- Stalls of up to ~0.4 s hit both tracks together (F5); D3 handles them and
  they must appear as "audio missing", not silence.

## 6. Tests

Kinds: **U** unit test on a recorded or synthetic packet log (the Phase 0
timing CSVs in `artifacts/capture/` replayed through the detection and
placement code); **F** fault injection on the real adapter; **H** hands-on
hardware run.  Gate 2 is "an 8-hour recording with pauses, a device change
and a forced crash loses no saved audio and stays within the drift target".

| Test | Rule | Phase 0 case | Kind | Gate 2 part |
| --- | --- | --- | --- | --- |
| T1 Placement by chunk stamp keeps sync under 2 ms per chunk on the 8 h log | §2 rules 2--6 | Windows 8 h run (F1) | U | Drift target |
| T2 Gaps visible only in stamps create a new chunk and a missing span | D1 | Windows 60 min mic glitches (F2) | U | No lost audio |
| T3 Loopback time loss with clean stamps is caught | D2 | Standby 1.69 s; hands-free 1.4 s (F9, F11) | U + F | Drift target |
| T4 3--14 s whole-process stall: chunk ends, gap marked, sync recovers | D3 | Windows 8 h stalls (F4) | U + F (suspend worker threads) | No lost audio |
| T5 Sub-second IO stall on both tracks marked "audio missing" | D3 | macOS stalls (F5) | U + H | No lost audio |
| T6 Device removed with no error: dead stream detected, reopened, gap bounded | D4 | BT disconnect, both OSes (F7) | F + H | Device change |
| T7 Mic follows default only when "system default" is selected | D6 | Input switch, both OSes (F6) | F + H | Device change |
| T8 Flapping default does not cause reopen storms | D6 | Default flapping (F8) | U (synthetic notifications) | Device change |
| T9 Hands-free rate halving produces a rate change and correct duration | D5 | macOS AirPods disconnect (F10) | U + H | Drift target |
| T10 All-zero tap with output active raises `permissionLost`; silent app does not | D7 | macOS permission (F13), silent target (F14) | F + H | (Phase 2 warnings) |
| T11 Sleep closes chunks; wake opens new ones; timeline spans the sleep | D9, §2 | Windows standby, macOS sleep (F11, F12) | F + H | Pauses / drift |
| T12 Hands-free mic warning shown, padded spans marked | D8 | HFP loss (F15) | H | No lost audio |
| T13 Pause and resume give exact paused spans on both tracks | §1, §3 | none (new) | U + F | Pauses |
| T14 Every closed chunk has complete metadata; `seq` is gap-free | §3 | none (new) | U | Forced crash (with the recovery plan) |
| T15 8 h run, both machines, with pauses, one device change and a worker kill | all | Gate 0 8 h and stress runs | H | All of Gate 2 |
| T16 Recording CPU under 10% and commands within 200 ms under AI load | §1 | Windows/macOS stress runs | H | (quality targets) |

Untested in Phase 0 and needed before Gate 2: USB mic unplug and mic privacy
toggled off mid-recording (Windows), Teams/Zoom/browser as real targets,
docking station, and the macOS 8 h idle baseline (in progress).

## Open questions

- **Q1** Does QPC advance across S3 sleep and hibernate as it did across
  Modern Standby?  If not, the Windows timeline needs
  `QueryInterruptTime` or a wall-anchored correction on wake.
- **Q2** Which clock wins when the sleep-aware monotonic clock and the wall
  clock disagree across a wake by more than 1 s with no logged adjustment?
  Draft: monotonic places audio, the fault is logged; confirm.
- **Q3** Can permission loss be told apart from a silent meeting app without
  a process-output signal?  Is `kAudioProcessPropertyIsRunningOutput`
  reliable, and is there a supported preflight for System Audio Recording?
  Windows mid-recording mic-privacy revocation is unmeasured.
- **Q4** Overlap over 2 ms between chunks: later chunk wins (draft), or
  trim the earlier chunk?  Phase 0 saw no such overlap; it can only come
  from a clock fault.
- **Q5** Encode hands-free audio at 24 kHz or resample to 48 kHz?  One rate
  per track simplifies playback; native rate avoids resampling.
- **Q6** Process targeting over a meeting: Teams/Zoom restart, child audio
  helpers, browser tab processes.  Windows include-tree covers children;
  macOS needs re-tapping when the process list changes.  How is the target
  set defined and refreshed?
- **Q7** Debounce length for default-device changes: the observed flapping
  was every ~4 s for 50 s; 5 s stable is a guess that may still miss a
  slow flap or delay a real switch.
- **Q8** Do streams stay open while paused (live meters, fast resume) or
  close (no capture at all while paused, which the user may expect)?
  Belongs to the pause/resume plan but changes this interface.
- **Q9** Silent-mic warning threshold and duration, given that the AirPods
  hands-free mic gates noise by about 50 dB.
- **Q10** Which Windows role does the mic follow: `eCommunications` (what
  the probes used) or `eConsole`?
- **Q11** Does a 1--2 s mic buffer remove the Windows mic loss under 3--14 s
  stalls, or must the audio worker run at higher priority or with AI work
  throttled during recording?  Re-measure on the Phase 2 adapter.
- **Q12** Where does the contract live: the chunk metadata and event types
  belong in the owner-approved contract folder (Development Process,
  Agent split); the adapter command set is backend-only.  Confirm the split
  before the plan is written.
