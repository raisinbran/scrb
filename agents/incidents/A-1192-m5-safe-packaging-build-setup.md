### A-1192 — 2026-11-21 — Codex / Mac — isolated Mac package build setup
- **Agent:** Codex (Mac)

During the PR #409 build-only preparation, the initial detached-worktree command could not write shared Git worktree metadata under the restricted shell and succeeded after using the authorized host context. An offline lockfile install then stopped because one package tarball was not cached; the exact locked install succeeded online in the isolated worktree. The first package build was denied access to the host compiler cache. Its authorized retry built the app, then provenance generation stopped because the clean worktree lacked the two pinned FFmpeg/Opus source archives. I copied those archives from a known local source location only after both SHA-256 values matched the repository-pinned values, then ran provenance generation, signing verification, and packaging successfully.

**Effect:** extra setup/build attempts; the first package invocation did not produce a complete package. No production app or library was changed.

**Correction:** use the authorized host context for the isolated worktree/build and stage only source archives whose pinned hashes match.

**Remaining risk:** no identified packaging failure remains for the current-main preparation package. Its source is not the eventual `FINAL_RC_SHA`, and in-app idle is still unverified.
