### A-396 — 2026-11-14 — Claude Code — Shell quoting slips during icon work

- **Status / attribution:** Confirmed agent error; no application defect.
- **What failed:** An unquoted heredoc containing `${...}` raised a shell "bad substitution", and a `rm` built from shell variables was blocked by the safety check; a script edit also failed on a stale text anchor.
- **Impact:** A few failed commands and reruns; no output or repository effect.
- **Correction / remaining risk:** Quote heredocs (`<<'E'`), pass paths through environment variables, remove files by explicit name, and match edit anchors against the current text. None.
