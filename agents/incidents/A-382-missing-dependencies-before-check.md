### A-382 — 2026-11-14 — Codex — Full check started before installing worktree dependencies

- **Status / attribution:** Confirmed agent error; no application defect.
- **What failed:** I ran `npm run check` in PR #232's isolated worktree before installing its locked dependencies. The check stopped in workspace typechecking with `tsc: command not found`.
- **Impact:** One unsuccessful check attempt and a short delay; no repository or user-data effect.
- **Correction / remaining risk:** Installed dependencies with `npm ci` in the worktree and reran the full check. Typecheck, lint and tests passed; the register step then reported unrelated existing register issues. None from the missing-dependency setup remains.
