### A-640 — 2026-11-16 — Codex desktop — malformed revision lookup command
- **Status / attribution:** Confirmed agent error; no product defect.
- **What failed:** `git rev-parse --short HEAD origin/main` treated the revision arguments incorrectly and exited with an error.
- **Impact:** One failed read-only lookup; no repository data changed.
- **Correction / remaining risk:** Queried each ref with `git rev-parse --verify --short=7` separately. Low.
