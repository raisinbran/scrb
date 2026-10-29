# macOS dual-track capture probe

Phase 0 throwaway probe for the Apple Silicon run.  It mirrors
`probes/windows-dual-capture`: one Core Audio process tap over the target
process tree plus the default input device, each written as a separate mono
16-bit WAV at the device rate, with a timing CSV and summary JSON in the same
shape so `scripts/analyze_alignment.py` works unchanged.

**Status: compiled and run on an Apple M5 (macOS 27.0.1, Swift 6.4) on
2026-10-29 with no API fixes.**  Results are in `evidence/gate-0.md`
("Apple Silicon Machine").  The IOProcs run on the HAL real-time IO thread
(a nil dispatch queue); the first version used a shared GCD queue, which
missed IO deadlines under full CPU load.

## Requirements

- Apple Silicon Mac, macOS 14.2 or newer (process taps), Xcode command-line tools.
- Run from Terminal.app.  System Settings > Privacy & Security > Screen &
  System Audio Recording > System Audio Recording Only must list Terminal.
  **Without it the tap still delivers packets on time but every sample is
  zero; there is no error and no prompt** (coreaudiod logs "Client is not
  granted access to the tap").  Check the app-track peak, not just the exit
  code.  Processes started by Claude Code are attributed to its bundled
  helper (`com.anthropic.claude-code`), not to Terminal or the Claude app, so
  their app track is silent unless that helper is granted access.

## Build and run

```bash
swiftc -O DualCapture.swift -o DualCapture
```

```bash
./DualCapture <meeting-app-pid> ./out/run1 60
```

Find the meeting app's PID with `pgrep -x zoom.us` / `pgrep -x "Microsoft Teams"`
or `pgrep -f "Google Chrome"` (the tap includes the process tree, so pass the
browser's main process).

## Gate 0 runs (same as Windows)

1. 60 s isolation: `scripts/run-macos-isolation.sh` (mutes the speakers,
   which does not affect the tap, and prints PASS/FAIL).
2. 60 min with whisper.cpp started and force-killed every 30 s:
   `TONE_VOLUME=0 scripts/run-macos-dual-capture-stress.sh 3600 30 <name>`
   (`WORKER_THREADS` sets the worker's thread count; default every physical
   core).  afplay applies its volume in-process, so `TONE_VOLUME=0` makes the
   app track silent; use it for timing-only runs.
3. 8 h drift run with the Mac on power; analyze with
   `python3 -I scripts/analyze_alignment.py out/eight-hour-timing.csv 5`.
4. Device cases: switch output device, switch input device, Bluetooth headset,
   sleep/wake — record what the probe reports (it stops or errors are both
   findings; the production adapter must recover).

Copy the `-summary.json`, `-timing.csv` and stdout of each run into
`artifacts/capture/macos/` and record them in `evidence/gate-0.md`.
