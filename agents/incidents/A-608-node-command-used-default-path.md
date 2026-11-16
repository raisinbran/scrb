### A-608 — 2026-11-16 — Codex / model and effort unavailable / Mac desktop — checking the worktree toolchain

- The first version checks invoked `node` and `npm` without the Mac-specific Node path documented in `AGENTS.md`; the shell could not find either command, so no check started.
- Retried through `/Users/brandonchen/.local/share/scrb-node/current/bin` with that directory on `PATH`. No check was lost and no files changed; no remaining risk.
