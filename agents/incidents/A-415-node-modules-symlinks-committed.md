### A-415 — 2026-11-15 — Claude Code (Sonnet 5.5) / Mac desktop — local node_modules symlinks committed with `git add -A`
- **Status / attribution:** Confirmed agent error. Found from failing CI and fixed on the same PR. No product defect.
- **What failed:** While finishing a rebase of the voice preview slice 2 branch, `git add -A apps packages` also staged the worktree's untracked `node_modules` symlinks (made to share dependencies with another checkout), and they were pushed.
- **Impact:** Both CI jobs on PR #303 failed at `npm ci` (ELOOP) for one push. No merge was affected.
- **Source evidence:** CI run 43705339292, `npm error ELOOP ... packages/transcription/node_modules/@types/node`.
- **Correction / remaining risk:** Symlinks removed from the commit; files are now staged by explicit path. Low risk.
