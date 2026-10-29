# Phase 0 Windows Handoff

Created: 2026-10-29, from the Mac session.  This file covers **only the
Windows tasks** left in Gate 0.  The Windows machine runs them, commits the
results and pushes; the Mac session (or whoever holds `HANDOFF.md`) then folds
them into `evidence/gate-0.md` and the gate checklist.

Windows PC #1 may be offline for up to a week from 2026-10-29, so any Windows 10/11 PC with
speakers or headphones, a mic, and ideally a Bluetooth headset will do.

## What is already done on Windows (do not rerun)

Isolation, the 60-minute crash-worker stress run, the 8-hour drift run, model
memory, whisper/diarization/summary benchmarks.  All are in
`evidence/gate-0.md` ("Windows Machine").  The open Windows checklist item is:

> Synced dual-track capture works on Windows. ... device-change, sleep/wake
> and Bluetooth cases not run.

## Setup

```bash
git clone https://github.com/raisinbran/scrb && cd scrb/phase0
```

Only the probes are needed; no models or AMI data.  From a "x64 Native Tools
Command Prompt" (or edit the `vcvars64.bat` path in `build.cmd`):

```bat
probes\windows-dual-capture\build.cmd
cd probes\windows-tone-player
cl /nologo /EHsc /O2 TonePlayer.cpp
```

`DualCapture.exe <pid> <out-prefix> <seconds> [mic|nomic]` captures that
process tree plus the **default communications** mic, and writes
`<prefix>-app.wav`, `<prefix>-mic.wav`, `<prefix>-timing.csv` and
`<prefix>-summary.json`.  `TonePlayer.exe <freq> <seconds> <delay>` plays a
pulsing tone through the default output.  Keep the volume low; the tone is
audible.

## Tasks

The probe has **no device-change recovery**.  The point is to record what
happens, not to make it pass: that behaviour is what the Phase 2 adapter
must handle.  Run from `phase0\`.  For each case, in a fresh output prefix under
`artifacts/capture/devices/`:

```bat
mkdir artifacts\capture\devices 2>nul
start "" probes\windows-tone-player\TonePlayer.exe 880 400 1
rem note the TonePlayer PID (Task Manager or: tasklist /fi "imagename eq TonePlayer.exe")
probes\windows-dual-capture\DualCapture.exe <pid> artifacts\capture\devices\<case> 300
```

Talk into the mic now and then so the mic track has content.  Do the action
at about 60 s and note the wall-clock time.

| Case | Action at ~60 s |
| --- | --- |
| `output-switch` | Change the default output device (e.g. speakers to headphones) in the sound flyout. |
| `input-switch` | Change the default communications mic. |
| `bt-connect` | Start on wired/built-in devices, then connect a Bluetooth headset (it usually becomes default output and communications mic). |
| `bt-disconnect` | Start on the Bluetooth headset, then turn the headset off. |
| `bt-call-mode` | With the headset as output, open its mic so it switches from stereo to hands-free profile, then back. |
| `sleep-wake` | Start / Sleep, wake after ~30 s.  Note: the probe holds `ES_SYSTEM_REQUIRED`, which blocks idle sleep only, not a manual sleep. |
| `mic-unplug` | (if a USB mic is available) Unplug it mid-run, replug after ~30 s. |

For each case, record in the table below:

- whether `DualCapture.exe` kept running, exited, or hung (and its exit code /
  any HRESULT printed to stderr);
- each track's `discontinuities` and padded time from `<case>-summary.json`;
- whether the app track still carries the tone after the change (listen to
  the WAV, or `powershell -File scripts\analyze-tone.ps1 -Path <case>-app.wav`), and whether the mic track still
  carries your voice;
- whether the mic track followed the new default device or stayed on the old
  one (or went silent).

## Report back

1. Fill in this table here and commit it together with the
   `artifacts/capture/devices/*-summary.json`, `*-timing.csv` and
   `*.stdout.txt`/`*.stderr.txt` files (not the WAVs):

   | Case | Probe kept running? | App track after change | Mic track after change | Discontinuities app / mic | Notes |
   | --- | --- | --- | --- | --- | --- |
   | output-switch | | | | | |
   | input-switch | | | | | |
   | bt-connect | | | | | |
   | bt-disconnect | | | | | |
   | bt-call-mode | | | | | |
   | sleep-wake | | | | | |
   | mic-unplug | | | | | |

2. Write the PC's model, Windows version and the devices used under this
   line:

   Machine: _

3. Commit as `phase0: record Windows device-state cases` and push to `main`.
   Do **not** edit `evidence/gate-0.md` or `HANDOFF.md`; the Mac session
   merges the findings to avoid conflicts.
