# Windows capture adapter: handoff

## Phase 3 live PCM integration

The optional Windows feed is implemented on
`rosmont/phase3-windows-native-feed-20261101`. Launch the helper with
`--live-pipe \\.\pipe\NAME` after the application creates a byte-mode named-pipe
server. Decode the stream with `PcmFrameDecoder` and offer each frame to one new
`LiveAudioWorker` for that helper process. A helper restart requires a new pipe,
decoder and worker because native sequences and generations restart.

The pipe is live-only. EOF, broken pipe, backpressure and worker failure must
close the decoder/worker without stopping the helper or durable writer. Stop
the native input first, let the helper flush its converter tail and boundary,
then close the worker independently. The helper never waits for the reader.

Windows verification uses `LivePcmTests.exe` plus
`scripts/live_worker_acceptance.mjs`. The acceptance script starts the real PR
#23 supervisor and dispatcher with an invented local timed-word model host. It
does not establish Whisper/VAD model quality because approved Windows model
executables are absent. No macOS implementation, UI or shared interface changes
belong in this branch.

Branch `windows-capture`, cut from 3fc9931.  State and results: `README.md`.

Remaining for this phase: nothing on this PC.  Still needed elsewhere:

1. T18 passed on whole-computer capture (README finding 16), but the Teams process
   target records silence (BUG-1, `docs/bug-tracker.md`).  The fix is built here
   (README finding 18), and passed a real Teams call from the app's picker with
   drift -1 ms (`results/t18-picker.txt`).  Zoom and browser targets are unrun.
   The 4 h run with load is done; see `README.md`.  Full T19 and the 8 h run come
   before Gate 8.
2. The 4 h rerun on the built-in mic is done (2026-10-31): 1.221 s mic loss, with
   the owner's exception for an 18.8 min hibernate on critical battery.  It counts
   with the 10-30 run for Gate 2 (owner decision, 2026-11-01).  See `README.md`.
   BUG-2 is built, not merged: `results/first-chunk-gap.txt`.
3. T23 and T24 pass after fixes (README findings 14 and 15).  Meeting audio in a
   stall is still lost, now marked; T24 still needs a real device change once a
   second device is here.
4. Updates to `phase0-archive:phase0/design/capture-contract-draft.md` from the README findings:
   F11, D2 and T3, Q10, and the new process loopback silent death.  These do not
   touch `packages/contracts/`.

Notes: `pause_case.mjs` and `crash_case.mjs` run with plain `node`;
`restart_case.mjs` needs `--experimental-strip-types`.  `TonePlayer.exe` is muted
in the Volume Mixer here, so set `SCRB_TONE` to a copy elsewhere (README, "Worker
restart").  Run
`build.cmd` by absolute path from PowerShell (through Bash it
silently does nothing).  `Mute.exe` and `TonePlayer.exe` are built in
`native/windows-capture/tools/windows-mute` and `.../windows-tone-player` and ignored by git.  Use the Write tool for source files.  Hand-run
cases pass `-Actions` to `scripts/run-case.ps1`, which opens the countdown.
