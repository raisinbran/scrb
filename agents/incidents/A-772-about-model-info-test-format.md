### A-772 — 2026-11-18 — ChatGPT Chat / cloud — About inventory test import was not Prettier formatted
- **What failed:** The initial PR #361 head included a multiline `node:fs` test import that Prettier collapsed to one line; Windows CI stopped at the changed-file format check before typecheck or tests.
- **Impact:** One preventable red CI attempt and delayed independent review; no application or private-data impact.
- **Agent-controlled cause:** The newly authored test was not checked with the project's exact formatter before publication; the cloud execution container lacks its pinned formatter and npm dependencies.
- **Correction:** Update the import to the formatter's observed output and require fresh exact-head macOS/Windows CI.
- **Remaining risk:** Other code failures remain unknown until both jobs finish; do not claim tests passed from the formatting-only failure.
