### A-648 — 2026-11-16 — Codex / BCHEN-W10 — staged smoke wrapper discarded successful stderr

- **Effect:** The initial staged smoke reported `whisper-server.exe` as failed after all six tools and DLLs had been copied; its help output was not captured.
- **Evidence:** The staging command reported exit code 0 with empty captured text. Running the same tool directly showed its usage text on stderr.
- **Cause:** The success path used `execFileSync`'s stdout return value and ignored the separately piped stderr stream.
- **Correction:** Use `spawnSync` and combine both output streams while retaining the exit status; verify the current staged files without overwriting them.
- **Remaining risk:** Run all six probes with PATH limited to System32 and confirm the full dependency closure.
