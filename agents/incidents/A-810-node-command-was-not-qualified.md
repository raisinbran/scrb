### A-810 — 2026-11-18 — Codex Desktop / MacBook Air M5 — incident-copy helper used an unqualified Node command

- **Status / attribution:** Confirmed shell invocation error; no target files changed in the failed attempt.
- **What failed:** I ran the local record-copy helper with `node` instead of the configured absolute Node executable. The shell could not find that command.
- **Impact:** The record-copy attempt stopped before it created or modified any file.
- **Correction / remaining risk:** Reran the helper using the configured Node path. Low.
