# scrb-capture (Windows capture adapter)

Status: **device cases and the 4 h long run done on this PC; real meeting apps
are not done.**  Design source:
`phase0/design/capture-contract-draft.md` (still a draft).

## Build

Recorded on a Dell Precision 7760, Windows 11 10.0.26300, VS 2022 Build Tools
in `C:\BuildTools`, Windows SDK 10.0.26100, libopus
`251d657e92fccfa3b05baec4f05756cce252fb75` (`phase0/MANIFEST.md`).

```
pwsh -File scripts\fetch-opus.ps1
build.cmd
build\bin\PipelineTests.exe ..\..\phase0\artifacts\capture\devices\sleep-wake-timing.csv
```

The helper links the dynamic C runtime (`/MD`) to match the libopus build; a
shipped build must bundle it or move both to `/MT`.

## Protocol

The protocol matches the Mac helper and `CaptureAck` in
`packages/capture/src/index.ts`.  One JSON object per line on stdin, one on
stdout; arrays are allowed as values.  Every command has an `id` and `name`, and
a repeated `id` gets the first reply and repeats nothing.  Every
`{"type":"ack"}` carries `gate`, `activeTracks` and `atNs` (session clock, or
null).  A command in the wrong state returns `error: "conflict"`.  Closing stdin
stops and finalizes the recording.  A worker exits after `stop`.

`scrb-capture check-lock <path>` exits 3 if a live worker holds that lock.

| Command | Fields | Notes |
| --- | --- | --- |
| `open` | `sessionId`, `outputDir`, `source` (process IDs; `[]` = whole computer), `mic` (`default` or device ID) | Streams open, meters run, nothing written.  Succeeds if either track opens |
| `start` | | Ack also carries the session origin |
| `pause`, `resume` | `cause` (optional) | One shared gate.  Resume is refused if neither stream is ready |
| `stop` | | Files closed and lock released before the ack |
| `checkPermission` | | Always `granted`: Windows has no system-audio permission |
| `selectMic` | `mic` | Forces a chunk boundary |
| `selectSource` | `source` | Forces a boundary; also reattaches a restarted app |
| `listMics` | | Ack carries `mics`; `defaultConsole` and `defaultCommunications` are extra |
| `listApps` | `include` | Ack carries `apps`.  `bundleId` is the exe file name, `pids` the roots of its process trees |
| `quit` | | Stops if needed and exits |
| `inject` | `track`, `fault`, `ms` | Only with `--test-hooks` |

Process loopback captures one process tree, so `open` uses the first ID in
`source`.  A second instance of an app with a separate tree is not captured.

Events (`{"type":"event"}`): `chunkClosed`, `discontinuity`, `streamStalled`,
`streamDead`, `streamReopened`, `deviceChanged`, `defaultNotice`,
`defaultApplied`, `rateChanged`, `permissionLost`,
`permissionRestored`, `sleeping`, `woke`, `sourceChanged`, `micFallback`,
`micReturned`, `micSuggestion`, `handsFreeMic`, `clockFault`, `writeError`,
`health` (`micDb`, `meetingDb`), `trackHealth`.

Files, per `docs/plans/crash-safe-chunks.md`, under `<outputDir>/audio/`:
`{microphone,meeting}/NNNNNN.opus`, first written as `.opus.part`, each with
`chunks.log`; `session.log`; `writer.lock`, held for the whole run.  Numbering
starts at 0, and a restarted worker continues it.  `chunks.log` adds
`missingBeforeMs`, `missingCause`, `overlapMs`, `allZero`, `transport` and
`paddedSpans` to the fields recovery reads.

The gate is in `Track::CaptureLoop`.  It compares corrected stamps, because
loopback stamps can lag real time (F3).  A loss in the last 250 ms before a pause
is not yet confirmed, so it is not counted.

## Owner decisions (2026-10-30)

- Mic "system default" follows `eConsole`, the Input choice in Settings (Q10).
  This replaces an earlier choice of `eCommunications`: on this PC Settings
  does not move that role, and connecting a headset does.
- A picked mic that disappears falls back to the default with a warning; when
  it returns, the app offers to switch back (Q12).
