### A-1130 — 2026-11-24 — Claude Code — package build failed on missing ignored inputs in a fresh worktree

- **Agent:** Claude (Claude Code, Sonnet 5.5, Mac desktop app)
- **Status:** confirmed; corrected in the same session.
- **What happened:** I copied `packages/transcription/.bin` into the new worktree but not `.work` (ffmpeg source archive), though `write-mac-provenance.mjs` hashes it. The first `package-mac.sh` run failed at the provenance step (ENOENT) after about 8 minutes. I also issued one blocked `sleep` command instead of a wait loop.
- **Impact:** one wasted package build; no data or repository effect. The second run succeeded unchanged.
- **Correction / remaining risk:** check the script's inputs (`.bin`, `.work`) before the first build in a fresh worktree. Low.
