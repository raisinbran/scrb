# scrb-capture (Windows capture adapter)

Status: **device cases rerun on this PC; real meeting apps, load and the 8 h
run are not done.**  Design source:
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
`streamDead`, `streamReopened`, `deviceChanged`, `rateChanged`, `permissionLost`,
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

Not run: Windows Audio restart with whole-computer capture.  Unverified: real
Teams/Zoom/browser targets, CPU under load, the 8 h Gate 2 run, and USB unplug
(no USB mic).

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

## Needs a Planner plan

The process requires one and the tool was unavailable: Windows capture adapter,
crash-safe chunks and recovery (`.tmp` salvage is not built), pause/resume.
