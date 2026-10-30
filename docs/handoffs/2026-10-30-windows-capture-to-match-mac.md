# Windows helper: changes to match the Mac helper

For a Windows session on the `windows-capture` branch, which is unapproved starting code. `native/macos-capture/` is the reference. No `Co-Authored-By` lines in commits.

**Pause, per `docs/plans/pause-resume.md`.** The branch pauses each track with `PostAndWait`, so a slow track can hold the other open. Replace that with one shared gate checked on each capture thread against a single cutoff time, ahead of the encoder and buffers. Whole packets are dropped. Reference: `src/rt.h`.

**Commands.** Every command has an ID, and a repeat returns the first reply. Add `listMics`, `listApps` and `check-lock <path>`. The ack carries `gate` and `activeTracks`; see `CaptureAck` in `packages/capture/src/index.ts`.

**Files, per `docs/plans/crash-safe-chunks.md`.** Recovery in `packages/app-core/src/recovery.ts` reads these exactly:
- `NNNNNN.opus.part` while writing, then renamed. Tags `SEQUENCE`, `START_NS`, `RATE`, `OPEN_REASON`.
- `chunks.log` instead of `index.jsonl`, with `file`, `seq`, `startNs`, `endNs`, `frames`, `rate`, `openReason`, `closeReason`.
- `audio/session.log`, one JSON line each: `open` with `wholeComputer`, then `pause` and `resume` with `seq`, `commandId`, `cause`, `atNs`. Written after the gate moves.
- `audio/writer.lock` held for the whole run.

**Then run,** on the Windows PC: `pause_case.py` and `crash_case.mjs` from `native/macos-capture/scripts/`, adapted, plus the unmerged `app-recording` path with `SCRB_CAPTURE_HELPER` set.

**Done 2026-10-30.** See "Matching the Mac helper" in `native/windows-capture/README.md`.
