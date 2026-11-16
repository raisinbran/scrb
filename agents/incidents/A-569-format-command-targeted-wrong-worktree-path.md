### A-569 — 2026-11-16 — Codex / model and effort unavailable / Mac desktop — Settings UI follow-up

- A formatting command ran from the Settings worktree but included an Electron test file that exists only in the separate Speakers worktree. Prettier reported that the path did not match any files; no source file was changed by the failed command.
- Corrected the command to format only files present in this worktree, and will format the Speakers test from its own worktree.
