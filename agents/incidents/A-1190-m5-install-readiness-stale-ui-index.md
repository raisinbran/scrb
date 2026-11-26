### A-1190 — 2026-11-21 — Codex / Mac — stale Activity Monitor accessibility index
- **Agent:** Codex (Mac)

During the read-only M5 install-readiness check, a follow-up Activity Monitor filter used an accessibility element index from an earlier tree after the tree had changed. The UI tool rejected the stale index. I reacquired the current tree and completed the named process filters. No app controls, Scribe windows, recordings, or user data were opened or changed.

**Effect:** one failed UI query and one corrected retry.

**Correction:** reacquire the accessibility tree and derive the current search-field index after each UI update.

**Remaining risk:** none from the query error. Scribe's process being present means recording/final-pass idleness remains unverified; no swap or installation was attempted.
