# Windows capture adapter: handoff

Branch `windows-capture`, cut from 3fc9931.  State and results: `README.md`.

Remaining:

1. Owner-at-PC cases in `README.md` ("Not run"), each through
   `scripts/run-case.ps1`, 150 s or so, with numbered steps and clock times.
   Windows Audio restart: the owner runs `Restart-Service Audiosrv -Force`
   from an admin terminal; add a default-debounce test at the same time.
2. Update the README table, push, report to "macOS selfcorrecting mtg
   transcriber": branch tip, unverified items, contract changes from the
   README findings.

Notes: run `build.cmd` by absolute path from PowerShell (through Bash it
silently does nothing).  `Mute.exe` and `TonePlayer.exe` are built in
`phase0/probes` and ignored by git.  Use the Write tool for source files.
