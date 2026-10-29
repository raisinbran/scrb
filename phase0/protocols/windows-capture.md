# Windows Capture Protocol

## Purpose

Measure whether Windows 11 can capture one meeting application's process tree
and the microphone as separate synchronized tracks without an app plugin.

## Preconditions

- Record the Windows build, CPU, memory, GPU, audio devices, meeting app, and
  tested source commit.
- Use a meeting-app process that owns an active render stream.  Play a timed
  sync signal through that app and speak or play the paired mic signal.
- Keep unrelated system audio active during the isolation test so leakage is
  detectable.

## Runs

1. Capture the selected process tree for 60 seconds with the Microsoft
   ApplicationLoopback probe while independently capturing the selected mic.
2. Confirm the meeting track contains the selected process and excludes the
   unrelated source.
3. Measure initial offset and drift from the paired sync signals.
4. Repeat after an output-device change, a mic-device change, sleep/wake, and a
   Bluetooth headset switch.
5. Run a long capture, crash the transcription worker, and confirm both capture
   streams continue writing.
6. Force-stop the capture host and record the exact recoverable endpoint.

## Required Results

- No silent loss.  Every detected gap is reported with start and duration.
- Meeting and mic tracks remain separate.
- Drift is under 100 ms over eight hours.
- Capture continues after the AI worker exits.
- CPU during recording without transcription averages below 10%.

