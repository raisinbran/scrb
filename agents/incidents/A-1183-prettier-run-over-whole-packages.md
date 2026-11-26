### A-1183 — 2026-11-25 — Claude (Sonnet 5.5, Mac) — Prettier run over whole packages reformatted unrelated files

- **Agent:** Claude (Sonnet 5.5, Mac Code session)
- **What failed:** I ran `prettier --write packages` instead of only the files I changed, which rewrote about 60 unrelated files (summary, export, transcription).
- **Impact:** None published: I saw the diff in `git status` before committing and reverted every unrelated file with `git checkout`. Some seconds of owner-visible noise only.
- **Correction / remaining risk:** Format only named files from now on. Low.
