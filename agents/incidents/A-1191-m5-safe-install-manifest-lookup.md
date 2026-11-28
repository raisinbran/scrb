### A-1191 — 2026-11-21 — Codex / Mac — Mac package manifest lookup false mismatch
- **Agent:** Codex (Mac)

During the read-only PR #409 Mac package verification, the first ad hoc checker treated each provenance `artifact` source path as the staged bundle path. That produced 14 false hash mismatches for Whisper libraries because those source paths point outside the packaged bundle. No failure conclusion was reported from that result. The checker was corrected to resolve staged paths by the provenance `name` under `Contents/Resources/bin`; all 25 staged native binary hashes then matched the recorded staged hashes.

**Effect:** one extra read-only verification attempt; no application, package, or production data was changed.

**Correction:** use the staged-name field for bundle paths and keep source-input hashes distinct from staged-binary hashes.

**Remaining risk:** none for the verified 25 staged binaries. The incident number remains pending cross-machine collision reconciliation before publication.
