# scrb-capture (Windows capture adapter)

Status: **in progress.**  Automated cases pass on this PC; the real device
cases have not been rerun.  Design source:
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

One flat JSON object per line on stdin; one JSON object per line on stdout.
Every command may carry `id`, echoed in its `{"type":"ack"}`.  Closing stdin
stops and finalizes the recording.

| Command | Fields | Notes |
| --- | --- | --- |
| `open` | `sessionId`, `outputDir`, `pid` (0 = whole computer), `mic` (`default` or device ID) | Streams open, meters run, nothing written |
| `start` | | Ack carries the session origin |
| `pause`, `resume`, `stop` | | Ack `atNs` gives each track's time |
| `selectMic` | `mic` | Forces a chunk boundary |
| `selectSource` | `pid` | Forces a boundary; also reattaches a restarted app |
| `listMics` | | Ack carries `mics` |
| `quit` | | Stops if needed and exits |
| `inject` | `track`, `fault`, `ms` | Only with `--test-hooks` |

Events (`{"type":"event"}`): `chunkClosed`, `discontinuity`, `streamStalled`,
`streamDead`, `streamReopened`, `deviceChanged`, `rateChanged`, `permissionLost`,
`permissionRestored`, `sleeping`, `woke`, `sourceChanged`, `sourceFallback`,
`micFallback`, `micReturned`, `micSuggestion`, `handsFreeMic`, `clockFault`,
`writeError`, `health`.

Chunks: `<outputDir>/<sessionId>/audio/{microphone,meeting}/NNNNNN.opus` plus
`index.jsonl`.  Added to the contract's fields: `missingBeforeMs`,
`missingCause`, `overlapMs`.

## Owner decisions (2026-10-30)

- Mic "system default" follows `eCommunications` (Q10).
- A picked mic that disappears falls back to the default with a warning; when
  it returns, the app offers to switch back (Q12).
- Target app exits (Q6): warn at once, keep the mic recording, mark the meeting
  track missing; reattach if the same app returns within 2 minutes; otherwise
  auto-pause and offer Resume or Stop.  The adapter reports `sourceChanged` and
  reattaches on `selectSource`; **the timer and auto-pause belong to the app
  core, not built here.**  It never widens to whole-computer on its own.
- A chunk splits on every OS discontinuity flag.

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

Not run (need the owner at the PC):

| Case | Phase 0 failure | Status |
| --- | --- | --- |
| `input-switch` | Mic did not follow default | **Not run** |
| `bt-disconnect` | Mic stopped silently | **Not run** |
| `bt-call-mode` | 1.4 s silence, no flag | **Not run** |
| `sleep-wake` | 1.7 s offset | **Not run on hardware**; replay only |
| `mic-privacy-off` | Mic stopped, never resumed | **Not run** |
| Windows Audio restart | Mac capture died silently | **Not run**: needs an admin terminal; this session is not elevated |

Also unverified: default-device debounce (no test yet), Bluetooth transport
detection, `micFallback`, real Teams/Zoom/browser targets, CPU under load, the
8 h Gate 2 run, and USB unplug (no USB mic).

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

## Needs a Planner plan

The process requires one and the tool was unavailable: Windows capture adapter,
crash-safe chunks and recovery (`.tmp` salvage is not built), pause/resume.
