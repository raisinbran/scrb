### A-368 — 2026-11-14 — Codex / Mac desktop — nested transcription lock hit peer-resolution conflict
- **Status / attribution:** Confirmed agent command error; no application defect.
- **What failed:** Refreshing the transcription package's standalone lock without legacy peer resolution failed with `ERESOLVE`; npm reconciled the nested lock against the root Vitest/Vite peer set.
- **Impact:** The nested lock stayed unchanged; root workspace resolution and all requested tests had already succeeded.
- **Correction / remaining risk:** Retried with legacy peer resolution for the standalone lock only, preserving its existing dependency graph except the requested Node typings entry. Low.
