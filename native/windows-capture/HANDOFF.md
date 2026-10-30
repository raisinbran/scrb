# Windows capture adapter: handoff

Status (2026-10-30): **pipeline rules only; no capture helper yet, no device
case run.**  Stopped for the 5-hour allowance (about 93% used; resets 09:30
UTC).  Branch `windows-capture`, cut from origin/main at 3fc9931.  Not pushed:
the owner has not confirmed pushing or a Windows Audio restart.

Done: `.gitignore`, `scripts/fetch-opus.ps1` (libopus 251d657e built static
with `/MT` to `build/opus/opus.lib`; not in git), `src/Common.h`,
`src/TrackPipeline.*`, `tests/PipelineTests.cpp`, `build.cmd` (add the other
files to it).  VS 2022 tools at `C:\BuildTools`; CMake and Ninja are under its
CMake folder, not on PATH.  Run `build.cmd` by absolute path; the shell's
working directory is the repo root.

Tests: synthetic groups pass (T2, T3, T3b, T4, T6, T11, T13, T14).  **One known
failure:** the replay of `sleep-wake-timing.csv` reports 3270 ms missing, not
~1690 ms.  Not diagnosed.  The log has one row per second, so it may be a
replay artifact, or D2 and a stall split may double count; settle this first.

Environment notes:
- Write source with the Write tool, one file per call.  A large Bash heredoc
  fails with ENAMETOOLONG and loses everything in it.
- Only Realtek speakers and mic are connected now, so Bluetooth cases need
  the owner.  `phase0/scripts/run-windows-device-case.ps1` hardcodes
  DualCapture, so add a derived runner in `scripts/` (same TonePlayer + Mute
  flow; TonePlayer.exe and Mute.exe must be built, they are ignored by git).
- Default-device, privacy and sleep actions are owner steps: give numbered
  clicks with clock times.

## Design decided (build this)

Files in `src/`: `Common.h`, `TrackPipeline` (pure rules, no WASAPI, unit
tested), `ChunkStore` (Ogg Opus + `index.jsonl`), `Track` (stream, capture
thread, writer thread, queue), `Session` (control thread, watchdog thread,
device and power notifications), `main.cpp` (JSON lines on stdin/stdout,
EOF = stop and finalize).  `tests/PipelineTests.cpp`, `tests/ChunkVerify.cpp`
(walk Ogg, check CRC, decode, 880 Hz check per chunk).  `build.cmd` uses cl.

- Format: request 48 kHz mono s16 with AUTOCONVERTPCM.  Mic buffer 2 s.
- Capture thread (MMCSS Audio) only copies packets to a queue; the writer
  thread runs the pipeline.  Events go to a stdout thread, so a stuck parent
  cannot block capture.
- Ogg: own page muxer with CRC; 50 packets per page, written each second;
  end trimming by final granule (preskip + frames) with zero frames fed past
  the end, so a decoder returns exactly `frames` and nothing is padded.
  Chunk written `<seq>.opus.tmp`, FlushFileBuffers, then
  MoveFileEx WRITE_THROUGH, then index line with commit.  Folder
  `<session>/audio/microphone|meeting/`.  Tags hold chunk ID, raw stamp, wall.
- D1: packet stamp vs previous stamp + frames, over 2 ms.  Also split on the
  OS discontinuity flag (task says every discontinuity; HFP will make many
  small chunks; flag this for review).  First packet never splits.
- D2 meeting track only.  Baseline = min of first 20 (arrival - stamp), then
  slow EWMA while within 50 ms.  Fire only if over 50 ms and stable within
  20 ms for 250 ms, so a stall's drain burst (deviation falling fast) does
  not fire.  On fire add the deviation to a per-stream stamp correction; if
  the open chunk began after the loss, shift it instead of splitting.
- D3 arrival gap over 500 ms closes the chunk (reason stall), next chunk
  starts from the stamp; watchdog only reports.  D4: device signal
  (INVALIDATED, session disconnect, state change, service not running) at
  once, else 30 s without packets while watchdog ticks were on time.  Reopen
  same device once; a picked mic then falls back to default with a warning;
  retry every 5 s.  Rebuild enumerator and notifier on any death (service
  restart needs it).
- Mic privacy: poll `ConsentStore\microphone` and `NonPackaged` `Value`
  (read only) at 1 Hz: Deny = `permissionLost` at once, close mic; Allow =
  reopen at once.  D7 all-zero branch is macOS only.
- D6: `eCommunications` mic (Q10), 5 s stable debounce; picked mic only gets a
  suggestion event.  Render default change: reopen endpoint loopback, and
  note it for D2b (zero runs of at least 100 ms within 3 s, marked at chunk
  close as `possibly-missing`, no split).
- D8: `PKEY_Device_EnumeratorName` BTHHFENUM or BTHENUM = hands-free warning.
- D9: PowerRegisterSuspendResumeNotification; wait up to 1 s in the callback
  for chunks to close.  Missed notification: QPC minus
  QueryUnbiasedInterruptTime jumped by over 500 ms.  Hold ES_SYSTEM_REQUIRED.
- Endpoint loopback delivers nothing while idle: run a silent render stream
  on the same device, topped up from the capture loop.
- Process loopback activation failure: whole-system fallback with a
  `sourceFallback` warning.  Target exit: `sourceChanged`, never widen to
  whole-system by itself (privacy; owner decision, Q6).
- Fault hooks behind `--test-hooks`: stall reader, stop delivering, skew
  stamps; `--death-limit-ms` shortens D4 for tests.
- Chunk fields beyond the contract: `missingBeforeMs`, `missingCause`,
  `overlapMs`.

## Next steps

1. Write the files above, build, run `PipelineTests` (cases: T2, T3, T3b, T4,
   T6, T13, T14, and replay of `sleep-wake-timing.csv`, expect ~1690 ms).
2. Commit; run baseline, pause, kill, fault-hook cases; then owner cases:
   input-switch, bt-disconnect, bt-call-mode, sleep-wake, mic-privacy-off,
   and a Windows Audio restart once approved.
3. Results table in README.md; report to "macOS selfcorrecting mtg
   transcriber": branch tip, unverified items, owner decisions (Q10, Q12, Q6,
   OS flag splitting, pushing).  Needs a Planner plan once available: Windows
   capture adapter, crash-safe chunks and recovery, pause/resume.
