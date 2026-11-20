### A-887 — 2026-11-20 — Codex Desktop — Mac package formatting passed a shell script to Prettier

- **Status / attribution:** Confirmed agent-caused invocation error; package script was not modified by the failed formatter.
- **What failed:** Prettier was given `scripts/package-mac.sh`, for which it has no parser.
- **Impact:** The chained test command did not run on that attempt.
- **Correction / remaining risk:** Re-ran Prettier only on the JavaScript and TypeScript files, then the focused verifier tests passed. Low.
