### A-949 — 2026-11-20 — Codex Desktop — Mac packaged-copy verification used the unqualified Node command

- **Status / attribution:** Confirmed agent-caused command error; no files were changed.
- **What failed:** A read-only bundle comparison invoked `node` without the repository's configured Node path, so zsh stopped before running the comparison.
- **Impact:** One no-op diagnostic attempt.
- **Correction / remaining risk:** Re-ran with `/Users/brandonchen/.local/share/scrb-node/current/bin/node`; the source and packaged renderer comparison completed. Low.

- **Incident-ID correction (2026-11-20):** Former provisional A-886 was reassigned to A-949 because open PRs #376/#377 independently reserve A-886–A-893 for different Windows events. The original evidence remains in the PR's commit history; the underlying mistake and attribution are unchanged.
