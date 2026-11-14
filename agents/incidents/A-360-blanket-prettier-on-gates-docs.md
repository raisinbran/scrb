### A-360 — 2026-11-14 — Claude Code (Sonnet 5.5) / Mac desktop — formatter run over all of docs/gates rewrote 30 unrelated files

- **Status / attribution:** Confirmed agent error; no application defect.
- **What failed:** I ran Prettier on the whole `docs/gates` folder instead of the two files I had edited, which reformatted about 30 unrelated gate documents and evidence files.
- **Impact:** Caught from `git status` before committing and reverted with `git checkout`; nothing reached the branch. About 2 minutes.
- **Correction / remaining risk:** Only edited files are formatted from now on. None.
