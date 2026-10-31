# Windows helper: changes to match the Mac helper

For a Windows session on the `windows-capture` branch, which is unapproved starting code. `native/macos-capture/` is the reference. No `Co-Authored-By` lines in commits.

**Pause, per `docs/plans/pause-resume.md`.** The branch pauses each track with `PostAndWait`, so a slow track can hold the other open. Replace that with one shared gate checked on each capture thread against a single cutoff time, ahead of the encoder and buffers. Whole packets are dropped. Reference: `src/rt.h`.

**Commands.** Every command has an ID, and a repeat returns the first reply. Add `listMics`, `listApps` and `check-lock <path>`. The ack carries `gate` and `activeTracks`; see `CaptureAck` in `packages/capture/src/index.ts`.

**Files, per `docs/plans/crash-safe-chunks.md`.** Recovery in `packages/app-core/src/recovery.ts` reads these exactly:
- `NNNNNN.opus.part` while writing, then renamed. Tags `SEQUENCE`, `START_NS`, `RATE`, `OPEN_REASON`.
- `chunks.log` instead of `index.jsonl`, with `file`, `seq`, `startNs`, `endNs`, `frames`, `rate`, `openReason`, `closeReason`.
- `audio/session.log`, one JSON line each: `open` with `wholeComputer`, then `pause` and `resume` with `seq`, `commandId`, `cause`, `atNs`. Written after the gate moves.
- `audio/writer.lock` held for the whole run.

**Stop during a pause.** `Gate::Close` must move only an open gate. See `rt_gate_close` in `src/rt.h` and `scripts/stop_paused_case.py`.

**Then run,** on the Windows PC: `pause_case.py` and `crash_case.mjs` from `native/macos-capture/scripts/`, adapted, plus the unmerged `app-recording` path with `SCRB_CAPTURE_HELPER` set.

**Done 2026-10-30.** See "Matching the Mac helper" in `native/windows-capture/README.md`.

## Worker restart keeps the timeline

Added 2026-10-30. `native/windows-capture/` was not changed, because a test was running from it. The Mac helper does this; references are `Session.open` and `Session.start` in `native/macos-capture/src/main.swift`. Unit tests cover the app core and recovery. No real run has been done on either machine yet.

The app core already sends and reads these fields, so Windows only has to honour them. Until it does, a restarted Windows worker keeps restarting its clock at 0.

**`start` ack.** Add a top-level `clockOriginNs`: `originNs_`, on the same clock as `NowNs()`. The existing `origin` detail can stay. `NowNs()` must keep running across processes and sleep; check this before relying on it.

**`open` with `clockOriginNs`.** When the field is present:
- Set `originNs_` from it, and do not reset it in `DoStart`. `start` then replies with the current session time in `atNs`, not 0.
- Pass that same origin to each `TrackPipeline`, so new chunks continue the timeline.
- Append `{"event":"restart","atNs":<session time>,"seq":n}` to `audio/session.log`, after the `open` line. Write a newline first, because the killed worker can leave a cut-off line. Do the same for `chunks.log`.
- Open the first chunk with `OPEN_REASON=workerRestarted`.

**Restart during a pause.** The app sends `open`, then later `resume`, and never `start`. So `open` must do everything `DoStart` does except open the gate: pipeline start, generation, `SetThreadExecutionState`. `DoResume` must accept this state. `state_` is `open` at that point, so check that it does not refuse.

**Numbering** already continues through `FirstSeq`. Confirm a dead worker's `.part` counts as taken, and that no chunk file can be replaced. The Mac helper had this bug.

**`session.log` order.** Each worker numbers `seq` from 1. Recovery reads the file in order, so no change is needed.

**Then run** `native/macos-capture/scripts/restart_case.mjs`, adapted: one `audioMissing` gap per track, about the down time, with chunk times continuing.
