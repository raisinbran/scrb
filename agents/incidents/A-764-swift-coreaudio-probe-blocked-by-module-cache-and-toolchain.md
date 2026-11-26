### A-764 — 2026-11-17 — Codex / MacBook Air M5 — Swift CoreAudio probe could not compile in the shell environment

- **Status / attribution:** Confirmed diagnostic setup failure; no product defect.
- **What failed:** A read-only Swift CoreAudio probe could not build because the shell sandbox denied writes to the default Clang module cache, and the active Swift compiler did not match the installed SDK module version.
- **Impact:** One probe attempt failed before execution. No repository or app files changed.
- **Correction / remaining risk:** Reimplemented the same read-only enumeration using a temporary C program linked directly to CoreAudio. The in-sandbox query returned zero devices; the same executable outside the shell sandbox enumerated seven. Low.