- Target app exits (Q6): warn at once, keep the mic recording, mark the meeting
  track missing; reattach if the same app returns within 2 minutes; otherwise
  auto-pause and offer Resume or Stop.  The adapter reports `sourceChanged` and
  reattaches on `selectSource`; **the timer and auto-pause belong to the app
  core, not built here.**  It never widens to whole-computer on its own, and
  that now holds for a failed per-app open too (W2): it retries and warns.
- A chunk splits on every OS discontinuity flag.

## Owner decisions (2026-10-31)

- The 4 h run with CPU load counts as Gate 2's representative load.  Full T19
  moves to the 8 h run before Gate 8, because it needs live transcription, which
  is built after Gate 2.
- The track-timeline offset is accepted for the 4 h run.  The shared-sound check
  is Gate 2's real-call test.

## Matching the Mac helper (2026-10-30)

Run after merging `main`, with output muted, on invented tones.  The tables
below it are older and describe the earlier protocol and files.  This PC has no
Python or ffmpeg, so `scripts/pause_case.mjs` and `scripts/crash_case.mjs` are
Node versions that decode with `ChunkVerify --levels`.

| Case | Result |
| --- | --- |
| PipelineTests with the logged standby replay | Pass, 0 failures; 1690 ms detected of 1690 ms |
| `pause_case.mjs` | Pass: pause ack 0.3 ms, retry returned the first reply, 2000 Hz marker at most 9.5 against 4490 for the tone, and -17.9 dB at the stream while paused shows the marker was there to block |
| `crash_case.mjs` | Pass: lock held, then free after a force-kill; `.part` repaired; 350 ms lost of 7365 ms |
| `real-recording.spec.ts` with `SCRB_CAPTURE_HELPER` | Pass: start, pause, resume and stop from the Live screen, meeting `ready`, no mic gaps |
| `run-case.ps1`: `gate-baseline`, `gate-whole-computer` | Pass: `VERIFY OK`; 3.97 s paused on both tracks |
| Source `[-1]`, second writer, restart in the same folder | Mic only with no widening; `writer lock held`; numbering continued past the `.part` |

### Stop during a pause (2026-10-30)

`Gate::Close` now moves only an open gate, and Stop's ack keeps its own time.
`scripts/stop_paused_case.mjs` is stricter than the Mac script: each round also
needs tone on the meeting track, one chunk per track and Stop's own time.

| Run | Result |
| --- | --- |
| Before the fix, 8 rounds | Fail as it should: paused mic audio reached a new chunk in all 8, about 1 s past the cutoff |
| After the fix, no tolerance, 2 runs of 40 rounds | Fail, 1 late chunk each: 0.028 ms and 0.031 ms past the cutoff |
| Instrumented scratch build, 120 rounds, 35,718 packets | 7 late chunks of 240 track checks, at most 0.587 ms.  No packet ending past the cutoff passed a closed gate |
| After the fix, 10 ms tolerance, 40 rounds (`results/stop-paused-case.txt`) | Pass: all 80 track checks clean |
| `pause_case.mjs` after the fix | Pass: pause ack 0.5 ms, marker 3.6 against 4483, -17.9 dB at the stream while paused |
| PipelineTests after the fix | Pass, 0 failures |

The case allows one packet, 10 ms, by owner decision: the plan puts the cutoff's
accuracy at about a packet.  The 120 rounds showed two causes, both harmless.  In 6
late chunks a packet saw the gate still open and had left Windows 0.12 to 0.35 ms
before the cutoff, with a stamped end just past it.  In 1 no packet went past the
cutoff, and the end calculated from the frame count ran 0.038 ms late.  That run
also had 54 packets read after the gate closed, each stamped as ending by the
cutoff; how late they arrived was not recorded.  The old bug, about 1 s, still
fails this case by far.

## Results on this PC

Output muted; tone target; each case in `results/<case>.txt`.  Every run
decoded with ChunkVerify: all Ogg CRCs valid, decoded frames equal the index,
`seq` gap-free, no unexplained gap.

