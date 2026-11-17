### A-640 — 2026-11-16 — Codex / BCHEN-W10 — follow-up batch quoting split sherpa compile arguments

- **Effect:** The second local `scrb-sherpa.exe` build attempt also failed; the compiler produced no executable. Only ignored build-area files were created.
- **Evidence:** `cmd.exe` treated quote fragments and portions of the include/source paths as separate commands; `cl.exe` printed usage and no output binary exists.
- **Cause:** My generated batch file mixed already-quoted absolute paths with `/I` and `/Fo` options across PowerShell and `cmd.exe` parsing layers.
- **Correction:** Stop using nested command-string quoting for this compile and configure a minimal CMake project with the installed Visual Studio generator.
- **Remaining risk:** Verify successful build, runtime dependencies and provenance before staging the sidecar.
