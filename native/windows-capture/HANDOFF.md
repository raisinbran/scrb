# Windows capture adapter: handoff

Branch `windows-capture`, cut from 3fc9931.  State and results: `README.md`.

Remaining for this phase: nothing on this PC.  Still needed elsewhere:

1. Real Teams, Zoom and browser targets with a shared-sound offset and drift check.
   The 4 h run with load is done; see `README.md`.  Full T19 and the 8 h run come
   before Gate 8.
2. Windows Audio restart with whole-computer capture; a shorter mic retry
   (README finding 9).
3. Contract updates from the README findings: F11, D2 and T3, Q10, and the new
   process loopback silent death.

4. The app's own gap on Windows: `BROWSERS` in `apps/desktop/src/main/sources.ts`
   lists Mac IDs only.

Notes: `pause_case.mjs` and `crash_case.mjs` run with plain `node`;
`restart_case.mjs` needs `--experimental-strip-types`.  `TonePlayer.exe` is muted
in the Volume Mixer here, so set `SCRB_TONE` to a copy elsewhere (README, "Worker
restart").  Run
`build.cmd` by absolute path from PowerShell (through Bash it
silently does nothing).  `Mute.exe` and `TonePlayer.exe` are built in
`phase0/probes` and ignored by git.  Use the Write tool for source files.  Hand-run
cases pass `-Actions` to `scripts/run-case.ps1`, which opens the countdown.
