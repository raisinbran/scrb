### A-639 — 2026-11-16 — Codex desktop — reproduction command missed configured Node path
- **Status / attribution:** Confirmed agent error; no product defect.
- **What failed:** The first synthetic reproduction invoked `node` without the configured Scribe Node directory on `PATH` and failed with `command not found`.
- **Impact:** One failed command and a short delay; no repository or user data changed.
- **Correction / remaining risk:** Reran with the configured Node executable; reproduction succeeded. Low.
