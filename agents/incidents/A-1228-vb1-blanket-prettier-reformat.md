### A-1228 — 2026-11-27 — Claude — V-b1: blanket formatter run touched unrelated files

- **Agent:** Claude (Sonnet 5.5, Windows desktop)
- **Status/attribution:** Confirmed self-induced scope error, caught before commit.
- **What happened:** I ran the formatter over the whole `packages/transcription/src` folder instead of the files I had changed. It rewrote about 20 unrelated source files and one outline eval file.
- **Impact:** None in the repository: I noticed in `git status`, reverted every unrelated file with `git checkout` before any commit, and re-checked that only intended files remain modified. A few minutes of work wasted.
- **Correction:** Unrelated files restored; diff limited to the slice.
- **Preventive step:** Pass explicit file paths to the formatter.
