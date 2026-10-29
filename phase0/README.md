# Meeting Scribe Phase 0 Spikes

This scratch repository contains throwaway feasibility work for Phase 0 of the
Meeting Scribe development plan.  Production code belongs in
`C:\Users\brand\Documents\GitHub\scrb` only after Gate 0 passes.

## Decision Rules

- Use Tauri only if the pinned Meetily fork passes every framework test on
  Windows 11 and Apple Silicon macOS.  Otherwise use Electron.
- Gate 0 requires measured dual-track capture on both machines, survival of a
  crashed AI worker, a native-model stack within the 6 GB budget, usable live
  diarization or an accepted fallback, and a recorded framework choice.
- Source repositories, models, and sample code are pinned by full commit or
  checksum before their results are used.

## Layout

- `evidence/`: machine-readable results and the Gate 0 report.
- `protocols/`: repeatable manual and automated test procedures.
- `scripts/`: non-production benchmark and evidence helpers.
- `upstream/`: pinned upstream source checkouts.  These are not copied into the
  production repository.

## Current Status

See `HANDOFF.md` for where things stand and how to resume, and
`evidence/gate-0.md` for every measurement.  Windows measurements are largely
complete (CPU and RTX 3080 GPU); the Apple Silicon run, Windows device-state
cases, and owner decisions remain before Gate 0 can be approved.
