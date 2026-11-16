### A-598 — 2026-11-16 — Codex / model and effort unavailable / Mac desktop — tooltip viewport correction

- Final code inspection found that the new resize handler called tooltip placement unconditionally, which could open a tooltip after window resize even with no hover or focus.
- Restricted resize repositioning to an already-open tooltip and added a regression test that keeps a closed tooltip closed during resize.
- Rerun focused UI tests, Electron regressions, and required checks before publication.
