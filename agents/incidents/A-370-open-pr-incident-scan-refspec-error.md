### A-370 — 2026-11-14 — Codex / Mac desktop — incident scan used a ref namespace instead of fetched refs
- **Status / attribution:** Confirmed agent command error; no application defect.
- **What failed:** A read-only duplicate-ID scan passed the parent namespace `refs/codex/incident-audit` as a Git revision instead of enumerating its fetched per-PR refs, so Git could not resolve it.
- **Impact:** That scan did not run; no repository files were changed by the command.
- **Correction / remaining risk:** Enumerated the fetched PR refs with `git for-each-ref` and reran the scan against each ref. Low.
