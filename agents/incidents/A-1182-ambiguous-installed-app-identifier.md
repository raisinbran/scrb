### A-1182 — 2026-11-17 — Codex / Mac — ambiguous installed-app identifier
- **Agent:** Codex (Mac)
- **Status / attribution:** Confirmed agent error; no product defect.
- **What failed:** The first Computer Use lookup selected Scribe by bundle identifier. Three installed/worktree bundles shared that identifier, so the selector failed as ambiguous.
- **Impact:** One failed lookup and avoidable delay; no app launch, recording, or data change occurred.
- **Correction / remaining risk:** Selected the installed bundle by its exact `/Applications/Scribe.app` path and continued with read-only build inspection. Low.
