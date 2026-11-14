### A-371 — 2026-11-14 — Codex / Mac desktop — zsh kept the PR-ref list as one argument
- **Status / attribution:** Confirmed agent command error; no application defect.
- **What failed:** A read-only incident scan expanded a newline-delimited scalar in zsh, which kept the fetched PR refs in one argument and made Git reject the combined string.
- **Impact:** The duplicate-ID scan did not run; no repository files were changed by the command.
- **Correction / remaining risk:** Split the refs into a zsh array before passing them to Git. Low.
