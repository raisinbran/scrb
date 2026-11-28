### A-783 — 2026-11-18 — Codex / MacBook Air M5 — Mac toolchain inventory assumed CMake and Ninja were in /usr/bin

- **Status / attribution:** Confirmed agent path-assumption error; no build was attempted.
- **What failed:** I checked `/usr/bin/cmake` and `/usr/bin/ninja`, but this machine's pinned CMake 4.4.4 and Ninja 1.13.2 are in `~/scrb-dev-assets/tools/venv/bin` as specified by the asset setup.
- **Impact:** The first inventory output falsely suggested those tools were absent from the machine. No files or processes were changed.
- **Correction / remaining risk:** Located the configured venv paths and verified both versions. Low; no packaging readiness claim relied on the incorrect fixed paths.
