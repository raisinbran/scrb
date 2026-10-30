# Windows capture adapter: handoff

Branch `windows-capture`, cut from 3fc9931.  State and results: `README.md`.

Remaining for this phase: nothing on this PC.  Still needed elsewhere:

1. Real Teams, Zoom and browser targets, CPU under load, and the 8 h Gate 2 run.
2. Windows Audio restart with whole-computer capture; a shorter mic retry
   (README finding 9).
3. Contract updates from the README findings: F11, D2 and T3, Q10, and the new
   process loopback silent death.

4. The app's own gaps on Windows: `BROWSERS` in `apps/desktop/src/main/sources.ts`
   lists Mac IDs only, and a restarted worker starts its session clock again at 0,
   on both platforms.

Notes: `pause_case.mjs` and `crash_case.mjs` run with plain `node`.  Run
`build.cmd` by absolute path from PowerShell (through Bash it
silently does nothing).  `Mute.exe` and `TonePlayer.exe` are built in
`phase0/probes` and ignored by git.  Use the Write tool for source files.  Hand-run
cases pass `-Actions` to `scripts/run-case.ps1`, which opens the countdown.
