### A-1193 — 2026-11-21 — Codex / Mac — disposable rehearsal hash assertion typo
- **Agent:** Codex (Mac)

The first disposable rollback rehearsal command stopped after copying the verified backup into the temporary simulated app slot because its hard-coded expected hash contained a transcription typo. It did not rename or modify the copy. I recomputed the source and slot hashes, confirmed they matched, then completed the candidate swap, simulated hash rejection, preserved the rejected candidate, and restored the rollback copy with the original hash and valid signature.

**Effect:** one failed rehearsal command and a corrected retry; no production app or user data was changed.

**Correction:** compare against the measured backup hash rather than manually retyping it.

**Remaining risk:** none for the recorded disposable-copy rehearsal. Production replacement remains unauthorized.
