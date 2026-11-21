### A-1018 — 2026-11-21 — Cloud — Mac AMI portability regression assumed a noncanonical temporary path

- **Attribution:** Confirmed self-induced test expectation error in the cloud-authored Mac AMI runner portability PR #403.
- **Observed failure:** The initial automated macOS check, run [44889149203](https://github.com/raisinbran/scrb/actions/runs/44889149203), failed two new assertions in `scripts/ami-remote-workspace.test.mjs`. The test expected `/var/folders/...` from the fixture, while `realpath()` returned the canonical `/private/var/folders/...`. Mac tmpdir aliasing is normal; no evidence implicated the runner's canonical-directory containment.
- **Correction:** Updated the two assertions to compare against `realpathSync` of the fixture scratch root and nested dylib, without changing source containment, cleanup or production transcription. A subsequent exact-head CI run is required before approval.
- **Impact:** Two failed synthetic tests on an intermediate automatic CI run; no public AMI inference, native model, installed app, owner audio or source repository cleanup. No manual CI retries or long runs were authorized or initiated.
- **Prevention:** Test canonical containment invariants using canonical paths on macOS, not lexical path equality across OS temp aliases; inspect failed CI before changing product behavior.
- **Publication:** Reported on draft PR #403 only. Verified no A-1018 filename in current `main` and 34 then-open PRs; unmerged local M5/W10 records remain independently inaccessible.
