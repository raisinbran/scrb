### A-518 — 2026-11-15 — Codex / Mac local — syntax check omitted the repository Node path

- **Status / attribution:** Confirmed agent error; no application defect.
- **What failed:** The first shell syntax-check command invoked `node` from the interactive shell's default `PATH`, where it was unavailable. The command chain still ran `bash -n`, but the Node check did not run.
- **Agent-controlled cause:** I did not use the repository's documented Node path or the wrapper's PATH setup for the focused check.
- **Correction / remaining risk:** Reran `node --check` with `~/.local/share/scrb-node/current/bin/node`; it passed before packaging. No files were changed by the failed command. Low.
