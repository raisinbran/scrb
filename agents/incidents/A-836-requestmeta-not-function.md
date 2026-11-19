### A-836 — 2026-11-18 — current-turn metadata lookup called a non-function

- **Status / attribution:** Confirmed agent tooling error; no repository state changed.
- **What failed:** I called `nodeRepl.requestMeta()` although the current node-repl surface does not expose that method.
- **Impact:** No model/effort metadata was retrieved by that attempt.
- **Correction / remaining risk:** Preserve the task's verified model/effort only where recorded; report this continuation's model/effort as unavailable if the active-turn metadata surface remains inaccessible. Low.
