### A-808 — 2026-11-18 — Codex Desktop / MacBook Air M5 — Prettier was asked to format a shell script

- **Status / attribution:** Confirmed validation-command error; no source change from the failed formatter call.
- **What failed:** The first formatting command passed `scripts/package-mac.sh` to Prettier, which has no inferred parser for that shell file.
- **Impact:** The combined validation command stopped before tests ran.
- **Correction / remaining risk:** Run Prettier only on supported source files and validate the packaging shell script with `bash -n`. Low.
