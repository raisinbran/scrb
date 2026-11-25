### A-1166 — 2026-11-25 — Claude Code (Sonnet 5.5) / Mac desktop — UI batch 2: BSD sed failure and check run before install
- **Agent:** Claude (Sonnet 5.5, Mac desktop worktree session)
- **Status / attribution:** Confirmed agent error; no application defect.
- **What failed:** A GNU-style `sed -i` failed on macOS and I committed before noticing, so one commit briefly had stale test labels; I then ran `npm run check` before `npm install` in the fresh worktree, so it failed on missing `tsc`.
- **Impact:** One extra fix commit and one wasted check run; nothing pushed in a broken state.
- **Correction / remaining risk:** Fixed with `sed -i ''` and installed dependencies first. No remaining risk.
- **Also:** I reported `npm run check` as passing after adding a clip-player test without rerunning it; the new test had a type error and was pushed. Fixed in the next commit after the check was rerun.
- **Also:** I fixed a smoke test with a line-number `sed` that replaced the wrong line (the Enter press), pushed it, and CI failed again; I should have viewed the diff and run the spec locally first.
