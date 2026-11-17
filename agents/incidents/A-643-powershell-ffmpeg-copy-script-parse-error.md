### A-643 — 2026-11-16 — Codex / BCHEN-W10 — PowerShell parser rejected FFmpeg copy command

- **Effect:** The local copy of the verified FFmpeg pair into the isolated build area did not run; no files were copied or overwritten.
- **Evidence:** PowerShell reported `Unexpected token '}' in expression or statement` while parsing the command.
- **Cause:** I included an extra closing brace in the command's nested `foreach` blocks.
- **Correction:** Split the copy and runtime inventory into simple, separately parsed commands.
- **Remaining risk:** Recheck copied FFmpeg hashes before staging.
