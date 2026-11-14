### A-386 — 2026-11-14 — Codex — Final status summary script referenced an unavailable binding

- **Status / attribution:** Confirmed agent error; no application defect.
- **What failed:** My final status query script referenced the module-level `arguments` binding, which is undefined in that runtime; the command returned a `ReferenceError` after the quota read had succeeded.
- **Impact:** One failed summary command; no repository or user-data effect.
- **Correction / remaining risk:** Re-query PR head and draft status with direct GitHub calls. None.