| Case | Result |
| --- | --- |
| Pipeline tests (T2, T3, T3b, T4, T6, T11, T13, T14) | Pass |
| Logged Modern Standby replay (F11) | Pass: 1690 ms detected of 1690 ms |
| Baseline with pause, 30 s | Pass: paused 5.04--5.05 s on both tracks, tone in all 7 meeting chunks, about 40 KB per 10 s |
| Stall both tracks 4 s (fault hook) | Pass as marked: mic lost 2.01 s (2 s buffer kept the rest), meeting lost 3.98 s; both `stall`, no reopen.  See finding 2 |
| Stream silently stops (fault hook, 5 s limit) | Pass: `streamDead`, reopened; 11.97 s missing, cause `device` |
| Time loss on meeting stamps (fault hook) | Pass: 1.70 s re-anchored.  See finding 3 |
| Force-kill mid-run | Pass: all closed chunks valid; one `.tmp` per track left for recovery |
| Target app exits | Pass: `sourceChanged`, mic continued to the end, meeting closed with reason `source` |
| Whole-computer capture | Pass: tone in all 5 chunks |
| `selectSource`, `selectMic` mid-run | Pass: boundaries forced; 28 ms and 430 ms missing |

Reruns of the Phase 0 failures, owner at the PC, with the `scripts/countdown.ps1`
timer:

| Case | Phase 0 failure | Result |
| --- | --- | --- |
| `input-switch` | Mic did not follow default | Pass: followed Settings both ways; 1.80 s and 0.08 s missing |
| `bt-disconnect-picked` | Mic stopped silently | Pass on behavior: `streamDead`, `micFallback` to the built-in mic after 5.4 s, `micReturned`.  Its VERIFY FAILED line is the seq 72 drift fixed afterward (finding 7); `bt-call-mode` verifies that fix |
| `bt-disconnect` | App audio silent after disconnect | Pass for meeting: tone back after about 2.5 s.  The mic stayed on the built-in device, so this run did not test mic loss |
| `bt-call-mode` | 1.4 s silence, no flag | Pass: meeting tone in all 17 chunks, 0 ms missing.  See finding 6 for the mic |
| `sleep-wake` | 1.7 s offset | Pass: 71.1 s `sleep` on meeting, 71.4 s on mic, against 72 s in the Windows log.  See finding 8 |
| `mic-privacy-off` | Mic stopped, never resumed | Pass: 45.7 s `permission` missing; reopened 0.45 s after access returned |
| `audio-restart-tree` | Mac capture died silently | Pass after finding 5: meeting back in about 1.8 s, mic in 5.6 s |
| `default-debounce` | None | Pass, weakly: no `deviceChanged` with an 8 s debounce.  The log cannot show that the two quick changes happened |

4 h long run with load (2026-10-30, `results/long-run.txt`).  **This is not the
full T19 load test: it had no real call and no live transcription.**  Load was
the CPU fallback, 6 spinning threads of 12 logical cores at below-normal
priority, because the Phase 0 speech tools and AMI audio are not on this PC.
System CPU averaged 70.2%.  The owner re-tested the switch, so there were 4
device changes, not 2.  Output mute was left to the owner after 21 min.

| Limit | Result |
| --- | --- |
| Chunks numbered, no `.part` after recovery | Pass: 6982 mic, 2857 meeting, 0 breaks, 0 left, 0 damaged |
| Every gap marked | Pass: 1350 mic, 8 meeting, 0 unmarked |
| Audio against timeline minus pauses (14249.981 s) | Mic 13940.960 s, meeting 14249.084 s |
| Worst offset under 50 ms | Pass as corrected: 1.95 ms drift on track timelines.  The run printed FAIL, 2390.04 ms, from an unsound measure (finding 11).  Not measured on the headset or against a shared sound |
| Mic loss at most 15 s | **Fail: 309.924 s.**  308.117 s on the No Air 3 headset, 1.806 s on the built-in mic.  Owner decision (2026-10-31): accepted as the known headset problem (finding 6), not counted as a pass |
| Pause ack 99th percentile under 200 ms | Pass: 28.61 ms, the slowest of 5 |
| No chunk crosses a pause | Pass: 0 of 5 pauses, timing check |
| Audio lost at the kill, about 1 s or less | Pass: mic 135 ms, meeting 702 ms |

