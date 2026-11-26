### A-1183 — 2026-11-17 — Codex / Mac — fixture metadata command assumed ffprobe on PATH
- **Agent:** Codex (Mac)
- **Status / attribution:** Confirmed agent error; no product defect.
- **What failed:** The first committed-fixture metadata check invoked `ffprobe` from the shell PATH, where it was not installed.
- **Impact:** Two metadata probes did not run; no media content was played or changed.
- **Correction / remaining risk:** Used the system `file` metadata for the tracked fixtures and found the packaged `ffprobe` under Scribe's resources. Low.
