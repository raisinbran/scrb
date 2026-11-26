### A-1177 — 2026-11-25 — Claude — Prettier write over a whole folder reformatted 14 unrelated files

- **Agent:** Claude (Sonnet 5.5, Regiurn Windows local session)
- **What failed:** I ran `prettier --write` on `eval/model-test/*.ts` instead of only the files I had changed.
- **Evidence:** `git status` showed 14 unchanged-intent files modified.
- **Impact:** None published; reverted with `git checkout` before commit.
- **Correction / remaining risk:** Format only named files. Low.