Helper: 3.87% of one core on average, highest minute 7.09%; peak working set
19.6 MB, private 8.2 MB at hour 1 and 8.3 MB at the end; 327 handles at both.

Not run: Windows Audio restart with whole-computer capture.  Unverified: real
Teams/Zoom/browser targets, the full T19 load test, the 8 h run, and USB
unplug (no USB mic).

## Findings

1. **The 1.7 s standby offset was misread in Phase 0.**  The QPC stamps stayed
   honest.  After wake Windows delivers the slept span as a burst of stale
   silence holding 1.69 s fewer frames than its stamps cover.  So D1 (stamps)
   finds it, and D2 is only a defence.  The pipeline drops that burst, so the
   span is recorded as asleep and not as silence.  Contract F11, D2 and T3 need
   updating (owner-approved folder, not changed here).
2. **A reader-only stall lost meeting audio.**  The 3.98 s loss differs from F4,
   where the app track lost nothing in real whole-process stalls.  The hook
   stops one thread, so it may not match F4; process loopback also cannot take
   a longer buffer.  Re-measure under real load (Q11).
3. The time-loss hook moves stamps backward, which real loss does not, so that
   case also logs a stamp discontinuity.  The replay above is the better check.
4. D7's all-zero branch is not used on Windows.  Mic revocation is read from the
   `ConsentStore` registry values (read only) at 1 Hz.
5. **A process loopback stream can die silently.**  After a Windows Audio
   restart it kept delivering silence with no error and never heard the target
   again.  The helper now watches the Audiosrv PID and reopens both tracks.
6. **The No Air 3 hands-free mic loses real audio here.**  In `bt-call-mode` it
   lost about 21.8 s of 30 s, as in the Phase 0 `input-switch` starvation.  The
   gaps are marked, and flags came with them, so splitting on every flag stays.
   The app should warn strongly on hands-free mics.
7. Hands-free stamps jitter by up to 16 ms with no loss.  A 2 ms tolerance split
   105 s into 6725 chunks, so hands-free uses 20 ms measured against the chunk
   end, which also stops small losses adding up unseen.
8. The mic was all-zero for about 12 s after wake, until around sign-in.  It is
   recorded as audio, not a gap; only `allZero` shows it.
9. A picked or restarted mic retries every 5 s, which costs up to about 5 s of
   mic audio on a disconnect or service restart.  A shorter retry is worth
   testing.
10. **The mic followed a default change about 12 minutes late in the long run.**
    Windows showed the built-in mic by 21:39:32 at the latest; the helper moved at
    21:50:27, after 13.7 min on the headset in all.  The cause is not known: the
    helper does not log default-change notices, so repeated notices re-arming the
    5 s debounce and a missed notice both remain possible.  `defaultNotice` (each
    Windows notice, its role and device, `armed` if a debounce was pending,
    `queuedMs` on the control thread) and `defaultApplied` (`moved`, `sameDevice`,
    `streamClosed`, `unresolved` or `suggested`) now log this for the next run.
    Both fired in a real switch each way (`results/default-notice-log.txt`): the
    mic moved 5.03 s and 5.02 s after the first notice, so the delay did not come
    back and its cause is still not known.
11. Offset cannot be read from the size of the difference between chunk starts.
    Any gap ends a chunk early and moves that track's grid, so the difference
    ranges up to a chunk length.  `long_run.mjs` now follows it only across plain
    rollovers.
12. The long run's timeline overlaps are stamp jitter within tolerance, not a
    fault.  `chunks.log` records an overlap only past the gap tolerance, as with
    gaps: 2 ms, or 20 ms on hands-free (finding 7).  All 1547 on the headset were
    within 20 ms (worst 19.2 ms).  On the built-in mic 1275 were within 2 ms (worst
    1.15 ms), and the 4 past it (worst 6.4 ms) were logged.  They net -954.7 ms of
    timeline; no frames are repeated by this.

## Needs a Planner plan

The process requires one and the tool was unavailable: Windows capture adapter,
crash-safe chunks and recovery (`.tmp` salvage is not built), pause/resume.
