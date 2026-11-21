### A-950 — 2026-11-20 — Codex Desktop — Mac package formatting passed a shell script to Prettier

- **Status / attribution:** Confirmed agent-caused invocation error; package script was not modified by the failed formatter.
- **What failed:** Prettier was given `scripts/package-mac.sh`, for which it has no parser.
- **Impact:** The chained test command did not run on that attempt.
- **Correction / remaining risk:** Re-ran Prettier only on the JavaScript and TypeScript files, then the focused verifier tests passed. Low.

- **Incident-ID correction (2026-11-20):** Former provisional A-887 was reassigned to A-950 because open PRs #376/#377 independently reserve A-886–A-893 for different Windows events. The original evidence remains in the PR's commit history; the underlying mistake and attribution are unchanged.
