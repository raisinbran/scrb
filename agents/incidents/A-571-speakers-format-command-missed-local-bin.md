### A-571 — 2026-11-16 — Codex / model and effort unavailable / Mac desktop — Speaker layout follow-up

- The first formatting command invoked `prettier` directly but did not add the worktree-local `.bin` directory to `PATH`, so the shell could not find the executable; no file was changed.
- Retry with the repository's `npm exec prettier` command, then continue the focused tests.
