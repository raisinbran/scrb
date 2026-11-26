### A-1175 — 2026-11-25 — Claude Code (Sonnet 5.5) — prettier --write run over the whole agents folder

- **Effect:** reformatted about 130 unrelated register files in the working tree; caught by `git status` before commit and reverted with `git checkout`, so nothing was committed.
- **Evidence:** `git status --short` listed modified historical incident and usage files.
- **Agent:** Claude
- **Attribution:** Claude Code, self-induced (broad path instead of the files I wrote).
- **Correction:** reverted all but my own rows; later formatting limited to named files.
- **Remaining risk:** none.
