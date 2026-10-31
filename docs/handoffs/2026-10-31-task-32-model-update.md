# Task 32 — offline-safe model updates and revert

**Type:** Diff. **Base main:** 7790843. **Status:** design/handoff; actual model install/revert code remains outstanding because Task 31's verified model manifest and installed-path registry are not implemented yet.

## Required algorithm

- `checkModelUpdates` compares installed pinned model role/version/hash against a locally verified **signed or release-pinned manifest**; it must never trigger an unsolicited download or silently switch active model paths.
- `installModelUpdate({role})`: owner action only, stream into an isolated staging folder with a maximum size, checksum and trust-root verification. Hold a per-role lock and a global "one large model at a time" lock. Leave current active model intact until a verified version is ready. Atomically switch an app-owned pointer and retain one known-good previous version.
- `revertModel({role})`: verify that previous-version bytes/hash exist before switching. Perform a reversible atomic pointer update. On restart after a crash, prefer the last **fully verified** model; never use incomplete staging.
- A speaker model update that invalidates profiles must require explicit confirmation and must not silently rebuild or discard embeddings; model-trial and profile-rebuild functionality remain deferred.
- Restarting transcription workers may use a new model only for a **new** meeting/pass, not mid-job; no model-update action can interrupt capture.

## Required tests

Fake local server: valid update, missing checksum, corrupted/oversized response, TLS/redirect denial, disk full, cancellation, crash before/after pointer switch, failed reversion, no previous version, concurrent updates, old-model preservation. Confirm offline operation after setup and UI `modelDownloadProgress` event behavior.

**Recommendation:** don't implement model downloads with arbitrary remote URLs until Task 31's reviewed checksum manifest is frozen. **Not run:** npm, model downloads, GPU, OS installers and native tests. Contract unchanged.
