### A-976 — 2026-11-18 — ChatGPT Chat / cloud — initial PR #361 verification-cache correction was not Prettier-clean
- **What failed:** First correction head `a2868b63578f7388cb666e94e541e853bf5dcd20` passed source self-inspection but macOS CI [run #44413323207](https://github.com/raisinbran/scrb/actions/runs/44413323207) failed the changed-file Prettier check at `apps/desktop/src/main/packaged-setup.ts`: its `stamp` ternary required a single line.
- **Impact:** One preventable red CI attempt and delayed independent review. No model files, application data, private recordings or live devices were touched; no production behavior failure was established by that CI.
- **Agent-controlled cause:** The source was published without access to a local pinned Prettier run, and the manual formatting assumption was incorrect.
- **Correction:** Applied the exact line layout shown in the CI diff and requested fresh exact-head Windows/macOS checks. Other passing evidence must be rechecked at the corrected head.
- **Remaining risk:** Test, typecheck and build results remain unverified until the corrected CI completes. Actual quota cost is unavailable because the chat surface exposes no provider meter.

- **ID reconciliation (2026-11-20 PT):** This is the original PR #361 incident previously recorded as A-785. It was renumbered to A-976 because PR #365 independently reserves A-785 for a different event. The prior heading, narrative and identifier remain recoverable from PR #361 Git history; none of the original event's evidence or attribution was discarded.
