# macOS Capture Protocol

## Purpose

Measure process-tap capture plus the microphone as separate synchronized tracks
on an Apple Silicon Mac running macOS 14.2 or newer.

## Runs

Use the same timed sync signal, leakage source, device-change, sleep/wake,
Bluetooth, worker-crash, forced-stop, and eight-hour procedures defined for the
Windows run.  Record the exact macOS version, Mac model, audio devices, source
commit, permission prompts, and whether the tap is process-specific or global.

## Required Results

The Windows thresholds apply unchanged.  A global Core Audio tap does not pass
the selected-meeting-app requirement.

