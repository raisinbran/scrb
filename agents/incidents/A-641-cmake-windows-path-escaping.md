### A-641 — 2026-11-16 — Codex / BCHEN-W10 — Windows paths escaped in temporary CMake project

- **Effect:** The first minimal CMake configure for `scrb-sherpa.exe` failed before compiling; no executable was produced and tracked source remained unchanged.
- **Evidence:** CMake reported a missing source and leading/trailing whitespace in the link item after interpreting backslashes in quoted Windows paths.
- **Cause:** I used a PowerShell string replacement for two backslashes, leaving single Windows separators in CMake quoted arguments, where CMake treated them as escapes.
- **Correction:** Generate forward-slash absolute paths and use CMake bracket arguments so paths are passed literally.
- **Remaining risk:** Verify the successful executable against the official release DLLs and the staged dependency audit.
