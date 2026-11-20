### A-886 — 2026-11-20 — Codex Desktop — Mac packaged-copy verification used the unqualified Node command

- **Status / attribution:** Confirmed agent-caused command error; no files were changed.
- **What failed:** A read-only bundle comparison invoked `node` without the repository's configured Node path, so zsh stopped before running the comparison.
- **Impact:** One no-op diagnostic attempt.
- **Correction / remaining risk:** Re-ran with `/Users/brandonchen/.local/share/scrb-node/current/bin/node`; the source and packaged renderer comparison completed. Low.
