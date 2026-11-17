### A-639 — 2026-11-16 — Codex / BCHEN-W10 — malformed MSVC object-output argument

- **Effect:** The first local `scrb-sherpa.exe` build attempt failed; no executable was produced and no source was changed.
- **Evidence:** The command output reported `fatal error C1083` and showed the `/Fo` object path absorbing the following `/Fe` option.
- **Cause:** I emitted a quoted `/Fo` directory ending in a backslash through PowerShell and `cmd.exe`; the trailing separator escaped the closing quote in the Windows command-line parse.
- **Correction:** Replace the nested shell invocation with a small CMake target that passes source, include, library and output paths through the Visual Studio generator.
- **Remaining risk:** The retry must still verify that the resulting executable loads its staged DLLs.
