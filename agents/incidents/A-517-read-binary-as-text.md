### A-517 — 2026-11-15 — Codex / Mac desktop — attempted to read a Mach-O tool as text
- **Status / attribution:** Confirmed agent command error. No files were changed.
- **What failed:** A text-reading command was run on the compiled `pde-gh-write` executable while investigating its command behavior, producing binary output instead of useful source text.
- **Impact:** The tool output was noisy and consumed investigation time; no executable or repository state changed.
- **Correction / remaining risk:** Stopped reading the binary and used its bounded `strings` output and documented usage instead. Low.
