### A-839 — 2026-11-19 — invalid worktree path blocked publication command

- **Status / attribution:** Confirmed agent command-construction error; no Git or repository state changed.
- **What failed:** I supplied the worktree path with an unescaped backslash sequence in the tool argument, so the execution service rejected the working directory before creating a process.
- **Impact:** The first attempt to publish the already committed W2 corrections did not run.
- **Correction / remaining risk:** Corrected the worktree path in the next invocation; no remote update occurred from the rejected call. Low.
