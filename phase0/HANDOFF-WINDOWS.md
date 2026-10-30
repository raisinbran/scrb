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
| `mic-privacy-off` | Settings > Privacy & security > Microphone: turn off "Let desktop apps access your microphone", then back on after ~30 s.  Also note any prompt or notification Windows shows. |

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
   | output-switch | Yes, exit 0, HRESULT 0 | Tone continuous through No Air 3 → Realtek speakers switch (+68 s) | Stayed on No Air 3 hands-free mic; near-silent (−80 dBFS, buds on table) | 0 / 1281 | Mic took 2.3 s to open (HFP profile switch). Mic discontinuities ~4/s across the whole run, 1435 gap-fill frames: HFP link jitter, not the switch. |
   | input-switch | Yes, exit 0, HRESULT 0 | Tone continuous | Did **not** follow; stayed on No Air 3 hands-free mic | 0 / 604 | Mic stream badly starved: 7548 packets (vs ~30000), 10.7 M gap-fill frames (~222 s of 298 s), position jumps up to 5.5 s. Before the user's switch (14:47:08) the default comms mic flipped No Air 3 ↔ Realtek on its own every ~4 s for 50 s. |
   | bt-connect | Yes, exit 0, HRESULT 0 | Tone continuous; default output became No Air 3 (A2DP) at +79 s | Stayed on Realtek array, live ambient (≈ −38 dBFS); default comms mic became No Air 3 | 0 / 1 | The 1 mic discontinuity is the first packet (startup), as in every run. |
   | bt-disconnect | Yes, exit 0, HRESULT 0 | Digital silence (−96.7 dBFS) from +73 s to end, 0 discontinuities | **Stopped at +72.9 s**: no packets, no error, no padding; WAV is 73 s long | 0 / 13 | Started with No Air 3 as output and comms mic; buds put in case ~15:12:00; Windows fell back to Realtek. App silence is likely TonePlayer's own render stream dying (it has no device recovery), so loopback-follows-app is inconclusive. Mic loss is silent: probe cannot tell it lost the device. |
   | bt-call-mode | Yes, exit 0, HRESULT 0 | **1.4 s digital silence at +64.6–66.0 s** when the buds entered hands-free, with 0 discontinuities flagged; slight dip only on the return to stereo (+74 s) | Realtek array, live throughout | 0 / 3 | HFP open 14:54:51, back to A2DP 14:55:00 (Windows dropped HFP ~9 s after the Settings level meter, before Settings was closed at ~14:55:30). One mic discontinuity at +66.4 s, the profile switch, although the mic device did not change. |
   | sleep-wake | Yes, exit 0, HRESULT 0 | Arrival gap +68 → +110 s; 41.7 s of silent frames, 0 discontinuities; **track ends 1.69 s short of wall clock** (frame_vs_clock −1690 ms) | Gap-filled 42.0 s (2.0 M frames), 1262 silent-flag packets, stays clock-aligned (−7 ms) | 0 / 8 | Modern Standby (S0ix) 17:39:11–17:39:55. App vs mic now offset by ~1.7 s after resume: sync is broken without a discontinuity on the app side. Probe ran 343 s wall for a 300 s request (its timer skipped standby). A first run without sleep is kept as `sleep-wake-nosleep-*`: fully continuous. |
   | mic-unplug | — | — | — | — | Not run: no USB mic available. |
   | mic-privacy-off | Yes, exit 0, HRESULT 0 (180 s run) | Tone continuous | **Stopped at +95.4 s** (desktop-apps access set to Deny at 20:12:42 = +96 s): no packets, no error, no padding; **did not resume** when access returned at 20:12:58 | 0 / 1 | Realtek array, voice present before the cutoff. Toggle times logged from `HKCU\…\ConsentStore\microphone\NonPackaged`. Same silent-stop failure as bt-disconnect. No Windows prompt or notification recalled by the operator (not certain); no notification sound heard, but the output was muted by the run script, so a sound would not have been audible. A first attempt that toggled the master "Let apps access your microphone" switch instead is kept as `mic-privacy-master-off-*`: identical behaviour (mic stopped at +83.2 s, never resumed, no error). |

   All runs: output muted (the probe still captures at full level; verified with a
   15 s muted test), mic content is room ambient only (voice checks are
   in the second table below).  Device and
   comms-mic changes are logged every 2 s in `<case>.runner.txt` by
   `scripts/run-windows-device-case.ps1` (helper: `probes/windows-mute/Mute.cpp`).

   Takeaways for the Phase 2 adapter: (1) the mic stream never follows a
   default-device change and fails silently when its device disappears or
   mic privacy access is revoked (and does not recover when access returns);
   (2) app-track silence and an app-vs-mic offset can appear with no
   discontinuity flag, so gaps must be found from arrival time and content;
   (3) Bluetooth hands-free capture is lossy and the default comms mic can
   flap on its own, so default-change events need debouncing.

   Voice checks (120 s, no device change, user talking in two windows):

   | Case | Mic | Talking | Quiet | Discontinuities app / mic | Notes |
   | --- | --- | --- | --- | --- | --- |
   | voice-realtek | Microphone Array (Realtek) | −17 to −21 dBFS | ≈ −40 dBFS | 0 / 1 | Voice ~20 dB over room noise. |
   | voice-airpods | Headset (No Air 3), buds worn | −26 to −33 dBFS | ≈ −83 dBFS | 0 / 126 | Strong on-bud noise gating (~50 dB), which explains the −80 dBFS ambient readings above. 126 discontinuities but 0 gap-fill frames: HFP jitter, no loss this run. |

2. Write the PC's model, Windows version and the devices used under this
   line:

   Machine: Dell Precision 7760, Windows 11 Pro for Workstations 26H2
   (10.0.26300), on AC power.  Devices: Speakers + Microphone Array
   (Realtek), AirPods Pro 3 shown in Windows as "No Air 3" (Headphones =
   A2DP, Headset = hands-free).  Built with VS 2022 Build Tools in
   `C:\BuildTools`.

3. Commit as `phase0: record Windows device-state cases` and push to `main`.
   Do **not** edit `evidence/gate-0.md` or `HANDOFF.md`; the Mac session
   merges the findings to avoid conflicts.
