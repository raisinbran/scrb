### A-654 — 2026-11-16 — Codex / BCHEN-W10 — Incorrect Whisper build-output path in staging retry

- **Observed effect:** The staging script rejected the second attempt because the preflight used `build/win-whisper-284029c/bin`; the executables are in its `bin/Release` subfolder.
- **Evidence:** The script reported the missing `whisper-cli.exe` path. A targeted search located `whisper-cli.exe` and `whisper.dll` under `build/win-whisper-284029c/bin/Release`.
- **Attribution:** Agent setup/path assumption; no project defect.
- **Correction:** Use the discovered Release directory for the Whisper binaries and their DLLs.
- **Remaining risk:** The script-created output folder is empty; the preserved prior staging folder remains intact.
