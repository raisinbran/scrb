# macOS dual-track capture probe

Phase 0 throwaway probe for the Apple Silicon run.  It mirrors
`probes/windows-dual-capture`: one Core Audio process tap over the target
process tree plus the default input device, each written as a separate mono
16-bit WAV at the device rate, with a timing CSV and summary JSON in the same
shape so `scripts/analyze_alignment.py` works unchanged.

**Status: written on Windows, not yet compiled or run.**  Expect small API
fixes on first build (Core Audio tap Swift overlays have changed between SDKs).

## Requirements

- Apple Silicon Mac, macOS 14.2 or newer (process taps), Xcode command-line tools.
- Run from Terminal.  The first run prompts for microphone access and for
  system-audio recording; grant both to Terminal, then rerun.

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

1. 60 s isolation: target app plays a tone, an unrelated app plays another;
   check the app track contains only the target (`scripts/analyze-tone.ps1`
   logic, or any spectrum tool).
2. 60 min with whisper.cpp started and force-killed every 30 s
   (port `scripts/run-dual-capture-stress.ps1`); expect zero app-track
   discontinuities and capture CPU well under 10%.
3. 8 h drift run with the Mac on power; analyze with
   `python3 -I scripts/analyze_alignment.py out/eight-hour-timing.csv 5`.
4. Device cases: switch output device, switch input device, Bluetooth headset,
   sleep/wake — record what the probe reports (it stops or errors are both
   findings; the production adapter must recover).

Copy the `-summary.json`, `-timing.csv` and stdout of each run into
`artifacts/capture/macos/` and record them in `evidence/gate-0.md`.
