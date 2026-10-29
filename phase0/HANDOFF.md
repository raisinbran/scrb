# Phase 0 Handoff

Last updated: 2026-10-29 (Claude Code, Windows PC #1; macOS run added the same
night on the owner's Apple M5).  This folder mirrors the
Phase 0 scratch repository (originally
`C:\Users\brand\Documents\ChatGPT\Self-correcting Meeting Transcriber` on
Windows PC #1, which is offline for up to a week from 2026-10-29).  Continue
from here, not from that path.

Phase 0 is throwaway feasibility work, exempt from Planner and comment review.
**Phase 1 (production code) stays blocked until Gate 0 passes and the owner
approves the framework choice.**  The plan documents are in `../dev-plan/`.

## Where things stand

Read `evidence/gate-0.md` first; it holds every measurement.  In short:

| Gate 0 item | Windows | macOS |
| --- | --- | --- |
| Per-app capture isolation | Pass (Codex) | Pass (135 dB rejection) |
| Synced dual-track capture | 60 min and 8 h pass with per-chunk timestamps; mic loses audio during heavy-load stalls (see evidence) | 60 min: sync within 0.03 ms, but ~2 Core Audio stalls/hour on both tracks under CPU-saturating load; 8 h not run |
| Survives crashed AI worker | Pass (120 whisper runs, 16 killed, 0 app-track gaps) | Survives all kills (363 runs, 36 killed); load stalls are separate |
| Models fit 6 GB recording budget | Pass on measured parts (see evidence) | Pass (~1.1--1.5 GiB) |
| Live diarization usable | Usable (~25--29% DER, incremental mode) | Same (~26--32% DER) |
| Device change / sleep-wake / Bluetooth | **Not run** (needs a person at the machine) | **Not run** |
| Framework | Electron (Meetily fails rule 1); owner approval pending | n/a |

Also measured on Windows (CPU and RTX 3080 GPU): Opus storage, vocabulary
hints, whisper accuracy, live delay and final-pass time on AMI, the
summary-model comparison, and a provisional voice-match confidence line.
The proposed answers to the plan's open items are in the "Recommendations"
table of `evidence/gate-0.md`.

## Resume on any machine

```bash
git clone https://github.com/raisinbran/scrb && cd scrb/phase0
scripts/fetch-phase0-deps.sh asr          # whisper models + VAD (~0.8 GB)
scripts/fetch-phase0-deps.sh diarization  # sherpa-onnx models (+ Windows binaries)
scripts/fetch-phase0-deps.sh ami          # AMI fixtures (~150 MB)
scripts/fetch-phase0-deps.sh upstream     # pinned source clones
scripts/fetch-phase0-deps.sh summary      # LLMs, ~16 GB, only if rerunning summaries
```

See `MANIFEST.md` for exact versions and hashes.

## Next steps, in order

1. **macOS remaining runs** (`probes/macos-dual-capture/README.md`).  Start
   capture runs from **Terminal.app** with System Audio Recording granted to
   Terminal; runs started by Claude Code get a silent app track (see the
   permission finding in `evidence/gate-0.md`).
   - 8 h drift run: needs 8 unbroken awake hours on AC, lid open.
   - Device cases: output switch, input switch, Bluetooth headset,
     sleep/wake; record what the probe reports.
   - Re-run the 60 min stress with a Metal worker (drop `-ng` in
     `scripts/run-macos-dual-capture-stress.sh`) and, if stalls remain,
     with the worker under `taskpolicy -c utility`.
2. **Windows device cases** (another Windows PC is fine): output-device switch,
   mic switch, Bluetooth headset, sleep/wake while
   `probes/windows-dual-capture/DualCapture.exe` runs.  The probe currently
   has no device-change recovery; record what happens.  That is the finding
   Phase 2's adapter must handle.
3. Owner decisions listed at the end of `evidence/gate-0.md`, then the Gate 0
   decision.

macOS build notes: no Homebrew on the Mac; CMake and Ninja come from
`python3 -m venv tools/venv && tools/venv/bin/pip install cmake ninja`.
Metal benchmarks rerun with `scripts/run-macos-benchmarks.sh` (resumable).

## Conventions

- Each probe has a `build.cmd` (Windows, MSVC at `C:\BuildTools`; adjust the
  `vcvars64.bat` path on another PC).
- Python scripts run with `python -I`; they use only the standard library.
- Before asking the owner to approve any task expected to run over an hour,
  give an ETA and say whether it splits into resumable pieces.
- Keep this folder synced to GitHub before any machine goes offline.
