### A-1178 — 2026-11-25 — Claude — A raw NUL byte was written into prompts.ts

- **Agent:** Claude (Sonnet 5.5, Regiurn Windows local session)
- **What failed:** A scripted edit meant to write the text `\u0000` wrote an actual NUL byte, so `grep` treated the file as binary.
- **Evidence:** `grep` reported "Binary file matches"; `git diff` showed `^@`.
- **Impact:** Caught before commit; fixed with a second scripted edit. One extra diagnostic step.
- **Correction / remaining risk:** Check edited text files for control bytes. Low.
