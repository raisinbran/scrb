### A-892 — 2026-11-20 — W10 — two-track regression smoke setup

- **What failed:** The first run of a new two-track final-pass regression test expected the audio input kind to be `microphone`; the runner contract represents it as `mic`. The temporary source backup was placed under the account temp directory, and cleanup was denied by its access policy.
- **Impact:** The first run had 24 passing assertions and one test assertion failure caused by the fixture expectation. The original tracked test file was restored; one backup copy may remain in the restricted temp directory. No recording was created or accessed.
- **Correction / remaining risk:** The assertion now expects the runner's `mic` kind. Subsequent validation will use a backup inside the authorized workspace and restore the checkout in a `finally` block. The first failure was a test-fixture mismatch, not an application failure; temp-file cleanup remains unverified.
