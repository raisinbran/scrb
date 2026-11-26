### A-1186 — 2026-11-17 — Codex / MacBook Air M5 — shell sandbox denied offline speech generation
- **Agent:** Codex (Mac)

- **Status / attribution:** Confirmed execution-boundary failure; no product defect.
- **What failed:** The sandbox denied `/usr/bin/say` access, leaving the first temporary speech outputs at zero duration.
- **Impact:** No recording was started and no app or permission was changed.
- **Correction / remaining risk:** Regenerated the two invented voice clips in the disposable test directory outside the shell sandbox; both duration checks passed. Low.
